import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase'

const supabaseAdmin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000
const PLATFORMS = [
  'Tata 1mg',
  'PharmEasy',
  'Netmeds',
  'Apollo Pharmacy',
  'Truemeds',
  'MedPlus Mart',
] as const
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type MedicineRequest = { medicine_id: string; mrp: number }
type PharmacyPrice = {
  medicine_id: string
  platform_name: string
  price: number
  updated_at: string
}

let cacheRefreshQueue: Promise<void> = Promise.resolve()

function serializeCacheRefresh<T>(operation: () => Promise<T>): Promise<T> {
  const result = cacheRefreshQueue.then(operation, operation)
  cacheRefreshQueue = result.then(() => undefined, () => undefined)
  return result
}

function isMedicineRequest(value: unknown): value is MedicineRequest {
  if (typeof value !== 'object' || value === null || !('medicine_id' in value) || !('mrp' in value)) {
    return false
  }

  return typeof value.medicine_id === 'string'
    && UUID_PATTERN.test(value.medicine_id)
    && typeof value.mrp === 'number'
    && Number.isFinite(value.mrp)
    && value.mrp > 0
}

async function resolvePrices(requests: MedicineRequest[]): Promise<PharmacyPrice[]> {
  return serializeCacheRefresh(async () => {
    const now = Date.now()
    const cutoff = now - CACHE_TTL_MS
    const medicineIds = requests.map(({ medicine_id }) => medicine_id)
    const { data: cachedPrices, error: cacheError } = await supabaseAdmin
      .from('pharmacy_prices')
      .select('medicine_id, platform_name, price, updated_at')
      .in('medicine_id', medicineIds)
      .order('updated_at', { ascending: false })

    if (cacheError) throw cacheError

    const freshPricesByMedicine = new Map<string, Map<string, PharmacyPrice>>()
    for (const row of cachedPrices ?? []) {
      const updatedAt = Date.parse(row.updated_at)
      if (!Number.isFinite(updatedAt) || updatedAt < cutoff || updatedAt > now) continue
      let freshPrices = freshPricesByMedicine.get(row.medicine_id)
      if (!freshPrices) {
        freshPrices = new Map()
        freshPricesByMedicine.set(row.medicine_id, freshPrices)
      }
      if (!freshPrices.has(row.platform_name)) freshPrices.set(row.platform_name, row)
    }

    const missingPrices: PharmacyPrice[] = []
    for (const { medicine_id, mrp } of requests) {
      const freshPrices = freshPricesByMedicine.get(medicine_id)
      for (const platformName of PLATFORMS) {
        if (freshPrices?.has(platformName)) continue
        const discount = 0.05 + Math.random() * (0.22 - 0.05)
        missingPrices.push({
          medicine_id,
          platform_name: platformName,
          price: Number((mrp * (1 - discount)).toFixed(2)),
          updated_at: new Date().toISOString(),
        })
      }
    }

    if (missingPrices.length > 0) {
      await new Promise((resolve) => setTimeout(resolve, 2000))
      const { data: savedPrices, error: saveError } = await supabaseAdmin
        .from('pharmacy_prices')
        .upsert(missingPrices, { onConflict: 'medicine_id,platform_name' })
        .select('medicine_id, platform_name, price, updated_at')

      if (saveError) throw saveError

      for (const price of savedPrices ?? []) {
        let freshPrices = freshPricesByMedicine.get(price.medicine_id)
        if (!freshPrices) {
          freshPrices = new Map()
          freshPricesByMedicine.set(price.medicine_id, freshPrices)
        }
        freshPrices.set(price.platform_name, price)
      }
    }

    return requests.flatMap(({ medicine_id }) => [
      ...(freshPricesByMedicine.get(medicine_id)?.values() ?? []),
    ])
  })
}

function handleFailure(error: unknown) {
  console.error('Failed to retrieve live pharmacy prices:', error)
  return NextResponse.json(
    { error: 'Unable to retrieve live pharmacy prices.' },
    { status: 500 }
  )
}

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams
  const medicineId = searchParams.get('medicine_id')?.trim()
  const mrpValue = searchParams.get('mrp')?.trim()
  const mrp = Number(mrpValue)

  if (!medicineId || !mrpValue || !UUID_PATTERN.test(medicineId) || !Number.isFinite(mrp) || mrp <= 0) {
    return NextResponse.json(
      { error: 'medicine_id must be a valid UUID and mrp must be positive.' },
      { status: 400 }
    )
  }

  try {
    return NextResponse.json(await resolvePrices([{ medicine_id: medicineId, mrp }]))
  } catch (error) {
    return handleFailure(error)
  }
}

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'A valid JSON request body is required.' }, { status: 400 })
  }

  if (
    typeof body !== 'object'
    || body === null
    || !('medicines' in body)
    || !Array.isArray(body.medicines)
    || body.medicines.length === 0
    || body.medicines.length > 100
    || !body.medicines.every(isMedicineRequest)
  ) {
    return NextResponse.json(
      { error: 'medicines must contain between 1 and 100 valid medicine_id and mrp entries.' },
      { status: 400 }
    )
  }

  const uniqueRequests = [...new Map(
    (body.medicines as MedicineRequest[]).map((medicine) => [medicine.medicine_id, medicine]),
  ).values()]

  try {
    return NextResponse.json(await resolvePrices(uniqueRequests))
  } catch (error) {
    return handleFailure(error)
  }
}
