import { createReadStream } from 'node:fs'
import { access, readFile } from 'node:fs/promises'
import path from 'node:path'
import readline from 'node:readline'

const ROOT = process.cwd()
const PAGE_SIZE = 1000
const BATCH_SIZE = 500
const CONCURRENCY = 5
const FILES = [
  { file: 'drugs_full.csv', kind: 'base' },
  { file: '1mg_products.csv', kind: '1mg' },
  { file: 'netmeds_full.csv', kind: 'netmeds' },
  { file: 'apollopharmacy_full.csv', kind: 'apollo' },
  { file: 'pharmeasy_full.csv', kind: 'pharmeasy' },
  { file: 'healthkart_full.csv', kind: 'healthkart' },
  { file: 'truebasics_full.csv', kind: 'truebasics' },
]
const PRICE_COLUMNS = {
  '1mg': 'price_1mg',
  netmeds: 'price_netmeds',
  apollo: 'price_apollo',
  pharmeasy: 'price_pharmeasy',
  healthkart: 'price_healthkart',
  truebasics: 'price_truebasics',
}
const PORTAL_URL_KEYS = { '1mg': '1mg', netmeds: 'netmeds', apollo: 'apollo', pharmeasy: 'pharmeasy', healthkart: 'healthkart', truebasics: 'truebasics' }
const CATEGORY_NAMES = [
  'Anti Diabetic', 'Cardiac', 'Neuro Cns', 'Anti Infectives', 'Gastro Intestinal',
  'Respiratory', 'Derma', 'Vitamins & Nutrition', 'Pain Analgesics',
  'Gynaecological', 'Hormones', 'Ophthal', 'Other',
]
const COLUMN_ALIASES = {
  name: ['brand_name', 'name'],
  salt: ['salt_composition', 'salt'],
  pack: ['pack_size', 'pack'],
  manufacturer: ['manufacturer'],
  category: ['category'],
  mrp: ['mrp'],
  rx: ['is_rx_required', 'rx_required'],
  storeUrls: ['store_urls'],
  inStock: ['in_stock'],
}

function parseEnv(contents) {
  const parsed = {}
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)?\s*$/)
    if (!match) continue
    let value = (match[2] ?? '').trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    } else {
      value = value.replace(/\s+#.*$/, '').trim()
    }
    parsed[match[1]] = value
  }
  return parsed
}

async function loadEnvironment() {
  let local = {}
  try {
    local = parseEnv(await readFile(path.join(ROOT, '.env.local'), 'utf8'))
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
  const value = (...names) => names.map((name) => process.env[name] || local[name]).find(Boolean)
  const url = value('NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL')
  const key = value('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY')
  if (!url || !key) {
    throw new Error('Set NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY) in .env.local or the environment.')
  }
  return { url: url.replace(/\/+$/, ''), key }
}

async function requestJson(url, options = {}, attempts = 3) {
  let lastError
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, options)
      if (response.ok) {
        if (response.status === 204) return null
        const body = await response.text()
        return body ? JSON.parse(body) : null
      }
      const body = await response.text()
      const error = new Error(`Supabase request failed (${response.status}): ${body.slice(0, 1000)}`)
      if (response.status < 500 && response.status !== 429) throw error
      lastError = error
    } catch (error) {
      if (error.message.startsWith('Supabase request failed (')) throw error
      lastError = error
    }
    if (attempt + 1 < attempts) {
      await new Promise((resolve) => setTimeout(resolve, 400 * (2 ** attempt)))
    }
  }
  throw lastError
}

function csvFields(record) {
  const fields = []
  let field = ''
  let quoted = false
  for (let index = 0; index < record.length; index += 1) {
    const char = record[index]
    if (char === '"') {
      if (quoted && record[index + 1] === '"') {
        field += '"'
        index += 1
      } else {
        quoted = !quoted
      }
    } else if (char === ',' && !quoted) {
      fields.push(field)
      field = ''
    } else {
      field += char
    }
  }
  fields.push(field)
  return fields
}

