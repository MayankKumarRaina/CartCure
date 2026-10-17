import { MEDICINES, type Category, type Medicine, type PlatformId } from './data'
import { supabase } from './supabase'

const categories = new Set<Category>(['Diabetes', 'Blood Pressure', 'Thyroid', 'Heart Care', 'Gastro'])
const platformIds: Record<string, PlatformId> = {
  tata1mg: 'tata1mg', 'tata 1mg': 'tata1mg', '1mg': 'tata1mg',
  pharmeasy: 'pharmeasy', 'pharm easy': 'pharmeasy',
  netmeds: 'netmeds',
}

function mapMedicine(row: Record<string, unknown>): Medicine {
  const prices = { tata1mg: 0, pharmeasy: 0, netmeds: 0 }
  const urls: Partial<Record<PlatformId, string>> = {}
  const nested = Array.isArray(row.pharmacy_prices) ? row.pharmacy_prices as Record<string, unknown>[] : []
  for (const price of nested) {
    const id = platformIds[String(price.platform_name ?? '').trim().toLowerCase()]
    if (!id) continue
    prices[id] = Number(price.selling_price) || 0
    if (price.product_url) urls[id] = String(price.product_url)
  }
  const rawCategories = Array.isArray(row.category) ? row.category : [row.category]
  const mappedCategories = rawCategories.map((v) => String(v)).filter((v): v is Category => categories.has(v as Category))
  return {
    id: String(row.id ?? row.slug ?? row.brand_name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
    name: String(row.brand_name ?? ''),
    pack: String(row.pack_size ?? ''),
    salt: String(row.salt_composition ?? ''),
    manufacturer: String(row.manufacturer ?? ''),
    mrp: Number(row.mrp) || 0,
    categories: mappedCategories,
    rxRequired: Boolean(row.is_rx_required),
    prices,
    productUrls: urls,
  }
}

export async function loadMedicines(): Promise<{ medicines: Medicine[]; source: 'live' | 'demo' }> {
  if (!supabase) return { medicines: MEDICINES, source: 'demo' }
  try {
    const { data, error } = await supabase.from('medicines').select('*, pharmacy_prices(*)')
    if (error || !data?.length) throw error ?? new Error('No medicine records found')
    const medicines = data.map((row) => mapMedicine(row as Record<string, unknown>))
    if (medicines.some((m) => !m.name || Object.values(m.prices).some((price) => price <= 0))) {
      throw new Error('Incomplete medicine pricing data')
    }
    return { medicines, source: 'live' }
  } catch (error) {
    console.warn('Supabase medicines unavailable; using demo data.', error)
    return { medicines: MEDICINES, source: 'demo' }
  }
}
