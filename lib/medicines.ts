import {
  CATEGORIES,
  MEDICINES,
  resolveMedicinePrices,
  type CatalogMedicine,
  type Category,
  type Medicine,
  type MedicineSearchResult,
  type PharmacyPrice,
  type PlatformId,
} from './data'
import { supabase } from './supabase'

const categories = new Set<Category>(CATEGORIES)
const platformIds: Record<string, PlatformId> = {
  tata1mg: 'tata1mg', 'tata 1mg': 'tata1mg', '1mg': 'tata1mg',
  pharmeasy: 'pharmeasy', 'pharm easy': 'pharmeasy',
  netmeds: 'netmeds',
  apollo: 'apollo', 'apollo pharmacy': 'apollo',
  truemeds: 'truemeds',
}

export function mapMedicine(
  row: Medicine | MedicineSearchResult,
  pharmacyPrices?: PharmacyPrice[],
): CatalogMedicine {
  const cachedPrices = pharmacyPrices
    ?? ('pharmacyPrices' in row ? row.pharmacyPrices : undefined)
  const prices: Record<PlatformId, number> = {
    tata1mg: cachedPrices === undefined ? row.mrp : 0,
    pharmeasy: cachedPrices === undefined ? row.mrp : 0,
    netmeds: cachedPrices === undefined ? row.mrp : 0,
    apollo: cachedPrices === undefined ? row.mrp : 0,
    truemeds: cachedPrices === undefined ? row.mrp : 0,
  }
  const livePricePlatforms = new Set<PlatformId>()
  const latestPrices = new Map<PlatformId, PharmacyPrice>()
  for (const price of cachedPrices ?? []) {
    const platformId = platformIds[price.platform_name.trim().toLowerCase()]
    if (!platformId) continue
    const parsedPrice = Number(price.price)
    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) continue
    const currentPrice = latestPrices.get(platformId)
    if (!currentPrice || Date.parse(price.updated_at) > Date.parse(currentPrice.updated_at)) {
      latestPrices.set(platformId, price)
    }
  }
  for (const [platformId, price] of latestPrices) {
    prices[platformId] = Number(price.price)
    livePricePlatforms.add(platformId)
  }
  const normalizedCategory = row.category.trim()
  const mappedCategories = categories.has(normalizedCategory as Category) ? [normalizedCategory as Category] : []
  const catalogMedicine: CatalogMedicine = {
    id: row.id,
    name: row.brand_name,
    pack: row.pack_size ?? '',
    salt: row.salt_composition ?? '',
    manufacturer: row.manufacturer ?? '',
    mrp: row.mrp,
    categories: mappedCategories,
    rxRequired: row.is_rx_required,
    prices: 'resolvedPrices' in row ? row.resolvedPrices : prices,
    livePricePlatforms: 'livePricePlatforms' in row
      ? row.livePricePlatforms
      : [...livePricePlatforms],
    estimatedPricePlatforms: 'estimatedPricePlatforms' in row
      ? row.estimatedPricePlatforms
      : undefined,
    pharmacyPrices: cachedPrices,
  }
  return resolveMedicinePrices(catalogMedicine)
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
    if (medicines.some((medicine) => (
      !medicine.name
      || Object.values(medicine.prices).some((price) => typeof price === 'number' && price <= 0)
    ))) {
      throw new Error('Incomplete medicine pricing data')
    }
    return { medicines, source: 'live' }
  } catch (error) {
    console.warn('Supabase medicines unavailable; using demo data.', error)
    return { medicines: MEDICINES, source: 'demo' }
  }
}
