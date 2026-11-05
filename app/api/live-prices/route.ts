import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { PLATFORMS, type Medicine } from '@/lib/data'
import type { Database } from '@/lib/supabase'

const supabaseAdmin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000
const PLATFORM_NAMES = [
  'Tata 1mg',
  'PharmEasy',
  'Netmeds',
  'Apollo Pharmacy',
  'Truemeds',
] as const
const ACTIVE_PLATFORM_NAMES = new Set<string>(PLATFORM_NAMES)
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EDGE_CACHE_HEADERS = {
  'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
  'CDN-Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
}
type MedicineRequest = { medicine_id: string; mrp: number }
type PharmacyPrice = {
  medicine_id: string
  platform_name: string
  price: number
  in_stock?: boolean | null
  updated_at: string
}

type ProductOffer = {
  name: string
  price: number
  available: boolean
}

const IGNORED_MATCH_TOKENS = new Set([
  'tablet', 'tablets', 'capsule', 'capsules', 'cap', 'syrup', 'drops', 'drop',
  'injection', 'oral', 'strip', 'pack', 'of', 'mg', 'mcg', 'g', 'ml', 'iu',
  'pr', 'sr', 'er',
])

function normalizedTokens(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/)
    .filter((token) => token.length > 1 && !IGNORED_MATCH_TOKENS.has(token) && !/^\d+$/.test(token))
}

function matchesMedicine(productName: string, medicine: Medicine) {
  const productTokens = new Set(normalizedTokens(productName))
  const brandTokens = [...new Set(normalizedTokens(medicine.brand_name))]
  const saltTokens = [...new Set(normalizedTokens(medicine.salt_composition ?? ''))]
  const brandMatches = brandTokens.filter((token) => productTokens.has(token)).length
  const saltMatches = saltTokens.filter((token) => productTokens.has(token)).length
  if (brandTokens.length === 0 || brandMatches === 0) return false
  return brandTokens.length === 1 || brandMatches + saltMatches >= Math.min(2, brandTokens.length + saltTokens.length)
}

function isValidPrice(price: number, mrp: number) {
  return Number.isFinite(price) && price >= mrp * 0.4 && price <= mrp * 1.4
}

function extractProductOffers(value: unknown, offers: ProductOffer[]) {
  if (Array.isArray(value)) {
    for (const entry of value) extractProductOffers(entry, offers)
    return
  }
  if (typeof value !== 'object' || value === null) return

  const record = value as Record<string, unknown>
  const types = Array.isArray(record['@type']) ? record['@type'] : [record['@type']]
  if (
    typeof record.name === 'string'
    && types.some((type) => typeof type === 'string' && (type === 'Product' || type.endsWith('/Product')))
  ) {
    const productOffers = Array.isArray(record.offers) ? record.offers : [record.offers]
    for (const offer of productOffers) {
      if (typeof offer !== 'object' || offer === null) continue
      const offerRecord = offer as Record<string, unknown>
      const specification = offerRecord.priceSpecification
      const specifiedPrice = typeof specification === 'object' && specification !== null
        ? (specification as Record<string, unknown>).price
        : undefined
      const currency = offerRecord.priceCurrency
        ?? (typeof specification === 'object' && specification !== null
          ? (specification as Record<string, unknown>).priceCurrency
          : undefined)
      if (typeof currency === 'string' && currency.toUpperCase() !== 'INR') continue
      const rawPrice = offerRecord.price ?? offerRecord.lowPrice ?? specifiedPrice
      const price = typeof rawPrice === 'number'
        ? rawPrice
        : typeof rawPrice === 'string'
          ? Number(rawPrice.replace(/[,\s₹]/g, ''))
          : Number.NaN
      const availability = String(offerRecord.availability ?? '').toLowerCase()
      if (Number.isFinite(price) && price > 0) {
        offers.push({
          name: record.name,
          price,
          available: !availability.includes('outofstock') && !availability.includes('soldout'),
        })
      }
    }
  }

  for (const child of Object.values(record)) extractProductOffers(child, offers)
}

function parseProductOffers(html: string) {
  const offers: ProductOffer[] = []
  const scripts = html.matchAll(
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )
  for (const [, content] of scripts) {
    try {
      extractProductOffers(JSON.parse(content), offers)
    } catch {
      console.warn('Skipping malformed pharmacy product structured data.')
    }
  }
  return offers
}

function parsePharmEasyOffers(body: string, medicine: Medicine): ProductOffer[] {
  const payload: unknown = JSON.parse(body)
  if (typeof payload !== 'object' || payload === null || !('data' in payload)) return []
  const data = payload.data
  if (typeof data !== 'object' || data === null || !('products' in data) || !Array.isArray(data.products)) {
    return []
  }

  return data.products.flatMap((entry): ProductOffer[] => {
    if (typeof entry !== 'object' || entry === null) return []
    const product = entry as Record<string, unknown>
    const availability = product.productAvailabilityFlags
    if (
      typeof product.name !== 'string'
      || typeof availability !== 'object'
      || availability === null
      || !('isAvailable' in availability)
      || availability.isAvailable !== true
      || !matchesMedicine(product.name, medicine)
    ) return []
    return [{
      name: product.name,
      price: Number(product.salePriceDecimal ?? product.assuredDiscountPrice),
      available: true,
    }]
  })
}

function inlinePriceUpdate(platformId: typeof PLATFORMS[number]['id'], price: number): Partial<Medicine> {
  switch (platformId) {
    case 'tata1mg':
      return { price_1mg: price }
    case 'pharmeasy':
      return { price_pharmeasy: price }
    case 'netmeds':
      return { price_netmeds: price }
    case 'apollo':
      return { price_apollo: price }
    case 'truemeds':
      return { price_truemeds: price }
  }
}

