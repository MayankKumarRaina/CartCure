import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import readline from 'node:readline'
import { parse } from 'csv-parse'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CSV_FILE = path.join(ROOT, 'master_medicines_clean.csv')
const BATCH_SIZE = 1000
const CONCURRENCY = 5
const MAX_ATTEMPTS = 5
const UUID_NAMESPACE = Buffer.from('6ba7b8109dad11d180b400c04fd430c8', 'hex')
function normalizeHeader(header) {
  return header.trim().toLowerCase().replace(/\s+/g, '_')
}

function csvParserOptions() {
  return {
    bom: true,
    skip_empty_lines: true,
    relax_column_count: true,
    relax_quotes: true,
  }
}

async function readCsvHeaders(csvFile) {
  const input = createReadStream(csvFile, { encoding: 'utf8' })
  const lines = readline.createInterface({ input, crlfDelay: Infinity })
  try {
    for await (const line of lines) {
      for await (const headers of parse(line, { bom: true })) {
        return headers.map((header) => header.trim() ? normalizeHeader(header) : '')
      }
    }
  } finally {
    lines.close()
    input.destroy()
  }
  throw new Error(`${path.basename(csvFile)} is empty.`)
}

async function repairUnclosedQuotedPriceRow(line) {
  const record = line.replace(/,+$/, '')
  const suffix = record.match(/,(-?(?:\d+(?:\.\d*)?|\.\d+)),(?:true|false)$/i)
  if (!suffix) return null
  const prefix = record.slice(0, suffix.index)
  const firstSeparator = prefix[0] === '"'
    ? prefix.search(/(?<!")",/)
    : prefix.indexOf(',')
  if (firstSeparator < 0) return null

  let brand
  let saltAndPack
  if (prefix[0] === '"') {
    let value = ''
    let closingQuote = -1
    for (let index = 1; index < prefix.length; index += 1) {
      if (prefix[index] !== '"') {
        value += prefix[index]
      } else if (prefix[index + 1] === '"') {
        value += '"'
        index += 1
      } else if (prefix[index + 1] === ',') {
        closingQuote = index
        break
      }
    }
    if (closingQuote < 0) return null
    brand = value
    saltAndPack = prefix.slice(closingQuote + 2)
  } else {
    brand = prefix.slice(0, firstSeparator)
    saltAndPack = prefix.slice(firstSeparator + 1)
  }

  const candidates = [...saltAndPack.matchAll(/(?<=,)\s*([^,\r\n]{1,80})\s*(?=,)/g)]
    .filter((match) => /\d/.test(match[1]) && /\b(?:mg|mcg|g|gm|ml|l|units?|tablets?|tabs?|capsules?|caps?|bars?|bottles?|packs?|pieces?|count|sachets?|strips?|inhalers?|ointments?|syrups?|drops?|powders?)\b/i.test(match[1]))
  for (const candidate of candidates.reverse()) {
    const salt = saltAndPack.slice(0, candidate.index).replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"').trim()
    const packSize = candidate[1].trim()
    const tail = `${saltAndPack.slice(candidate.index + candidate[0].length + 1)}${record.slice(suffix.index)}`
    try {
      for await (const fields of parse(tail)) {
        if (
          fields.length !== 4
          || !Number.isFinite(Number(fields[2]))
          || !/^(?:true|false)$/i.test(fields[3].trim())
        ) continue
        return {
          brand_name: brand.trim(),
          salt_composition: salt,
          pack_size: packSize,
          manufacturer: fields[0],
          category: fields[1],
          mrp: fields[2],
          is_rx_required: fields[3],
        }
      }
    } catch {
      continue
    }
  }
  return null
}

function validBaseRow(row) {
  const mrp = String(row?.mrp ?? '').trim()
  const rxRequired = String(row?.is_rx_required ?? '').trim()
  return (!mrp || Number.isFinite(Number(mrp))) && (!rxRequired || /^(?:true|false)$/i.test(rxRequired))
}

async function* readCsvRows(csvFile) {
  const headers = await readCsvHeaders(csvFile)
  const columns = headers.map((header) => header || undefined)
  const options = { ...csvParserOptions(), columns }
  const input = createReadStream(csvFile, { encoding: 'utf8' })
  const lines = readline.createInterface({ input, crlfDelay: Infinity })
  let lineNumber = 0
  let repairedRows = 0
  let record = ''
  try {
    for await (const line of lines) {
      lineNumber += 1
      if (lineNumber === 1 || !line.trim()) continue
      record = record ? `${record}\n${line}` : line
      let row
      try {
        for await (const parsedRow of parse(record, options)) {
          row = parsedRow
          break
        }
      } catch (error) {
        if (/Quote Not Closed/i.test(error.message) && !/,\s*-?(?:\d+(?:\.\d*)?|\.\d+)\s*,(?:true|false)$/i.test(line.replace(/,+$/, ''))) {
          continue
        }
        row = await repairUnclosedQuotedPriceRow(record)
        if (!row) throw new Error(`${path.basename(csvFile)} line ${lineNumber}: ${error.message}`, { cause: error })
        repairedRows += 1
        record = ''
      }

      if (record && row && !validBaseRow(row)) {
        row = await repairUnclosedQuotedPriceRow(record)
        if (!row) {
          throw new Error(`${path.basename(csvFile)} line ${lineNumber}: unable to recover malformed base CSV row.`)
        }
        repairedRows += 1
      }
      if (row) {
        record = ''
        yield row
      }
    }
    if (record) {
      const row = await repairUnclosedQuotedPriceRow(record)
      if (!row) throw new Error(`${path.basename(csvFile)} ends with an incomplete CSV record.`)
      repairedRows += 1
      yield row
    }
  } finally {
    lines.close()
    input.destroy()
  }
  if (repairedRows > 0) {
    console.warn(`[CSV] Recovered ${repairedRows} malformed base rows in ${path.basename(csvFile)}.`)
  }
}

function deterministicUuid(brandName, packSize) {
  const name = JSON.stringify([brandName.trim(), packSize.trim()])
  const hash = createHash('sha1').update(UUID_NAMESPACE).update(name).digest()
  hash[6] = (hash[6] & 0x0f) | 0x50
  hash[8] = (hash[8] & 0x3f) | 0x80
  const hex = hash.subarray(0, 16).toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function numberValue(value, column) {
  const normalized = String(value ?? '').trim()
  if (!normalized) return null
  const number = Number(normalized)
  if (!Number.isFinite(number)) {
    throw new Error(`Invalid numeric value in ${column}: ${JSON.stringify(value)}`)
  }
  return number
}

function booleanValue(value, column) {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (!normalized) return null
  if (normalized === 'true') return true
  if (normalized === 'false') return false
  throw new Error(`Invalid boolean value in ${column}: ${JSON.stringify(value)}`)
}

function sanitizeRow(row, rowNumber) {
  const brandName = String(
    row.brand_name || row['Brand Name'] || row.product_name || row['Product Name'] || '',
  ).trim()
  const packSize = String(row.pack_size || row['Pack Size'] || '').trim()
  const output = {
    brand_name: brandName,
    salt_composition: String(row.salt_composition ?? '').trim(),
    pack_size: packSize,
    manufacturer: String(row.manufacturer ?? '').trim(),
    category: String(row.category ?? '').trim(),
  }
  try {
    output.mrp = numberValue(row.mrp, 'mrp')
    output.is_rx_required = booleanValue(row.is_rx_required, 'is_rx_required')
  } catch (error) {
    throw new Error(`CSV row ${rowNumber}: ${error.message}`, { cause: error })
  }
  output.in_stock = true
  const id = String(row.id ?? '').trim()
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    output.id = id
  } else {
    output.id = deterministicUuid(brandName, packSize)
  }
  return output
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

function retryDelay(response, attempt) {
  const retryAfter = response?.headers.get('retry-after')
  if (retryAfter) {
    const seconds = Number(retryAfter)
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000)
    const dateDelay = Date.parse(retryAfter) - Date.now()
    if (Number.isFinite(dateDelay)) return Math.max(0, dateDelay)
  }
  return 500 * (2 ** attempt)
}

async function sendBatch(endpoint, key, rows, batchNumber, priorityLabel) {
  let lastError
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    let response
    let splitBatch = false
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify(rows),
      })
      if (response.ok) return

      const body = await response.text()
      if (response.status === 500 && body.includes('"57014') && rows.length > 1) {
        splitBatch = true
        const midpoint = Math.ceil(rows.length / 2)
        console.warn(
          `[Upload] Supabase timed out on batch ${batchNumber}; retrying as ${midpoint} + ${rows.length - midpoint} rows.`,
        )
        await sendBatch(endpoint, key, rows.slice(0, midpoint), `${batchNumber}.1`, priorityLabel)
        await sendBatch(endpoint, key, rows.slice(midpoint), `${batchNumber}.2`, priorityLabel)
        return
      }
      lastError = new Error(
        `Supabase ${priorityLabel} batch ${batchNumber} failed (${response.status}): ${body.slice(0, 1000)}`,
      )
      const shouldRetry = response.status === 408 || response.status === 429 || response.status >= 500
      if (!shouldRetry) throw lastError
    } catch (error) {
      if (error === lastError || splitBatch) throw error
      lastError = error
    }

    if (attempt + 1 < MAX_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, retryDelay(response, attempt)))
    }
  }
  throw new Error(
    `Supabase ${priorityLabel} batch ${batchNumber} failed after ${MAX_ATTEMPTS} attempts: ${lastError?.message ?? 'unknown error'}`,
    { cause: lastError },
  )
}

