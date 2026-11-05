import { NextResponse } from 'next/server'
import {
  CATEGORIES,
  type Category,
  type Medicine,
  type MedicineSearchResult,
  type PharmacyPrice,
} from '@/lib/data'
import { mapMedicine } from '@/lib/medicines'
import { supabase } from '@/lib/supabase'

const CACHE_HEADERS = {
  'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
  'CDN-Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
}

function medicineSearchFilter(term: string) {
  const safeTerm = term.replace(/[(),"]/g, ' ').replace(/[\\%_]/g, '\\$&').trim()
  const pattern = `%${safeTerm}%`
  return `brand_name.ilike.${pattern},salt_composition.ilike.${pattern}`
}

function numberParameter(value: string | null, fallback: number, maximum: number) {
  if (value === null) return fallback
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= maximum ? parsed : null
}

async function resolveRows(rows: Medicine[]): Promise<MedicineSearchResult[]> {
  if (rows.length === 0) return []

  const { data: priceRows, error } = await supabase
    .from('pharmacy_prices')
    .select('medicine_id, platform_name, price, in_stock, updated_at')
    .in('medicine_id', rows.map(({ id }) => id))
    .order('updated_at', { ascending: false })
  if (error) throw error

  const pricesByMedicine = new Map<string, PharmacyPrice[]>()
  for (const price of priceRows) {
    const prices = pricesByMedicine.get(price.medicine_id) ?? []
    prices.push(price)
    pricesByMedicine.set(price.medicine_id, prices)
  }

  return rows.map((row) => {
    const pharmacyPrices = pricesByMedicine.get(row.id) ?? []
    const resolved = mapMedicine(row, pharmacyPrices)
    return {
      ...row,
      pharmacyPrices,
      resolvedPrices: resolved.prices,
      livePricePlatforms: resolved.livePricePlatforms ?? [],
      estimatedPricePlatforms: resolved.estimatedPricePlatforms ?? [],
      productUrls: resolved.productUrls,
    }
  })
}

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams
  const query = searchParams.get('q')?.trim() ?? ''
  const categoryValue = searchParams.get('category')?.trim() ?? ''
  const offset = numberParameter(searchParams.get('offset'), 0, 100_000)
  const limit = numberParameter(searchParams.get('limit'), 50, 100)
  const mode = searchParams.get('mode')

  if (
    query.length > 200
    || (categoryValue && !CATEGORIES.includes(categoryValue as Category))
    || offset === null
    || limit === null
    || limit === 0
    || (mode !== null && mode !== 'autocomplete')
    || (mode === 'autocomplete' && !query)
  ) {
    return NextResponse.json({ error: 'Invalid medicine search parameters.' }, { status: 400 })
  }

  try {
    if (mode === 'autocomplete') {
      const pattern = `%${query.replace(/[(),"]/g, ' ').replace(/[\\%_]/g, '\\$&')}%`
      const [brandResult, saltResult] = await Promise.all([
        supabase.from('medicines').select('*').ilike('brand_name', pattern).order('mrp', { ascending: true }).limit(8),
        supabase.from('medicines').select('*').ilike('salt_composition', pattern).order('mrp', { ascending: true }).limit(8),
      ])
      if (brandResult.error) throw brandResult.error
      if (saltResult.error) throw saltResult.error
      const uniqueRows = new Map<string, Medicine>()
      for (const medicine of [...brandResult.data, ...saltResult.data]) uniqueRows.set(medicine.id, medicine)
      return NextResponse.json(
        await resolveRows([...uniqueRows.values()].slice(0, limit)),
        { headers: CACHE_HEADERS },
      )
    }

    let medicineQuery = supabase.from('medicines').select('*')
    if (query) {
      medicineQuery = medicineQuery.or(medicineSearchFilter(query))
    } else if (categoryValue) {
      medicineQuery = medicineQuery.eq('category', categoryValue)
    } else {
      medicineQuery = medicineQuery.in('category', [...CATEGORIES])
    }

    const { data, error } = await medicineQuery
      .order('search_count', { ascending: false })
      .order('id', { ascending: true })
      .range(offset, offset + limit - 1)
    if (error) throw error
    return NextResponse.json(await resolveRows(data), { headers: CACHE_HEADERS })
  } catch (error) {
    console.error('Unable to retrieve medicine search results:', error)
    return NextResponse.json({ error: 'Unable to retrieve medicine search results.' }, { status: 500 })
  }
}
