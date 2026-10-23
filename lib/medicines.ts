import { CATEGORIES, MEDICINES, type CatalogMedicine, type Category, type Medicine, type PharmacyPrice, type PlatformId } from './data'
import { supabase } from './supabase'

const categories = new Set<Category>(CATEGORIES)
const platformIds: Record<string, PlatformId> = {
  tata1mg: 'tata1mg', 'tata 1mg': 'tata1mg', '1mg': 'tata1mg',
  pharmeasy: 'pharmeasy', 'pharm easy': 'pharmeasy',
  netmeds: 'netmeds',
  apollo: 'apollo', 'apollo pharmacy': 'apollo',
  truemeds: 'truemeds',
  medplus: 'medplus', 'medplus mart': 'medplus',
}

export function mapMedicine(row: Medicine, pharmacyPrices?: PharmacyPrice[]): CatalogMedicine {
  const prices: Record<PlatformId, number> = {
    tata1mg: pharmacyPrices === undefined ? row.mrp : 0,
    pharmeasy: pharmacyPrices === undefined ? row.mrp : 0,
    netmeds: pharmacyPrices === undefined ? row.mrp : 0,
    apollo: pharmacyPrices === undefined ? row.mrp : 0,
    truemeds: pharmacyPrices === undefined ? row.mrp : 0,
    medplus: pharmacyPrices === undefined ? row.mrp : 0,
  }
  const livePricePlatforms = new Set<PlatformId>()
  for (const price of pharmacyPrices ?? []) {
    const platformId = platformIds[price.platform_name.trim().toLowerCase()]
    if (!platformId) continue
    prices[platformId] = Number(price.price) || 0
    livePricePlatforms.add(platformId)
  }
  const normalizedCategory = row.category.trim()
  const mappedCategories = categories.has(normalizedCategory as Category) ? [normalizedCategory as Category] : []
  return {
    id: row.id,
    name: row.brand_name,
    pack: row.pack_size ?? '',
    salt: row.salt_composition ?? '',
    manufacturer: row.manufacturer ?? '',
    mrp: row.mrp,
    categories: mappedCategories,
    rxRequired: row.is_rx_required,
    prices,
    livePricePlatforms: [...livePricePlatforms],
    pharmacyPrices,
  }
}

export async function loadMedicines(): Promise<{ medicines: CatalogMedicine[]; source: 'live' | 'demo' }> {
  if (!supabase) return { medicines: MEDICINES, source: 'demo' }
  try {
    const [medicinesResult, pricesResult] = await Promise.all([
      supabase.from('medicines').select('*'),
      supabase.from('pharmacy_prices').select('*'),
    ])
    if (medicinesResult.error) throw medicinesResult.error
    if (pricesResult.error) throw pricesResult.error
    if (!medicinesResult.data.length) throw new Error('No medicine records found')
    const pricesByMedicine = new Map<string, PharmacyPrice[]>()
    for (const price of pricesResult.data) {
      const rows = pricesByMedicine.get(price.medicine_id) ?? []
      rows.push(price)
      pricesByMedicine.set(price.medicine_id, rows)
    }
    const medicines = medicinesResult.data.map((row) => mapMedicine(row, pricesByMedicine.get(row.id) ?? []))
    if (medicines.some((medicine) => !medicine.name || Object.values(medicine.prices).some((price) => price <= 0))) {
      throw new Error('Incomplete medicine pricing data')
    }
    return { medicines, source: 'live' }
  } catch (error) {
    console.warn('Supabase medicines unavailable; using demo data.', error)
    return { medicines: MEDICINES, source: 'demo' }
  }
}