async function uploadRows(csvFile, endpoint, key) {
  let batch = []
  let batchNumber = 0
  let rowNumber = 1
  let uploaded = 0
  let skippedInvalidMrp = 0
  let pending = []

  async function drainPending() {
    const results = await Promise.all(pending)
    pending = []
    const failed = results.find((result) => result.error)
    if (failed) throw failed.error
  }

  async function sendCurrentBatch() {
    const rows = [...new Map(batch.map((row) => [row.id, row])).values()]
    const duplicates = batch.length - rows.length
    batch = []
    batchNumber += 1
    const number = batchNumber
    if (duplicates > 0) {
      console.warn(`[Upload] Deduplicated ${duplicates} repeated IDs in batch ${number}.`)
    }
    pending.push(
      sendBatch(endpoint, key, rows, number, 'base catalog')
        .then(() => {
          uploaded += rows.length
          console.log(`[Upload] ${uploaded.toLocaleString()} rows across ${number} batches`)
          return { error: null }
        })
        .catch((error) => ({ error })),
    )
    if (pending.length === CONCURRENCY) {
      await drainPending()
    }
  }

  for await (const row of readCsvRows(csvFile)) {
    rowNumber += 1
    const prepared = sanitizeRow(row, rowNumber)
    if (prepared.mrp === null || prepared.mrp <= 0) {
      skippedInvalidMrp += 1
      continue
    }
    batch.push(prepared)
    if (process.argv.includes('--dry-run')) {
      if (rowNumber % 100000 === 0) console.log(`[Dry run] Validated ${rowNumber.toLocaleString()} rows`)
      continue
    }
    if (batch.length === BATCH_SIZE) await sendCurrentBatch()
  }
  if (process.argv.includes('--dry-run')) {
    console.log(`[Dry run] Validated ${(rowNumber - 1 - skippedInvalidMrp).toLocaleString()} uploadable rows; skipped ${skippedInvalidMrp.toLocaleString()} without a positive MRP.`)
    return rowNumber - 1
  }
  if (batch.length > 0) await sendCurrentBatch()
  await drainPending()
  if (skippedInvalidMrp > 0) {
    console.warn(`[Upload] Skipped ${skippedInvalidMrp.toLocaleString()} rows without a positive MRP (required by the Supabase schema).`)
  }
  return uploaded
}

