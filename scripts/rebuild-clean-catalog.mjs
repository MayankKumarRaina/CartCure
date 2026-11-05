import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { access, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { once } from 'node:events'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import readline from 'node:readline'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUTPUT_FILE = path.join(ROOT, 'master_medicines_clean.csv')
const BATCH_SIZE = 1000
const CONCURRENCY = 5
const FILES = [
  { file: 'drugs_full.csv', kind: 'drugs' },
  { file: '1mg_products.csv', kind: '1mg' },
  { file: 'netmeds_full.csv', kind: 'netmeds' },
  { file: 'apollopharmacy_full.csv', kind: 'apollo' },
  { file: 'pharmeasy_full.csv', kind: 'pharmeasy' },
  { file: 'healthkart_full.csv', kind: 'healthkart' },
  { file: 'truebasics_full.csv', kind: 'truebasics' },
]
const COLUMNS = [
  'id', 'brand_name', 'salt_composition', 'pack_size', 'manufacturer', 'category',
  'mrp', 'is_rx_required', 'in_stock', 'price_1mg', 'price_netmeds',
  'price_pharmeasy', 'price_apollo', 'price_truemeds', 'price_healthkart',
  'price_truebasics', 'store_urls',
]
const PORTAL_PRICE_COLUMNS = {
  netmeds: 'price_netmeds',
  pharmeasy: 'price_pharmeasy',
  apollo: 'price_apollo',
  healthkart: 'price_healthkart',
  truebasics: 'price_truebasics',
}
const SOURCE_NAME_PRIORITY = { '1mg': 100, drugs: 50 }
const CATEGORY_NAMES = [
  'Anti Diabetic', 'Anti Infectives', 'Anti Malarials', 'Anti Neoplastics',
  'Blood Related', 'Cardiac', 'Derma', 'Gastro Intestinal', 'Gynaecological',
  'Hormones', 'Neuro Cns', 'Ophthal', 'Ophthal Otologicals', 'Otologicals',
  'Pain Analgesics', 'Respiratory', 'Sex Stimulants Rejuvenators',
  'Stomatologicals', 'Urology', 'Vaccines', 'Vitamins & Nutrition', 'Other',
]

function csvFields(record) {
  const fields = []
  let field = ''
  let quoted = false
  for (let index = 0; index < record.length; index += 1) {
    const character = record[index]
    if (character === '"') {
      if (quoted && record[index + 1] === '"') {
        field += '"'
        index += 1
      } else {
        quoted = !quoted
      }
    } else if (character === ',' && !quoted) {
      fields.push(field)
      field = ''
    } else {
      field += character
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
    for (let index = 0; index < header.length; index += 1) {
      row[header[index]] = fields[index] ?? ''
    }
    yield row
  }
  if (quoted) throw new Error(`Unterminated quoted CSV value in ${path.basename(filePath)}.`)
}

function displayNameFor(row, kind) {
  const brand = row.brand_name?.trim() ?? ''
  const product = row.product_name?.trim() ?? ''
  if (kind === 'drugs' || kind === '1mg') return brand
  if (kind === 'netmeds') return brand.toLowerCase() === 'netmeds' ? product : brand
  if (kind === 'apollo') return brand || product
  return product || brand
}

function getNormalizedMergeKey(value) {
  return value
    .toLowerCase()
    .replace(/(\d+(?:\.\d+)?)\s*(mg|mcg|ml|gm|g|iu)\b/gi, '$1$2')
    .replace(/(\d+(?:\.\d+)?)mg\b/gi, '$1')
    .replace(/\b(?:strip of \d+|bottle of \d+|pack of \d+|box of \d+|\d+\s*tablet\(s\)|\d+\s*capsule\(s\)|\d+\s*tablets?|\d+\s*capsules?|tablet\(s\)|tablets?|capsule\(s\)|capsules?|syrup|injection|infusion|ointment|cream|gel|drops|suspension|inhaler|respules|powder|sachet|(?:10|15|20|30)(?:'s|\s+s))(?=\b|\s|$)/gi, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function deterministicId(normKey) {
  const hash = createHash('md5').update(normKey).digest('hex')
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`
}

function numberValue(value) {
  if (typeof value !== 'string' || !value.trim()) return null
  const parsed = Number.parseFloat(value.replace(/[₹,\s]/g, ''))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
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

function categoryFor(value) {
  const category = (value ?? '').trim().toLowerCase()
  if (!category) return ''
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
  return CATEGORY_NAMES.find((name) => name.toLowerCase() === category) ?? 'Other'
}

function isValidSalt(value) {
  return Boolean(value?.trim()) && !/^(empty|n\/?a|null|none|-+)$/i.test(value.trim())
}

function chooseBrand(record, displayName, kind) {
  const priority = SOURCE_NAME_PRIORITY[kind] ?? 10
  const titleCase = displayName !== displayName.toUpperCase() ? 1 : 0
  const packageNoise = /\b(?:strip|pack|bottle|box) of \d+|\b(?:tablets?|capsules?)\b/i.test(displayName) ? 1 : 0
  const score = priority * 100 + titleCase * 10 - packageNoise * 5 - displayName.length / 1000
  if (!record.brand_name || score > record.brand_name_score) {
    record.brand_name = displayName
    record.brand_name_score = score
  }
}

function setMetadata(record, field, value, kind) {
  if (!value?.trim()) return
  const priority = kind === '1mg' ? 2 : 1
  if ((record.metadata_priority[field] ?? 0) < priority) {
    record[field] = value.trim()
    record.metadata_priority[field] = priority
  }
}

function csvCell(value) {
  const text = value === null || value === undefined ? '' : String(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function toCsvRow(record) {
  return COLUMNS.map((column) => {
    const value = column === 'store_urls'
      ? Object.keys(record.store_urls).length ? JSON.stringify(record.store_urls) : null
      : record[column]
    return csvCell(value)
  }).join(',')
}

async function writeCsv(records) {
  async function* lines() {
    yield `${COLUMNS.join(',')}\r\n`
    for (const record of records) yield `${toCsvRow(record)}\r\n`
  }
  await pipeline(
    Readable.from(lines()),
    createWriteStream(OUTPUT_FILE, { encoding: 'utf8' }),
  )
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

async function loadSupabaseConfig() {
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

async function uploadRecords(records) {
  const { url, key } = await loadSupabaseConfig()
  const endpoint = new URL(`${url}/rest/v1/medicines`)
  endpoint.searchParams.set('on_conflict', 'id')
  const batches = []
  for (let index = 0; index < records.length; index += BATCH_SIZE) {
    batches.push(records.slice(index, index + BATCH_SIZE))
  }
  let nextBatch = 0
  let completed = 0

  async function sendBatch(batch, batchNumber) {
    let lastError
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            apikey: key,
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
            Prefer: 'resolution=merge-duplicates,return=minimal',
          },
          body: JSON.stringify(batch),
        })
        if (response.ok) return
        const body = await response.text()
        lastError = new Error(`Supabase batch ${batchNumber} failed (${response.status}): ${body.slice(0, 1000)}`)
        if (response.status < 500 && response.status !== 429) throw lastError
      } catch (error) {
        if (error.message.startsWith('Supabase batch ')) throw error
        lastError = error
      }
      if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, 500 * (2 ** attempt)))
    }
    throw lastError
  }

  async function worker() {
    while (true) {
      const index = nextBatch
      nextBatch += 1
      if (index >= batches.length) return
      await sendBatch(batches[index], index + 1)
      completed += batches[index].length
      console.log(`[Upload] Upserted ${completed.toLocaleString()} / ${records.length.toLocaleString()} medicines`)
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batches.length) }, worker))
}

async function main() {
  for (const { file } of FILES) await access(path.join(ROOT, file))

  const merged = new Map()
  let totalRows = 0
  for (const source of FILES) {
    let fileRows = 0
    for await (const row of csvRows(path.join(ROOT, source.file))) {
      fileRows += 1
      totalRows += 1
      const displayName = displayNameFor(row, source.kind)
      if (!displayName) continue
      const normKey = getNormalizedMergeKey(displayName)
      if (!normKey) continue

      let record = merged.get(normKey)
      if (!record) {
        record = {
          id: deterministicId(normKey),
          brand_name: '',
          brand_name_score: Number.NEGATIVE_INFINITY,
          salt_composition: null,
          pack_size: null,
          manufacturer: null,
          category: '',
          mrp: 0,
          is_rx_required: false,
          in_stock: null,
          price_1mg: null,
          price_netmeds: null,
          price_pharmeasy: null,
          price_apollo: null,
          price_truemeds: null,
          price_healthkart: null,
          price_truebasics: null,
          store_urls: {},
          metadata_priority: {},
          price_1mg_direct: false,
        }
        merged.set(normKey, record)
      }

      chooseBrand(record, displayName, source.kind)
      const salt = row.salt_composition ?? row.salt ?? ''
      if (isValidSalt(salt)) setMetadata(record, 'salt_composition', salt, source.kind)
      setMetadata(record, 'pack_size', row.pack_size ?? row.pack ?? '', source.kind)
      setMetadata(record, 'manufacturer', row.manufacturer ?? '', source.kind)
      const category = categoryFor(row.category)
      if (category) setMetadata(record, 'category', category, source.kind)
      if (booleanValue(row.is_rx_required)) record.is_rx_required = true

      const mrp = numberValue(row.mrp)
      const sellingPrice = numberValue(row.selling_price)
      if (mrp !== null) record.mrp = Math.max(record.mrp, mrp)
      if (sellingPrice !== null) record.mrp = Math.max(record.mrp, sellingPrice)

      if (source.kind === 'drugs' || source.kind === '1mg') {
        const price = sellingPrice ?? (mrp === null ? null : Math.round(mrp * 0.88 * 100) / 100)
        if (price !== null && (!record.price_1mg_direct || sellingPrice !== null)) {
          if (sellingPrice !== null) {
            record.price_1mg = record.price_1mg_direct
              ? Math.min(record.price_1mg, sellingPrice)
              : sellingPrice
            record.price_1mg_direct = true
          } else if (record.price_1mg === null) {
            record.price_1mg = price
          } else if (!record.price_1mg_direct) {
            record.price_1mg = Math.min(record.price_1mg, price)
          }
        }
      }

      const priceColumn = PORTAL_PRICE_COLUMNS[source.kind]
      if (priceColumn) {
        const price = sellingPrice ?? mrp
        if (price !== null) {
          record[priceColumn] = record[priceColumn] === null
            ? price
            : Math.min(record[priceColumn], price)
        }
        const productUrl = row.product_url?.trim()
        if (productUrl) record.store_urls[source.kind] = productUrl
      }

      const stock = stockValue(row.is_in_stock ?? row.in_stock)
      if (stock === true) record.in_stock = true
      else if (stock === false && record.in_stock === null) record.in_stock = false
    }
    console.log(`[Merge] ${source.file}: ${fileRows.toLocaleString()} rows read`)
  }

  const records = [...merged.values()]
  await writeCsv(records)
  const priceCounts = [
    ['price_1mg', '1mg'],
    ['price_netmeds', 'Netmeds'],
    ['price_pharmeasy', 'PharmEasy'],
    ['price_apollo', 'Apollo'],
    ['price_healthkart', 'HealthKart'],
    ['price_truebasics', 'TrueBasics'],
  ]
  console.log('\nMerge summary')
  console.table([
    { Metric: 'Raw CSV rows read', Count: totalRows },
    { Metric: 'Unique deduplicated medicines', Count: records.length },
    ...priceCounts.map(([column, store]) => ({
      Metric: `Medicines with ${store} price`,
      Count: records.filter((record) => record[column] !== null).length,
    })),
  ])
  console.log(`Wrote ${OUTPUT_FILE}`)

  if (process.argv.includes('--upload')) {
    const priceCount = (record) => Object.values(PORTAL_PRICE_COLUMNS)
      .filter((column) => record[column] !== null).length
    const richRecords = []
    const remainingRecords = []
    for (const record of records) {
      ;(priceCount(record) > 0 ? richRecords : remainingRecords).push(record)
    }
    const orderedRecords = [...richRecords, ...remainingRecords].map((record) => (
      Object.fromEntries(COLUMNS.map((column) => [
        column,
        column === 'store_urls'
          ? Object.keys(record.store_urls).length ? record.store_urls : null
          : record[column],
      ]))
    ))
    console.log(`[Upload] ${richRecords.length.toLocaleString()} multi-store-priced medicines prioritized before ${remainingRecords.length.toLocaleString()} remaining catalog medicines`)
    await uploadRecords(orderedRecords)
  }
}

main().catch((error) => {
  console.error('[Catalog rebuild] Failed:', error)
  process.exitCode = 1
})
