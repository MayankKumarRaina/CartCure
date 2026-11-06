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

function safeSearchTerm(term: string) {
  return term.replace(/[(),"]/g, ' ').replace(/[\\%_]/g, '\\$&').trim()
}

function isStatementTimeout(error: unknown) {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && error.code === '57014'
}

function sortBrandMatches(rows: Medicine[], term: string) {
  const normalizedTerm = term.toLocaleLowerCase()
  return rows.sort((a, b) => {
    const rank = (medicine: Medicine) => {
      const brandName = medicine.brand_name.toLocaleLowerCase()
      if (brandName === normalizedTerm) return 0
      return brandName.startsWith(normalizedTerm) ? 1 : 2
    }

    return rank(a) - rank(b)
      || b.search_count - a.search_count
      || a.brand_name.localeCompare(b.brand_name)
  })
}

async function fetchBrandMatches(term: string, limit: number) {
  const safeTerm = safeSearchTerm(term)
  const [prefixResult, substringResult] = await Promise.all([
    supabase.from('medicines').select('*').ilike('brand_name', `${safeTerm}%`).limit(limit),
    supabase.from('medicines').select('*').ilike('brand_name', `%${safeTerm}%`).limit(limit * 2),
  ])
  if (prefixResult.error) throw prefixResult.error
  if (substringResult.error) throw substringResult.error

  const rowsById = new Map<string, Medicine>()
  for (const medicine of [...prefixResult.data, ...substringResult.data]) {
    rowsById.set(medicine.id, medicine)
  }
  return sortBrandMatches([...rowsById.values()], term)
}

async function fetchBrandPrefix(term: string, limit: number) {
  const safeTerm = safeSearchTerm(term)
  const { data, error } = await supabase
    .from('medicines')
    .select('*')
    .ilike('brand_name', `${safeTerm}%`)
    .limit(limit)
  if (error) throw error
  return data
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
      const rows = query.length < 3
        ? await fetchBrandPrefix(query, limit)
        : await fetchBrandMatches(query, limit)
      return NextResponse.json(
        await resolveRows(rows.slice(0, limit)),
        { headers: CACHE_HEADERS },
      )
    }

    if (query) {
      const brandRows = query.length < 3
        ? await fetchBrandPrefix(query, limit)
        : await fetchBrandMatches(query, limit)
      const resultsById = new Map(brandRows.slice(0, limit).map((medicine) => [medicine.id, medicine]))
      if (query.length >= 3 && resultsById.size < 5) {
        const safeTerm = safeSearchTerm(query)
        const { data: saltRows, error } = await supabase
          .from('medicines')
          .select('*')
          .ilike('salt_composition', `%${safeTerm}%`)
          .limit(limit)
        if (error) throw error
        for (const medicine of saltRows) {
          if (!resultsById.has(medicine.id)) resultsById.set(medicine.id, medicine)
        }
      }

      const matchingRows = query.length >= 3
        ? [...sortBrandMatches(
          [...resultsById.values()].filter((medicine) => medicine.brand_name.toLocaleLowerCase().includes(query.toLocaleLowerCase())),
          query,
        ), ...[...resultsById.values()].filter((medicine) => !medicine.brand_name.toLocaleLowerCase().includes(query.toLocaleLowerCase()))]
        : [...resultsById.values()]
      return NextResponse.json(
        await resolveRows(matchingRows.slice(offset, offset + limit)),
        { headers: CACHE_HEADERS },
      )
    }

    let medicineQuery = supabase.from('medicines').select('*')
    if (categoryValue) {
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
    if (query && isStatementTimeout(error)) {
      try {
        const rows = await fetchBrandPrefix(query, limit)
        return NextResponse.json(
          await resolveRows(rows.slice(offset, offset + limit)),
          { headers: CACHE_HEADERS },
        )
      } catch (fallbackError) {
        console.error('Unable to retrieve medicine search results after a statement timeout:', fallbackError)
        return NextResponse.json({ error: 'Unable to retrieve medicine search results.' }, { status: 500 })
      }
    }
    console.error('Unable to retrieve medicine search results:', error)
    return NextResponse.json({ error: 'Unable to retrieve medicine search results.' }, { status: 500 })
  }
}