async function verifySupabaseCounts(url, key) {
  const count = async (column) => {
    const endpoint = new URL(`${url}/rest/v1/medicines`)
    endpoint.searchParams.set('select', 'id')
    if (column) endpoint.searchParams.set(column, 'not.is.null')
    const response = await fetch(endpoint, {
      method: 'HEAD',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Prefer: 'count=exact',
        Range: '0-0',
      },
    })
    if (!response.ok) {
      throw new Error(`Supabase count query failed (${response.status}): ${(await response.text()).slice(0, 1000)}`)
    }
    const contentRange = response.headers.get('content-range')
    const match = contentRange?.match(/\/(\d+|\*)$/)
    if (!match || match[1] === '*') {
      throw new Error(`Supabase did not return an exact row count for ${column ?? 'all medicines'}.`)
    }
    return Number(match[1])
  }

  const columns = [
    null,
    'price_1mg',
    'price_netmeds',
    'price_pharmeasy',
    'price_apollo',
    'price_truemeds',
    'price_healthkart',
    'price_truebasics',
  ]
  const counts = []
  for (const column of columns) {
    counts.push([column ?? 'total', await count(column)])
  }
  return Object.fromEntries(counts)
}

async function main() {
  const csvFile = CSV_FILE
  const headers = await readCsvHeaders(csvFile)
  const requiredBaseColumns = [
    'salt_composition',
    'pack_size',
    'manufacturer',
    'category',
    'mrp',
    'is_rx_required',
  ]
  const headerSet = new Set(headers)
  const missingColumns = requiredBaseColumns.filter((column) => !headerSet.has(column))
  if (!headerSet.has('brand_name') && !headerSet.has('product_name')) {
    missingColumns.unshift('brand_name (or product_name)')
  }
  if (missingColumns.length > 0) {
    throw new Error(`CSV is missing required columns: ${missingColumns.join(', ')}`)
  }
  if (process.argv.includes('--dry-run')) {
    await uploadRows(csvFile, null, null)
    return
  }

  const { url, key } = await loadSupabaseConfig()
  const endpoint = new URL(`${url}/rest/v1/medicines`)
  endpoint.searchParams.set('on_conflict', 'id')

  const uploaded = await uploadRows(csvFile, endpoint, key)
  console.log(`[Upload] Complete: ${uploaded.toLocaleString()} base medicines uploaded with in_stock=true.`)
  console.log('\n[Supabase] Exact row and per-store price counts:')
  console.table(await verifySupabaseCounts(url, key))
}

main().catch((error) => {
  console.error(`[Upload] Failed: ${error.message}`)
  process.exitCode = 1
})
