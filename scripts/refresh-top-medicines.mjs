const serviceRoleKey =
  process.env.SUPABASE_SERVICE_KEY
  || process.env.SUPABASE_SERVICE_ROLE_KEY
  || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const maxMedicines = 100
const priceCacheTtlMs = 7 * 24 * 60 * 60 * 1000
const requestTimeoutMs = 10000
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
    search: (query) => `https://pharmeasy.in/api/search/search/?q=${encodeURIComponent(query)}`,
    jsonSearch: true,
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
  const maxAttempts = 3
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
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
        if (attempt === maxAttempts || ![408, 429, 500, 502, 503, 504].includes(response.status)) throw error
        await new Promise((resolve) => setTimeout(resolve, 300 * attempt))
        continue
      }
      if (response.status === 204) return null
      const body = await response.text()
      if (!body.trim() && options.headers?.Prefer?.includes('return=minimal')) return null
      if (!body.trim()) throw new Error(`Supabase returned an empty response for ${path}.`)
      try {
        return JSON.parse(body)
      } catch (error) {
        if (attempt === maxAttempts) {
          throw new Error(`Supabase returned invalid JSON for ${path}.`, { cause: error })
        }
      }
    } catch (error) {
      if (attempt === maxAttempts || error.status) throw error
      if (error.message?.startsWith('Supabase returned invalid JSON')) throw error
      if (error.message?.startsWith('Supabase returned an empty response')) {
        if (attempt === maxAttempts) throw error
      }
      await new Promise((resolve) => setTimeout(resolve, 300 * attempt))
    }
  }
  throw new Error(`Supabase request failed after ${maxAttempts} attempts for ${path}.`)
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
  const brandTokens = [...new Set(tokens(medicine.brand_name))]
  const saltTokens = [...new Set(tokens(medicine.salt_composition ?? ''))]
  const brandMatches = brandTokens.filter((token) => productTokens.has(token)).length
  const saltMatches = saltTokens.filter((token) => productTokens.has(token)).length
  if (brandTokens.length === 0 || brandMatches === 0) return false
  return brandTokens.length === 1 || brandMatches + saltMatches >= Math.min(2, brandTokens.length + saltTokens.length)
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
        Accept: platform.jsonSearch ? 'application/json, text/plain, */*' : 'text/html,application/xhtml+xml',
        ...(platform.jsonSearch
          ? { Origin: 'https://pharmeasy.in', Referer: 'https://pharmeasy.in/' }
          : {}),
      },
      signal: controller.signal,
    })
    if (!response.ok) {
    const error = new Error(`${platform.name} search returned HTTP ${response.status}`)
    error.status = response.status
    throw error
    }
    const body = await response.text()
    let offers
    if (platform.jsonSearch) {
      const results = JSON.parse(body)
      offers = (Array.isArray(results?.data?.products) ? results.data.products : [])
        .filter((product) => (
          product?.productAvailabilityFlags?.isAvailable === true
          && isLikelySameProduct(product.name ?? '', medicine)
        ))
        .map((product) => ({
          name: product.name,
          price: Number(product.salePriceDecimal ?? product.assuredDiscountPrice),
        }))
    } else {
      offers = extractOffers(body)
    }
    offers = offers
      .filter((offer) => (
        isLikelySameProduct(offer.name, medicine)
        && Number.isFinite(offer.price)
        && offer.price >= Number(medicine.mrp) * 0.4
        && offer.price <= Number(medicine.mrp) * 1.4
      ))
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
  return Number.isFinite(value) && value >= mrp * 0.4 && value <= mrp * 1.4
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
  select: 'medicine_id,platform_name,price,in_stock,updated_at',
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
const failedRequests = new Map()
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
      priceUpdates.push({ ...cachedPrice, in_stock: true })
      continue
    }
    work.push({ medicine, platform })
  }
}

let nextWorkIndex = 0
const unavailablePlatforms = new Set()
async function refreshWorker() {
  while (nextWorkIndex < work.length) {
    const { medicine, platform } = work[nextWorkIndex]
    nextWorkIndex += 1
    if (unavailablePlatforms.has(platform.id)) continue
    try {
      const price = await fetchPrice(platform, medicine)
      if (price !== null) {
        const priceRecord = {
          medicine_id: medicine.id,
          platform_name: platform.name,
          price,
          in_stock: true,
          updated_at: new Date().toISOString(),
        }
        priceUpdates.push(priceRecord)
        refreshedPrices.set(`${medicine.id}:${platform.id}`, price)
      }
    } catch (error) {
      const key = `${platform.name}: ${error.message}`
      failedRequests.set(key, (failedRequests.get(key) ?? 0) + 1)
      if (error.status === 403 || error.status === 404) unavailablePlatforms.add(platform.id)
    }
  }
}

await Promise.all(
  Array.from({ length: Math.min(maxConcurrentPriceRequests, work.length) }, () => refreshWorker()),
)
for (const [failure, count] of failedRequests) {
  console.warn(`Live price request failure (${count}): ${failure}`)
}

if (priceUpdates.length > 0) {
  await supabaseRequest('pharmacy_prices?on_conflict=medicine_id%2Cplatform_name', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
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
  const patch = {}
  for (const platform of platforms) {
    const column = priceColumn(medicine, platform)
    if (!column) continue
    const livePrice = resolvedPrices.get(platform.id)
    if (livePrice !== undefined && isValidPrice(livePrice, Number(medicine.mrp))) {
      patch[column] = livePrice
    } else if (medicine[column] !== null && medicine[column] !== undefined) {
      patch[column] = null
    }
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
const finalRows = await supabaseRequest(
  `medicines?select=id,price_1mg,price_pharmeasy,price_netmeds,price_apollo,price_truemeds&id=in.(${medicineIds.join(',')})`,
)
const finalCache = await supabaseRequest(`pharmacy_prices?${priceQuery.toString()}`)
if (!Array.isArray(finalRows) || !Array.isArray(finalCache)) {
  throw new Error('Supabase returned an invalid shape while verifying refreshed pharmacy prices.')
}
const mrpByMedicine = new Map(validMedicines.map(({ id, mrp }) => [id, Number(mrp)]))
const storeCounts = new Map(platforms.map(({ name }) => [name, 0]))
const inlineCounts = new Map(platforms.map(({ id }) => [id, 0]))
for (const row of finalCache) {
  const updatedAt = Date.parse(row.updated_at)
  if (
    storeCounts.has(row.platform_name)
    && Number.isFinite(updatedAt)
    && updatedAt >= Date.now() - priceCacheTtlMs
    && updatedAt <= Date.now()
    && isValidPrice(row.price, mrpByMedicine.get(row.medicine_id) ?? 0)
  ) {
    storeCounts.set(row.platform_name, storeCounts.get(row.platform_name) + 1)
  }
}
for (const row of finalRows) {
  for (const platform of platforms) {
    const column = priceColumn(row, platform)
    if (column && isValidPrice(row[column], mrpByMedicine.get(row.id) ?? 0)) {
      inlineCounts.set(platform.id, inlineCounts.get(platform.id) + 1)
    }
  }
}
console.log(`Refreshed/verified ${validMedicines.length} popular medicines in Supabase`)
console.log('Fresh pharmacy_prices counts:', Object.fromEntries(storeCounts))
console.log('Valid inline price counts:', Object.fromEntries(inlineCounts))
console.log(`Upserted ${priceUpdates.length} live pharmacy cache rows; scrape failures: ${failedRequests.size} distinct failure type(s).`)
