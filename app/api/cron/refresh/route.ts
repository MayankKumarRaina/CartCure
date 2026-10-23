import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { PLATFORMS, type Medicine, type PharmacyPrice } from '@/lib/data'
import type { Database } from '@/lib/supabase'

export const runtime = 'nodejs'

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000

function isAuthorized(request: Request, secret: string) {
  const authorization = request.headers.get('authorization') ?? ''
  const suppliedSecret = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
  const expected = Buffer.from(secret)
  const supplied = Buffer.from(suppliedSecret)
  return expected.length === supplied.length && timingSafeEqual(expected, supplied)
}

function createSimulatedPrice(medicine: Medicine, platformName: string, updatedAt: string): PharmacyPrice {
  const discount = 0.05 + Math.random() * (0.22 - 0.05)
  return {
    medicine_id: medicine.id,
    platform_name: platformName,
    price: Number((medicine.mrp * (1 - discount)).toFixed(2)),
    updated_at: updatedAt,
  }
}

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error('CRON_SECRET is not configured.')
    return NextResponse.json({ error: 'Cron authentication is not configured.' }, { status: 500 })
  }
  if (!isAuthorized(request, secret)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Supabase admin credentials are not configured for the cache refresh.')
    return NextResponse.json({ error: 'Cache refresh is not configured.' }, { status: 500 })
  }

  const supabaseAdmin = createClient<Database>(supabaseUrl, serviceRoleKey)
  try {
    const { data: weeklyPopular, error: popularityError } = await supabaseAdmin
      .rpc('get_weekly_popular_medicines')

    if (popularityError) throw popularityError
    if (!weeklyPopular.length) {
      return NextResponse.json({
        selected: 0,
        updated: 0,
        updatedPrices: 0,
        skipped: 0,
        windowDays: 7,
      })
    }

    const { data: medicines, error: medicinesError } = await supabaseAdmin
      .from('medicines')
      .select('*')
      .in('id', weeklyPopular.map(({ medicine_id }) => medicine_id))

    if (medicinesError) throw medicinesError
    if (!medicines.length) {
      return NextResponse.json({
        selected: 0,
        updated: 0,
        updatedPrices: 0,
        skipped: 0,
        windowDays: 7,
      })
    }

    const medicineIds = medicines.map(({ id }) => id)
    const { data: cachedPrices, error: pricesError } = await supabaseAdmin
      .from('pharmacy_prices')
      .select('medicine_id, platform_name, price, updated_at')
      .in('medicine_id', medicineIds)
      .order('updated_at', { ascending: false })

    if (pricesError) throw pricesError

    const latestByMedicine = new Map<string, Map<string, PharmacyPrice>>()
    for (const price of cachedPrices ?? []) {
      const updatedAt = Date.parse(price.updated_at)
      if (!Number.isFinite(updatedAt)) continue
      let platformPrices = latestByMedicine.get(price.medicine_id)
      if (!platformPrices) {
        platformPrices = new Map()
        latestByMedicine.set(price.medicine_id, platformPrices)
      }
      if (!platformPrices.has(price.platform_name)) platformPrices.set(price.platform_name, price)
    }

    const now = Date.now()
    const timestamp = new Date(now).toISOString()
    const stalePrices: PharmacyPrice[] = []
    let skipped = 0

    for (const medicine of medicines) {
      const platformPrices = latestByMedicine.get(medicine.id)
      const staleForMedicine = PLATFORMS
        .filter(({ name }) => {
          const cached = platformPrices?.get(name)
          if (!cached) return true
          const updatedAt = Date.parse(cached.updated_at)
          return !Number.isFinite(updatedAt) || updatedAt < now - CACHE_TTL_MS || updatedAt > now
        })
        .map(({ name }) => createSimulatedPrice(medicine, name, timestamp))

      if (staleForMedicine.length === 0) {
        skipped += 1
      } else {
        stalePrices.push(...staleForMedicine)
      }
    }

    if (stalePrices.length > 0) {
      const { error: upsertError } = await supabaseAdmin
        .from('pharmacy_prices')
        .upsert(stalePrices, { onConflict: 'medicine_id,platform_name' })

      if (upsertError) throw upsertError
    }

    const updated = medicines.length - skipped
    return NextResponse.json({
      selected: medicines.length,
      updated,
      updatedPrices: stalePrices.length,
      skipped,
      windowDays: 7,
      categories: new Set(weeklyPopular.map(({ category }) => category)).size,
    })
  } catch (error) {
    console.error('Failed to refresh popular medicine price cache:', error)
    return NextResponse.json({ error: 'Unable to refresh the popular medicine price cache.' }, { status: 500 })
  }
}
