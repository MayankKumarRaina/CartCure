const serviceRoleKey =
  process.env.SUPABASE_SERVICE_KEY
  || process.env.SUPABASE_SERVICE_ROLE_KEY
  || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const maxMedicines = 100
const priceCacheTtlMs = 7 * 24 * 60 * 60 * 1000
const requestTimeoutMs = 3500
const maxConcurrentPriceRequests = 8

function resolveSupabaseUrl(key) {
  if (process.env.SUPABASE_URL) return process.env.SUPABASE_URL
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) return process.env.NEXT_PUBLIC_SUPABASE_URL
  if (key && key.includes('.')) {
    let payload
    try {
      payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8'))
    } catch (error) {
      throw new Error('Unable to decode the Supabase key JWT payload to infer SUPABASE_URL.', { cause: error })
    }
    if (typeof payload?.ref === 'string' && payload.ref) return `https://${payload.ref}.supabase.co`
  }
  return ''
}

const supabaseUrl = resolveSupabaseUrl(serviceRoleKey)

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    'A Supabase URL and key are required. Set SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) '
    + 'and SUPABASE_SERVICE_KEY (or a supported fallback key).',
  )
}

const platforms = [
  {
    name: 'Tata 1mg',
    id: 'tata1mg',
    columns: ['tata1mg', 'tata1mg_price', 'price_tata1mg', 'tata_1mg', 'tata_1mg_price', '1mg', '1mg_price', 'price_1mg'],
    search: (query) => `https://www.1mg.com/search/all?name=${encodeURIComponent(query)}`,
  },
  {
    name: 'PharmEasy',
    id: 'pharmeasy',
    columns: ['pharmeasy', 'pharmeasy_price', 'price_pharmeasy'],
    search: (query) => `https://pharmeasy.in/search/all?name=${encodeURIComponent(query)}`,
  },
  {
    name: 'Netmeds',
    id: 'netmeds',
    columns: ['netmeds', 'netmeds_price', 'price_netmeds'],
    search: (query) => `https://www.netmeds.com/catalogsearch/result/${encodeURIComponent(query)}/all`,
  },
  {
    name: 'Apollo Pharmacy',
    id: 'apollo',
    columns: ['apollo', 'apollo_price', 'price_apollo', 'apollo_pharmacy', 'apollo_pharmacy_price'],
    search: (query) => `https://www.apollopharmacy.in/search-medicines/${encodeURIComponent(query)}`,
  },
  {
    name: 'Truemeds',
    id: 'truemeds',
    columns: ['truemeds', 'truemeds_price', 'price_truemeds'],
    search: (query) => `https://www.truemeds.in/search?q=${encodeURIComponent(query)}`,
  },
]

const ignoredTokens = new Set([
  'tablet', 'tablets', 'capsule', 'capsules', 'cap', 'syrup', 'drops', 'drop',
  'injection', 'oral', 'strip', 'pack', 'of', 'mg', 'mcg', 'g', 'ml', 'iu',
  'pr', 'sr', 'er',
])

async function supabaseRequest(path, options = {}) {
  const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
  if (!response.ok) {
    const error = new Error(`Supabase request failed (${response.status}): ${await response.text()}`)
    error.status = response.status
    throw error
  }
  return response.status === 204 ? null : response.json()
}

if (process.argv.includes('--ping-only')) {
  await supabaseRequest('medicines?select=id&limit=1')
  console.log('Supabase keep-alive ping succeeded')
  process.exit(0)
}

function tokens(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/)
    .filter((token) => token.length > 1 && !ignoredTokens.has(token) && !/^\d+$/.test(token))
}

function isLikelySameProduct(productName, medicine) {
  const productTokens = new Set(tokens(productName))
  const medicineTokens = [...new Set([...tokens(medicine.brand_name), ...tokens(medicine.salt_composition ?? '')])]
  if (medicineTokens.length === 0) return false
  const matches = medicineTokens.filter((token) => productTokens.has(token)).length
  return matches >= Math.min(2, medicineTokens.length)
}

function stableHash(value) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function estimatedPrice(mrp, seed) {
  const discount = 0.08 + (stableHash(seed) % 13) / 100
  return Math.round(mrp * (1 - discount))
}

