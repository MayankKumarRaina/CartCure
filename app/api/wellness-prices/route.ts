import { NextResponse } from 'next/server'
import type { WellnessPartnerId } from '@/lib/data'

type WellnessPriceRequest = {
  name: string
  salt: string
  rxRequired: boolean
}

type ProductOffer = {
  name: string
  price: number
  available: boolean
}

const PARTNER_SEARCH_URLS: Record<WellnessPartnerId, (query: string) => string> = {
  healthkart: (query) => `https://www.healthkart.com/search?search=${encodeURIComponent(query)}`,
  truebasics: (query) => `https://www.truebasics.com/search?q=${encodeURIComponent(query)}`,
}

const NON_WELLNESS_TERMS = /\b(injection|infusion|antibiotic|antibiotics|schedule\s*h|prescription|rx)\b/i
const IGNORED_MATCH_TOKENS = new Set([
  'tablet', 'tablets', 'capsule', 'capsules', 'cap', 'syrup', 'drops', 'drop',
  'injection', 'injections', 'oral', 'strip', 'pack', 'of', 'mg', 'mcg', 'g',
  'ml', 'iu', 'pr', 'sr', 'er',
])

function isWellnessRequest(value: unknown): value is WellnessPriceRequest {
  if (typeof value !== 'object' || value === null) return false
  if (!('name' in value) || !('salt' in value) || !('rxRequired' in value)) return false
  return typeof value.name === 'string'
    && value.name.trim().length > 0
    && value.name.length <= 200
    && typeof value.salt === 'string'
    && value.salt.length <= 500
    && typeof value.rxRequired === 'boolean'
}

function normalizedTokens(value: string): string[] {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/)
    .filter((token) => token.length > 1 && !IGNORED_MATCH_TOKENS.has(token) && !/^\d+$/.test(token))
}

function matchesMedicine(productName: string, medicine: WellnessPriceRequest): boolean {
  const productTokens = new Set(normalizedTokens(productName))
  const medicineTokens = [...new Set([
    ...normalizedTokens(medicine.name),
    ...normalizedTokens(medicine.salt),
  ])]
  if (medicineTokens.length === 0) return false
  const matchCount = medicineTokens.filter((token) => productTokens.has(token)).length
  return matchCount >= Math.min(2, medicineTokens.length)
}

function productPrice(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[,\s₹]/g, ''))
    if (Number.isFinite(parsed) && parsed > 0) return parsed
  }
  return null
}

function extractOffers(value: unknown, offers: ProductOffer[]) {
  if (Array.isArray(value)) {
    for (const entry of value) extractOffers(entry, offers)
    return
  }
  if (typeof value !== 'object' || value === null) return

  const record = value as Record<string, unknown>
  const type = record['@type']
  const types = Array.isArray(type) ? type : [type]
  const isProduct = types.some((entry) => (
    typeof entry === 'string' && (entry === 'Product' || entry.endsWith('/Product'))
  ))
  if (isProduct && typeof record.name === 'string') {
    const offerValues = Array.isArray(record.offers) ? record.offers : [record.offers]
    for (const offer of offerValues) {
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
      const price = productPrice(offerRecord.price ?? offerRecord.lowPrice ?? specifiedPrice)
      if (price === null) continue
      const availability = String(offerRecord.availability ?? '').toLowerCase()
      offers.push({
        name: record.name,
        price,
        available: !availability.includes('outofstock') && !availability.includes('soldout'),
      })
    }
  }

  for (const child of Object.values(record)) extractOffers(child, offers)
}

function parseProductOffers(html: string): ProductOffer[] {
  const offers: ProductOffer[] = []
  const scripts = html.matchAll(
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )
  for (const [, content] of scripts) {
    try {
      extractOffers(JSON.parse(content), offers)
    } catch {
      continue
    }
  }
  return offers
}

async function lookupPrice(partnerId: WellnessPartnerId, query: string, medicine: WellnessPriceRequest) {
  const response = await fetch(PARTNER_SEARCH_URLS[partnerId](query), {
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'User-Agent': 'Mozilla/5.0 (compatible; DawaDaam/1.0)',
    },
    signal: AbortSignal.timeout(10000),
  })
  if (!response.ok) throw new Error(`${partnerId} search returned HTTP ${response.status}`)
  const html = await response.text()
  const offers = parseProductOffers(html)
  if (offers.length === 0) throw new Error(`${partnerId} search returned no structured product offers`)
  const product = offers
    .filter((offer) => offer.available && matchesMedicine(offer.name, medicine))
    .sort((a, b) => a.price - b.price)[0]
  return product?.price ?? null
}

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'A valid JSON request body is required.' }, { status: 400 })
  }

  if (!isWellnessRequest(body)) {
    return NextResponse.json(
      { error: 'name, salt, and rxRequired must describe a valid medicine.' },
      { status: 400 },
    )
  }

  if (
    body.rxRequired
    || NON_WELLNESS_TERMS.test(`${body.name} ${body.salt}`)
  ) {
    return NextResponse.json({
      prices: { healthkart: null, truebasics: null },
      errors: [],
    })
  }

  const query = `${body.name} ${body.salt}`.trim()
  const partnerIds: WellnessPartnerId[] = ['healthkart', 'truebasics']
  const results = await Promise.all(partnerIds.map(async (id) => {
    try {
      return { id, price: await lookupPrice(id, query, body), error: false }
    } catch (error) {
      console.error(`Unable to check ${id} availability for ${body.name}:`, error)
      return { id, price: null, error: true }
    }
  }))

  return NextResponse.json({
    prices: Object.fromEntries(results.map(({ id, price }) => [id, price])),
    errors: results.filter(({ error }) => error).map(({ id }) => id),
  })
}
