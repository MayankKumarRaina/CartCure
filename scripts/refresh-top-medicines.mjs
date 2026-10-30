const serviceRoleKey =
  process.env.SUPABASE_SERVICE_KEY
  || process.env.SUPABASE_SERVICE_ROLE_KEY
  || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const maxMedicines = 25

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
    search: (query) => `https://www.1mg.com/search/all?name=${encodeURIComponent(query)}`,
  },
  {
    name: 'PharmEasy',
    search: (query) => `https://pharmeasy.in/search/all?name=${encodeURIComponent(query)}`,
  },
  {
    name: 'Netmeds',
    search: (query) => `https://www.netmeds.com/catalogsearch/result/${encodeURIComponent(query)}/all`,
  },
  {
    name: 'Apollo Pharmacy',
    search: (query) => `https://www.apollopharmacy.in/search-medicines/${encodeURIComponent(query)}`,
  },
  {
    name: 'Truemeds',
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
    throw new Error(`Supabase request failed (${response.status}): ${await response.text()}`)
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
  const response = await fetch(platform.search(query), {
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'User-Agent': 'Mozilla/5.0 (compatible; DawaDaamPriceRefresh/1.0)',
    },
    signal: AbortSignal.timeout(15000),
  })
  if (!response.ok) throw new Error(`${platform.name} search returned HTTP ${response.status}`)
  const offers = extractOffers(await response.text())
    .filter((offer) => isLikelySameProduct(offer.name, medicine) && offer.price <= medicine.mrp)
    .sort((a, b) => a.price - b.price)
  return offers[0]?.price ?? null
}

const popular = await supabaseRequest('rpc/get_weekly_popular_medicines', {
  method: 'POST',
  body: '{}',
})
const medicineIds = [...new Set(popular.map((row) => row.medicine_id))].slice(0, maxMedicines)
if (medicineIds.length === 0) {
  console.log('No weekly popular medicines to refresh.')
  process.exit(0)
}

const encodedIds = `(${medicineIds.join(',')})`
const medicineQuery = new URLSearchParams({
  select: 'id,brand_name,salt_composition,mrp',
  id: `in.${encodedIds}`,
})
const medicines = await supabaseRequest(`medicines?${medicineQuery.toString()}`)
let updated = 0
let unavailable = 0
let failures = 0

for (const medicine of medicines) {
  for (const platform of platforms) {
    try {
      const price = await fetchPrice(platform, medicine)
      if (price === null) {
        unavailable += 1
        console.log(`${medicine.brand_name} — ${platform.name}: no matching offer`)
        continue
      }
      await supabaseRequest('pharmacy_prices?on_conflict=medicine_id%2Cplatform_name', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify([{
          medicine_id: medicine.id,
          platform_name: platform.name,
          price,
          updated_at: new Date().toISOString(),
        }]),
      })
      updated += 1
      console.log(`${medicine.brand_name} — ${platform.name}: ₹${price}`)
    } catch (error) {
      failures += 1
      console.error(`${medicine.brand_name} — ${platform.name}:`, error)
    }
    await new Promise((resolve) => setTimeout(resolve, 350))
  }
}

console.log(JSON.stringify({
  selectedMedicines: medicines.length,
  updatedPrices: updated,
  unavailableOffers: unavailable,
  failures,
}))
if (failures > 0) process.exitCode = 1