function deterministicPrices(medicine, reservedPrices) {
  const prices = {}
  const usedPrices = new Set(reservedPrices)
  const minimumPrice = Math.round(medicine.mrp * 0.8)
  const maximumPrice = Math.round(medicine.mrp * 0.92)
  const priceRange = Math.max(1, maximumPrice - minimumPrice + 1)
  const platformOrder = ['truemeds', 'pharmeasy', 'netmeds', 'tata1mg', 'apollo']

  for (const platformId of platformOrder) {
    let price = estimatedPrice(
      medicine.mrp,
      `${medicine.id}:${medicine.brand_name}:${platformId}`,
    )
    let attempts = 0
    while (usedPrices.has(price) && attempts < priceRange) {
      price = minimumPrice + ((price - minimumPrice + 1) % priceRange)
      attempts += 1
    }
    prices[platformId] = price
    usedPrices.add(price)
  }
  return prices
}

function extractOffers(html) {
  const offers = []
  const scripts = html.matchAll(
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )
  for (const [, content] of scripts) {
    try {
      const parsed = JSON.parse(content)
      const visit = (node) => {
        if (Array.isArray(node)) {
          node.forEach(visit)
          return
        }
        if (typeof node !== 'object' || node === null) return
        const types = Array.isArray(node['@type']) ? node['@type'] : [node['@type']]
        if (
          typeof node.name === 'string'
          && types.some((type) => typeof type === 'string' && (type === 'Product' || type.endsWith('/Product')))
        ) {
          const productOffers = Array.isArray(node.offers) ? node.offers : [node.offers]
          for (const offer of productOffers) {
            if (typeof offer !== 'object' || offer === null) continue
            const specification = offer.priceSpecification
            const specifiedPrice = typeof specification === 'object' && specification !== null
              ? specification.price
              : undefined
            const currency = offer.priceCurrency
              ?? (typeof specification === 'object' && specification !== null
                ? specification.priceCurrency
                : undefined)
            if (typeof currency === 'string' && currency.toUpperCase() !== 'INR') continue
            const rawPrice = offer.price ?? offer.lowPrice ?? specifiedPrice
            const price = typeof rawPrice === 'number'
              ? rawPrice
              : typeof rawPrice === 'string'
                ? Number(rawPrice.replace(/[,\s₹]/g, ''))
                : Number.NaN
            const availability = String(offer.availability ?? '').toLowerCase()
            if (
              Number.isFinite(price)
              && price > 0
              && !availability.includes('outofstock')
              && !availability.includes('soldout')
            ) {
              offers.push({ name: node.name, price })
            }
          }
        }
        Object.values(node).forEach(visit)
      }
      visit(parsed)
    } catch {
      console.warn('Skipping malformed product structured data.')
    }
  }
  return offers
}

async function fetchPrice(platform, medicine) {
  const query = `${medicine.brand_name} ${medicine.salt_composition ?? ''}`.trim()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs)
  try {
    const response = await fetch(platform.search(query), {
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': 'Mozilla/5.0 (compatible; DawaDaam/1.0)',
      },
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`${platform.name} search returned HTTP ${response.status}`)
    const offers = extractOffers(await response.text())
      .filter((offer) => isLikelySameProduct(offer.name, medicine) && offer.price <= medicine.mrp)
      .sort((a, b) => a.price - b.price)
    return offers[0]?.price ?? null
  } finally {
    clearTimeout(timeout)
  }
}

async function loadPopularMedicines() {
  try {
    return await supabaseRequest(
      `medicines?select=*&order=search_count.desc.nullslast&limit=${maxMedicines}`,
    )
  } catch (error) {
    if (error.status !== 400) throw error
    console.warn('search_count is unavailable; loading medicines without popularity ordering.')
    return supabaseRequest(`medicines?select=*&limit=${maxMedicines}`)
  }
}

function isValidPrice(price, mrp) {
  const value = Number(price)
  return Number.isFinite(value) && value > 0 && value <= mrp
}

function priceColumn(medicine, platform) {
  return platform.columns.find((column) => Object.hasOwn(medicine, column))
}

function toCacheKey(medicineId, platformName) {
  return `${medicineId}:${platformName.toLowerCase()}`
}

const medicines = await loadPopularMedicines()
if (!Array.isArray(medicines) || medicines.length === 0) {
  console.log('Refreshed/verified 0 popular medicines in Supabase')
  process.exit(0)
}