async function* csvRows(filePath) {
  const lines = readline.createInterface({
    input: createReadStream(filePath, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  })
  let header
  let record = ''
  let quoted = false
  for await (const line of lines) {
    record = record ? `${record}\n${line}` : line
    for (let index = 0; index < line.length; index += 1) {
      if (line[index] !== '"') continue
      if (quoted && line[index + 1] === '"') {
        index += 1
      } else {
        quoted = !quoted
      }
    }
    if (quoted) continue
    const fields = csvFields(record)
    record = ''
    if (!header) {
      header = fields.map((field, index) => (
        (index === 0 ? field.replace(/^\uFEFF/, '') : field).trim().toLowerCase()
      ))
      continue
    }
    if (fields.length === 1 && fields[0] === '') continue
    const row = {}
    for (let index = 0; index < header.length; index += 1) row[header[index]] = fields[index] ?? ''
    yield row
  }
  if (quoted) throw new Error(`Unterminated quoted CSV value in ${path.basename(filePath)}.`)
}

function normalizeKey(value) {
  return value
    .toLowerCase()
    .replace(/(\d+(?:\.\d+)?)\s*mg\b/g, '$1')
    .replace(/strip of \d+.*$/i, ' ')
    .replace(/bottle of.*$/i, ' ')
    .replace(/pack of.*$/i, ' ')
    .replace(/\btablet\(s\)\b/gi, ' ')
    .replace(/\btablets?\b/gi, ' ')
    .replace(/\bcapsule\(s\)\b/gi, ' ')
    .replace(/\bcapsules?\b/gi, ' ')
    .replace(/\b(?:10|15)'s\b/gi, ' ')
    .replace(/\b(?:10|15)\s+s\b/gi, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function numberValue(value) {
  if (typeof value !== 'string' || !value.trim()) return null
  const parsed = Number.parseFloat(value.replace(/[₹,\s]/g, ''))
  return Number.isFinite(parsed) ? parsed : null
}

function categoryFor(value) {
  const category = (value ?? '').trim().toLowerCase()
  if (!category) return 'Other'
  if (/diabet|glycemi/.test(category)) return 'Anti Diabetic'
  if (/cardiac|cardio|hypertens|blood pressure|anti.?hypertensive/.test(category)) return 'Cardiac'
  if (/central nervous|neuro|cns/.test(category)) return 'Neuro Cns'
  if (/infect|antibiotic|antiviral|anti.?bacterial/.test(category)) return 'Anti Infectives'
  if (/gastro|digest|acidity|stomach/.test(category)) return 'Gastro Intestinal'
  if (/respirat|cold|cough|asthma|pulmonary/.test(category)) return 'Respiratory'
  if (/derma|skin|topical/.test(category)) return 'Derma'
  if (/vitamin|nutrition|protein|whey|sports|multivitamin|supplement|wellness/.test(category)) return 'Vitamins & Nutrition'
  if (/pain|analgesic|arthritis/.test(category)) return 'Pain Analgesics'
  if (/gynae|gyne|obstetric|uterine/.test(category)) return 'Gynaecological'
  if (/hormone|thyroid|endocrine/.test(category)) return 'Hormones'
  if (/ophthal|ophthalm|eye care/.test(category)) return 'Ophthal'
  const exact = CATEGORY_NAMES.find((name) => name.toLowerCase() === category)
  return exact ?? 'Other'
}

function booleanValue(value) {
  return /^(1|true|yes|y|rx|required|prescription)$/i.test((value ?? '').trim())
}

function stockValue(value) {
  const normalized = (value ?? '').trim().toLowerCase()
  if (/^(1|true|yes|y|in stock|available)$/.test(normalized)) return true
  if (/^(0|false|no|n|out of stock|unavailable)$/.test(normalized)) return false
  return null
}

function getColumn(columns, alias) {
  return COLUMN_ALIASES[alias].find((column) => columns.has(column))
}

function assignIfPresent(target, column, value) {
  if (column && value !== undefined && value !== null) target[column] = value
}

function hasValue(value) {
  return typeof value === 'string' && value.trim().length > 0
}

async function main() {
  const { url, key } = await loadEnvironment()
  const apiHeaders = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  }
  const medicinesUrl = `${url}/rest/v1/medicines`
  const sample = await requestJson(`${medicinesUrl}?limit=1`, { headers: apiHeaders })
  if (!Array.isArray(sample) || sample.length === 0) {
    throw new Error('Could not inspect public.medicines: the sample query returned no rows.')
  }
  const columns = new Set(Object.keys(sample[0]))
  const idColumn = columns.has('id') ? 'id' : null
  const nameColumn = getColumn(columns, 'name')
  if (!idColumn || !nameColumn || !columns.has('mrp')) {
    throw new Error(`Unsupported public.medicines schema. Detected columns: ${[...columns].join(', ')}`)
  }
  const selectedColumns = [
    idColumn, nameColumn, getColumn(columns, 'salt'), getColumn(columns, 'pack'),
    getColumn(columns, 'manufacturer'), getColumn(columns, 'category'), 'mrp',
    getColumn(columns, 'rx'), getColumn(columns, 'storeUrls'), getColumn(columns, 'inStock'),
    ...Object.values(PRICE_COLUMNS).filter((column) => columns.has(column)),
  ].filter(Boolean)
  const idValue = sample[0][idColumn]
  const idType = typeof idValue === 'string' && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(idValue)
    ? 'uuid'
    : typeof idValue
  const schema = {
    id: idColumn,
    idType,
    name: nameColumn,
    salt: getColumn(columns, 'salt'),
    pack: getColumn(columns, 'pack'),
    manufacturer: getColumn(columns, 'manufacturer'),
    category: getColumn(columns, 'category'),
    mrp: 'mrp',
    rx: getColumn(columns, 'rx'),
    storeUrls: getColumn(columns, 'storeUrls'),
    inStock: getColumn(columns, 'inStock'),
    prices: Object.fromEntries(Object.entries(PRICE_COLUMNS).filter(([, column]) => columns.has(column))),
  }
  console.log('[Schema] public.medicines columns:', [...columns].join(', '))
  console.log('[Schema] Resolved fields:', JSON.stringify(schema))

  for (const { file } of FILES) {
    await access(path.join(ROOT, file))
  }
  const merged = new Map()
  for (const source of FILES) {
    let rowCount = 0
    for await (const row of csvRows(path.join(ROOT, source.file))) {
      rowCount += 1
      const displayName = hasValue(row.product_name) ? row.product_name.trim() : (row.brand_name ?? '').trim()
      if (!displayName) continue
      const keyName = normalizeKey(displayName)
      if (!keyName) continue

      let record = merged.get(keyName)
      if (!record) {
        record = {
          name: displayName,
          sources: new Set(),
          metadata: {},
          mrp: 0,
          prices: {},
          storeUrls: {},
          hasPortalPrice: false,
          inStock: null,
        }
        merged.set(keyName, record)
      }
      record.sources.add(source.kind)
      if (displayName.length > record.name.length || source.kind === 'base') record.name = displayName

      const salt = row.salt_composition ?? row.salt
      const pack = row.pack_size ?? row.pack
      if (hasValue(salt)) record.metadata.salt = salt.trim()
      if (hasValue(pack)) record.metadata.pack = pack.trim()
      if (hasValue(row.manufacturer)) record.metadata.manufacturer = row.manufacturer.trim()
      if (hasValue(row.category)) record.metadata.category = categoryFor(row.category)
      if (hasValue(row.is_rx_required)) record.metadata.rx = booleanValue(row.is_rx_required)

      const mrp = numberValue(row.mrp)
      const sellingPrice = numberValue(row.selling_price)
      if (mrp !== null && mrp > 0) record.mrp = Math.max(record.mrp, mrp)
      if (sellingPrice !== null && sellingPrice > 0) record.mrp = Math.max(record.mrp, sellingPrice)

      const priceColumn = PRICE_COLUMNS[source.kind]
      if (priceColumn) {
        const storePrice = source.kind === '1mg'
          ? sellingPrice
          : sellingPrice !== null && sellingPrice > 0
            ? sellingPrice
            : mrp !== null && mrp > 0
              ? mrp
              : null
        if (storePrice !== null && storePrice > 0) {
          record.prices[priceColumn] = storePrice
          record.hasPortalPrice = true
        }
        const productUrl = row.product_url?.trim()
        if (productUrl) record.storeUrls[PORTAL_URL_KEYS[source.kind]] = productUrl
      }
      const stock = stockValue(row.is_in_stock ?? row.in_stock)
      if (stock !== null) record.inStock = stock
    }
    console.log(`[Merge] ${source.file}: ${rowCount.toLocaleString()} rows read`)
  }
  console.log(`[Merge] ${merged.size.toLocaleString()} unique normalized products`)

  const existingByName = new Map()
  let nextOffset = 0
  let indexedCount = 0
  let nextProgress = 10_000
  async function indexWorker() {
    while (true) {
      const start = nextOffset
      nextOffset += PAGE_SIZE
      const pageUrl = new URL(medicinesUrl)
      pageUrl.searchParams.set('select', selectedColumns.join(','))
      pageUrl.searchParams.set('order', `${idColumn}.asc`)
      pageUrl.searchParams.set('offset', String(start))
      pageUrl.searchParams.set('limit', String(PAGE_SIZE))
      const rows = await requestJson(pageUrl, {
        headers: { ...apiHeaders, Range: `${start}-${start + PAGE_SIZE - 1}`, 'Range-Unit': 'items' },
      })
      if (!Array.isArray(rows)) throw new Error('Supabase existing-medicine page was not an array.')
      for (const row of rows) {
        const normalized = normalizeKey(String(row[nameColumn] ?? ''))
        if (normalized && !existingByName.has(normalized)) existingByName.set(normalized, row)
      }
      indexedCount += rows.length
      if (indexedCount >= nextProgress) {
        console.log(`[Sync] Indexed ${indexedCount.toLocaleString()} existing medicines...`)
        nextProgress = (Math.floor(indexedCount / 10_000) + 1) * 10_000
      }
      if (rows.length < PAGE_SIZE) return
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, indexWorker))
  console.log(`[Sync] Indexed ${existingByName.size.toLocaleString()} existing medicines`)

  const priorityA = []
  const priorityB = []
  for (const [normalizedName, record] of merged) {
    const existing = existingByName.get(normalizedName)
    const payload = existing ? { [idColumn]: existing[idColumn] } : {}
    payload[nameColumn] = record.name
    assignIfPresent(payload, schema.salt, record.metadata.salt ?? existing?.[schema.salt] ?? '')
    assignIfPresent(payload, schema.pack, record.metadata.pack ?? existing?.[schema.pack] ?? '')
    assignIfPresent(payload, schema.manufacturer, record.metadata.manufacturer ?? existing?.[schema.manufacturer] ?? '')
    assignIfPresent(payload, schema.category, record.metadata.category ?? existing?.[schema.category] ?? 'Other')
    assignIfPresent(payload, schema.rx, record.metadata.rx ?? existing?.[schema.rx] ?? false)

    const existingMrp = Number(existing?.[schema.mrp]) || 0
    const nextMrp = Math.max(record.mrp, existingMrp)
    payload[schema.mrp] = nextMrp
    for (const column of Object.values(PRICE_COLUMNS)) {
      if (columns.has(column)) payload[column] = record.prices[column] ?? existing?.[column] ?? null
    }
    if (schema.storeUrls) {
      payload[schema.storeUrls] = Object.keys(record.storeUrls).length > 0
        ? { ...(existing?.[schema.storeUrls] ?? {}), ...record.storeUrls }
        : existing?.[schema.storeUrls] ?? null
    }
    if (schema.inStock) payload[schema.inStock] = record.inStock ?? existing?.[schema.inStock] ?? null

    if (existing) {
      if (schema.storeUrls && payload[schema.storeUrls] === undefined && existing[schema.storeUrls]) {
        payload[schema.storeUrls] = existing[schema.storeUrls]
      }
      const changed = Object.entries(payload).some(([column, value]) => {
        if (column === idColumn) return false
        const previous = existing[column]
        return JSON.stringify(previous ?? null) !== JSON.stringify(value ?? null)
      })
      if (!changed) continue
    }

    const hasNon1MgPortal = [...record.sources].some((source) => source !== 'base' && source !== '1mg')
    const isPriorityA = record.hasPortalPrice || hasNon1MgPortal || record.sources.has('base')
      || (existing && Object.keys(payload).some((column) => (
        column !== idColumn
        && JSON.stringify(existing[column] ?? null) !== JSON.stringify(payload[column] ?? null)
      )))
    ;(isPriorityA ? priorityA : priorityB).push({ payload, isNew: !existing })
  }

  const chunks = (rows) => Array.from(
    { length: Math.ceil(rows.length / BATCH_SIZE) },
    (_, index) => rows.slice(index * BATCH_SIZE, (index + 1) * BATCH_SIZE),
  )
  const prioritizedBatches = [
    ...chunks(priorityA.filter((record) => !record.isNew)).map((batch) => batch.map(({ payload }) => payload)),
    ...chunks(priorityA.filter((record) => record.isNew)).map((batch) => batch.map(({ payload }) => payload)),
    ...chunks(priorityB.filter((record) => !record.isNew)).map((batch) => batch.map(({ payload }) => payload)),
    ...chunks(priorityB.filter((record) => record.isNew)).map((batch) => batch.map(({ payload }) => payload)),
  ]
  const totalRows = priorityA.length + priorityB.length
  console.log(`[Sync] Priority A: ${priorityA.length.toLocaleString()} | Priority B: ${priorityB.length.toLocaleString()} | Total: ${totalRows.toLocaleString()}`)
  let completed = 0
  let lastProgress = 0
  let nextBatch = 0
  async function worker() {
    while (true) {
      const index = nextBatch
      nextBatch += 1
      if (index >= prioritizedBatches.length) return
      const batch = prioritizedBatches[index]
      const target = new URL(medicinesUrl)
      target.searchParams.set('on_conflict', idColumn)
      async function sendBatch(rows) {
        try {
          await requestJson(target, {
            method: 'POST',
            headers: {
              ...apiHeaders,
              Prefer: 'resolution=merge-duplicates,return=minimal',
            },
            body: JSON.stringify(rows),
          })
        } catch (error) {
          if (rows.length === 1) throw error
          const status = error.message.match(/Supabase request failed \((\d+)\)/)?.[1]
          if (status && Number(status) < 500 && Number(status) !== 413 && Number(status) !== 429) {
            throw error
          }
          const middle = Math.ceil(rows.length / 2)
          console.warn(`[Sync] Batch ${index + 1} (${rows.length} rows) failed; retrying as ${middle} + ${rows.length - middle}.`, error.message)
          await sendBatch(rows.slice(0, middle))
          await sendBatch(rows.slice(middle))
        }
      }
      await sendBatch(batch)
      completed += batch.length
      if (completed - lastProgress >= 2500 || completed === totalRows) {
        console.log(`[Sync] Upserted ${completed.toLocaleString()} / ${totalRows.toLocaleString()} records...`)
        lastProgress = completed
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, prioritizedBatches.length) }, worker))
  console.log(`[Sync] Complete. ${completed.toLocaleString()} records upserted.`)
}

main().catch((error) => {
  console.error('[Sync] Catalog merge failed:', error)
  process.exitCode = 1
})