async function scrapePlatformPrice(platformId: typeof PLATFORMS[number]['id'], medicine: Medicine) {
  const platform = PLATFORMS.find(({ id }) => id === platformId)
  if (!platform) throw new Error(`Unknown pharmacy platform: ${platformId}`)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)
  try {
    const query = `${medicine.brand_name} ${medicine.salt_composition ?? ''}`.trim()
    const searchUrl = platformId === 'pharmeasy'
      ? `https://pharmeasy.in/api/search/search/?q=${encodeURIComponent(query)}`
      : platform.searchUrl(query)
    const response = await fetch(searchUrl, {
      headers: {
        Accept: platformId === 'pharmeasy'
          ? 'application/json, text/plain, */*'
          : 'text/html,application/xhtml+xml',
        ...(platformId === 'pharmeasy'
          ? { Origin: 'https://pharmeasy.in', Referer: 'https://pharmeasy.in/' }
          : {}),
      },
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`${platform.name} search returned HTTP ${response.status}`)
    const body = await response.text()
    const offers = platformId === 'pharmeasy'
      ? parsePharmEasyOffers(body, medicine)
      : parseProductOffers(body)
    const matchingOffers = offers
      .filter((offer) => offer.available && isValidPrice(offer.price, medicine.mrp) && matchesMedicine(offer.name, medicine))
      .sort((a, b) => a.price - b.price)
    return matchingOffers[0]?.price ?? null
  } finally {
    clearTimeout(timeout)
  }
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

async function resolveWithScrape(request: MedicineRequest): Promise<PharmacyPrice[]> {
  const cachedPrices = await resolvePrices([request])
  const cachedPlatforms = new Set(cachedPrices.map(({ platform_name }) => platform_name))
  const missingPlatforms = PLATFORMS.filter(({ name }) => !cachedPlatforms.has(name))
  if (missingPlatforms.length === 0) return cachedPrices

  const { data: medicine, error } = await supabaseAdmin
    .from('medicines')
    .select('*')
    .eq('id', request.medicine_id)
    .maybeSingle()
  if (error) throw error
  if (!medicine) return cachedPrices

  const results: (PharmacyPrice | null)[] = await Promise.all(missingPlatforms.map(async (platform) => {
    try {
      const price = await scrapePlatformPrice(platform.id, medicine)
      return price === null ? null : {
        medicine_id: medicine.id,
        platform_name: platform.name,
        price,
        in_stock: true,
        updated_at: new Date().toISOString(),
      }
    } catch (error) {
      console.warn(`Unable to refresh ${platform.name} for ${medicine.brand_name}:`, error)
      return null
    }
  }))
  const scrapedPrices = results.filter((price): price is PharmacyPrice => price !== null)
  if (scrapedPrices.length === 0) return cachedPrices

  const writes = await Promise.all([
    supabaseAdmin
      .from('pharmacy_prices')
      .upsert(scrapedPrices, { onConflict: 'medicine_id,platform_name' }),
    ...scrapedPrices.map((price) => {
      const platform = PLATFORMS.find(({ name }) => name === price.platform_name)
      if (!platform) throw new Error(`Unknown pharmacy platform: ${price.platform_name}`)
      return supabaseAdmin
        .from('medicines')
        .update(inlinePriceUpdate(platform.id, price.price))
        .eq('id', medicine.id)
    }),
  ])
  for (const { error } of writes) {
    if (error) throw error
  }

  return [...cachedPrices, ...scrapedPrices]
}

async function resolvePrices(requests: MedicineRequest[]): Promise<PharmacyPrice[]> {
  const now = Date.now()
  const cutoff = now - CACHE_TTL_MS
  const medicineIds = requests.map(({ medicine_id }) => medicine_id)
  const { data: cachedPrices, error: cacheError } = await supabaseAdmin
    .from('pharmacy_prices')
    .select('medicine_id, platform_name, price, in_stock, updated_at')
    .in('medicine_id', medicineIds)
    .order('updated_at', { ascending: false })

  if (cacheError) throw cacheError

  const latestFreshPrices = new Map<string, PharmacyPrice>()
  for (const row of cachedPrices ?? []) {
    if (!ACTIVE_PLATFORM_NAMES.has(row.platform_name)) continue
    const updatedAt = Date.parse(row.updated_at)
    if (
      !Number.isFinite(updatedAt)
      || updatedAt < cutoff
      || updatedAt > now
      || !isValidPrice(Number(row.price), requests.find(({ medicine_id }) => medicine_id === row.medicine_id)?.mrp ?? 0)
    ) continue
    const key = `${row.medicine_id}:${row.platform_name}`
    if (!latestFreshPrices.has(key)) latestFreshPrices.set(key, row)
  }

  return requests.flatMap(({ medicine_id }) => PLATFORM_NAMES.flatMap((platformName) => {
    const price = latestFreshPrices.get(`${medicine_id}:${platformName}`)
    return price ? [price] : []
  }))
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
    return NextResponse.json(await resolveWithScrape({ medicine_id: medicineId, mrp }), {
      headers: EDGE_CACHE_HEADERS,
    })
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
    return NextResponse.json(
      uniqueRequests.length === 1
        ? await resolveWithScrape(uniqueRequests[0])
        : await resolvePrices(uniqueRequests),
    )
  } catch (error) {
    return handleFailure(error)
  }
}