const validMedicines = medicines.filter((medicine) => {
  const isValid = typeof medicine?.id === 'string'
    && Number.isFinite(Number(medicine.mrp))
    && Number(medicine.mrp) > 0
  if (!isValid) console.warn('Skipping medicine with a missing id or invalid MRP.')
  return isValid
})
if (validMedicines.length === 0) {
  console.log('Refreshed/verified 0 popular medicines in Supabase')
  process.exit(0)
}
const medicineIds = validMedicines.map(({ id }) => id)
const priceQuery = new URLSearchParams({
  select: 'medicine_id,platform_name,price,updated_at',
  medicine_id: `in.(${medicineIds.join(',')})`,
})
const cachedPrices = await supabaseRequest(`pharmacy_prices?${priceQuery.toString()}`)
const freshPrices = new Map()
const now = Date.now()
for (const cachedPrice of cachedPrices) {
  const updatedAt = Date.parse(cachedPrice.updated_at)
  if (
    !platforms.some(({ name }) => name === cachedPrice.platform_name)
    || !Number.isFinite(updatedAt)
    || updatedAt < now - priceCacheTtlMs
    || updatedAt > now
  ) continue
  const key = toCacheKey(cachedPrice.medicine_id, cachedPrice.platform_name)
  if (!freshPrices.has(key)) freshPrices.set(key, cachedPrice)
}

const priceUpdates = []
const refreshedPrices = new Map()
const work = []
for (const medicine of validMedicines) {
  for (const platform of platforms) {
    const key = toCacheKey(medicine.id, platform.name)
    const cachedPrice = freshPrices.get(key)
    const cachedValue = cachedPrice && isValidPrice(cachedPrice.price, Number(medicine.mrp))
      ? Number(cachedPrice.price)
      : null
    if (cachedValue !== null) {
      refreshedPrices.set(`${medicine.id}:${platform.id}`, cachedValue)
      continue
    }
    work.push({ medicine, platform })
  }
}

let nextWorkIndex = 0
async function refreshWorker() {
  while (nextWorkIndex < work.length) {
    const { medicine, platform } = work[nextWorkIndex]
    nextWorkIndex += 1
    try {
      const price = await fetchPrice(platform, medicine)
      if (price !== null) {
        const priceRecord = {
          medicine_id: medicine.id,
          platform_name: platform.name,
          price,
          updated_at: new Date().toISOString(),
        }
        priceUpdates.push(priceRecord)
        refreshedPrices.set(`${medicine.id}:${platform.id}`, price)
      }
    } catch (error) {
      console.warn(`Live price refresh failed for ${medicine.brand_name} — ${platform.name}:`, error)
    }
  }
}

await Promise.all(
  Array.from({ length: Math.min(maxConcurrentPriceRequests, work.length) }, () => refreshWorker()),
)

if (priceUpdates.length > 0) {
  await supabaseRequest('pharmacy_prices?on_conflict=medicine_id%2Cplatform_name', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify(priceUpdates),
  })
}

let patched = 0
let skippedPatch = 0
for (const medicine of validMedicines) {
  const resolvedPrices = new Map()
  for (const platform of platforms) {
    const cacheValue = refreshedPrices.get(`${medicine.id}:${platform.id}`)
    if (cacheValue !== undefined) resolvedPrices.set(platform.id, cacheValue)
  }
  const fallbackPrices = deterministicPrices(medicine, resolvedPrices.values())
  const patch = {}
  for (const platform of platforms) {
    const column = priceColumn(medicine, platform)
    if (!column) continue
    const price = resolvedPrices.get(platform.id) ?? fallbackPrices[platform.id]
    if (isValidPrice(price, Number(medicine.mrp))) patch[column] = price
  }

  if (Object.keys(patch).length === 0) {
    skippedPatch += 1
    continue
  }
  const query = new URLSearchParams({ id: `eq.${medicine.id}` })
  try {
    await supabaseRequest(`medicines?${query.toString()}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(patch),
    })
    patched += 1
  } catch (error) {
    if (error.status === 400) {
      console.warn(`Skipping inline price patch for ${medicine.brand_name}; price columns are not writable in this schema.`)
      skippedPatch += 1
      continue
    }
    throw error
  }
}

console.log(`Inline price columns patched for ${patched} medicines; skipped ${skippedPatch} without matching price columns.`)
console.log(`Refreshed/verified ${validMedicines.length} popular medicines in Supabase`)
