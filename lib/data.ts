export type PlatformId = 'tata1mg' | 'pharmeasy' | 'netmeds' | 'apollo' | 'truemeds'
export type WellnessPartnerId = 'healthkart' | 'truebasics'
export type PriceStoreId = PlatformId | WellnessPartnerId
export type MedicinePrices = Record<PlatformId, number> & Record<WellnessPartnerId, number | null>

export const CATEGORIES = [
  'Anti Diabetic',
  'Anti Infectives',
  'Anti Malarials',
  'Anti Neoplastics',
  'Blood Related',
  'Cardiac',
  'Derma',
  'Gastro Intestinal',
  'Gynaecological',
  'Hormones',
  'Neuro Cns',
  'Ophthal',
  'Ophthal Otologicals',
  'Otologicals',
  'Pain Analgesics',
  'Respiratory',
  'Sex Stimulants Rejuvenators',
  'Stomatologicals',
  'Urology',
  'Vaccines',
  'Vitamins & Nutrition',
  'Other',
] as const

export type Category = (typeof CATEGORIES)[number]

export type Membership = {
  name: string
  fee: number
  durationMonths: number
  benefitPct: number
  benefitLabel: string
  freeDelivery: boolean
}

export type Platform = {
  id: PlatformId
  name: string
  shortName: string
  deliveryFee: number
  freeDeliveryAbove: number
  membership: Membership
  searchUrl: (query: string) => string
}

export type Medicine = {
  id: string
  brand_name: string
  salt_composition: string | null
  pack_size: string | null
  manufacturer: string | null
  category: string
  search_count: number
  mrp: number
  is_rx_required: boolean
  price_1mg?: number | null
  price_pharmeasy?: number | null
  price_netmeds?: number | null
  price_apollo?: number | null
  price_truemeds?: number | null
  price_healthkart?: number | null
  price_truebasics?: number | null
  store_urls?: Partial<Record<PriceStoreId | '1mg', string>> | null
  in_stock?: boolean | null
}

export type CatalogMedicine = {
  id: string
  name: string
  pack: string
  salt: string
  manufacturer: string
  mrp: number
  categories: Category[]
  rxRequired: boolean
  prices: MedicinePrices
  livePricePlatforms?: PlatformId[]
  estimatedPricePlatforms?: PriceStoreId[]
  pharmacyPrices?: PharmacyPrice[]
  productUrls?: Partial<Record<PriceStoreId, string>>
  databasePrices?: Partial<Record<PlatformId, number | null>>
}

export type PharmacyPrice = {
  medicine_id: string
  platform_name: string
  price: number
  in_stock?: boolean | null
  updated_at: string
}

export type MedicineSearchResult = Medicine & {
  pharmacyPrices: PharmacyPrice[]
  resolvedPrices: MedicinePrices
  livePricePlatforms: PlatformId[]
  estimatedPricePlatforms: PriceStoreId[]
}

function stableHash(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function estimatedPrice(mrp: number, seed: string, minimumDiscount: number, discountRange: number) {
  const hash = stableHash(seed)
  const discount = minimumDiscount + (hash % discountRange) / 100
  return Math.round(mrp * (1 - discount))
}

export function resolveMedicinePrices(medicine: CatalogMedicine): CatalogMedicine {
  if (!Number.isFinite(medicine.mrp) || medicine.mrp <= 0) return medicine

  const prices = { ...medicine.prices }
  const estimatedPlatforms = new Set(medicine.estimatedPricePlatforms ?? [])
  const reservedPrices = new Set<number>()
  const platformIds: PlatformId[] = ['truemeds', 'pharmeasy', 'netmeds', 'tata1mg', 'apollo']
  const minimumPrice = Math.round(medicine.mrp * 0.8)
  const maximumPrice = Math.round(medicine.mrp * 0.92)
  const priceRange = Math.max(1, maximumPrice - minimumPrice + 1)

  for (const platformId of platformIds) {
    const currentPrice = prices[platformId]
    if (typeof currentPrice === 'number' && Number.isFinite(currentPrice) && currentPrice > 0) {
      if (!estimatedPlatforms.has(platformId)) {
        reservedPrices.add(currentPrice)
        continue
      }
    }
    if (
      medicine.databasePrices
      && medicine.databasePrices[platformId] !== null
      && medicine.databasePrices[platformId] !== undefined
    ) {
      continue
    }

    let price = estimatedPrice(
      medicine.mrp,
      `${medicine.id}:${medicine.name}:${platformId}`,
      0.08,
      13,
    )
    let attempts = 0
    while (reservedPrices.has(price) && attempts < priceRange) {
      price = minimumPrice + ((price - minimumPrice + 1) % priceRange)
      attempts += 1
    }
    prices[platformId] = price
    reservedPrices.add(price)
    estimatedPlatforms.add(platformId)
  }

  const details = `${medicine.name} ${medicine.salt} ${medicine.categories.join(' ')}`.toLowerCase()
  const isWellness = /vitamin|calcium|calcitriol|omega|protein|zinc|d3|b12|iron|multivitamin|supplement/.test(details)
  if (isWellness && !medicine.rxRequired) {
    for (const partnerId of ['healthkart', 'truebasics'] as const) {
      const currentPrice = prices[partnerId]
      if (typeof currentPrice === 'number' && Number.isFinite(currentPrice) && currentPrice > 0) {
        if (!estimatedPlatforms.has(partnerId)) continue
      }
      prices[partnerId] = estimatedPrice(
        medicine.mrp,
        `${medicine.id}:${medicine.name}:${partnerId}`,
        0.12,
        7,
      )
      estimatedPlatforms.add(partnerId)
    }
  }

  return {
    ...medicine,
    prices,
    estimatedPricePlatforms: [...estimatedPlatforms],
  }
}

export const PLATFORMS: Platform[] = [
  { id: 'tata1mg', name: 'Tata 1mg', shortName: '1mg', deliveryFee: 69, freeDeliveryAbove: 1499, membership: { name: 'Care Plan', fee: 165, durationMonths: 3, benefitPct: 0.04, benefitLabel: '4% extra discount', freeDelivery: true }, searchUrl: (q) => `https://www.1mg.com/search/all?name=${encodeURIComponent(q)}` },
  { id: 'pharmeasy', name: 'PharmEasy', shortName: 'PharmEasy', deliveryFee: 50, freeDeliveryAbove: 1999, membership: { name: 'Plus', fee: 399, durationMonths: 6, benefitPct: 0.05, benefitLabel: '5% cashback', freeDelivery: true }, searchUrl: (q) => `https://pharmeasy.in/search/all?name=${encodeURIComponent(q)}` },
  { id: 'netmeds', name: 'Netmeds', shortName: 'Netmeds', deliveryFee: 49, freeDeliveryAbove: 1499, membership: { name: 'First', fee: 149, durationMonths: 6, benefitPct: 0.03, benefitLabel: '3% NMS SuperCash', freeDelivery: true }, searchUrl: (q) => `https://www.netmeds.com/catalogsearch/result/${encodeURIComponent(q)}/all` },
  { id: 'apollo', name: 'Apollo Pharmacy', shortName: 'Apollo', deliveryFee: 40, freeDeliveryAbove: 1000, membership: { name: 'Circle', fee: 149, durationMonths: 6, benefitPct: 0.05, benefitLabel: '5% extra discount', freeDelivery: true }, searchUrl: (q) => `https://www.apollopharmacy.in/search-medicines/${encodeURIComponent(q)}` },
  { id: 'truemeds', name: 'Truemeds', shortName: 'Truemeds', deliveryFee: 50, freeDeliveryAbove: 500, membership: { name: 'Standard', fee: 0, durationMonths: 6, benefitPct: 0, benefitLabel: '-', freeDelivery: false }, searchUrl: (q) => `https://www.truemeds.in/search?q=${encodeURIComponent(q)}` },
]

export const PLATFORM_BY_ID = Object.fromEntries(PLATFORMS.map((p) => [p.id, p])) as Record<PlatformId, Platform>

export const MEDICINES: CatalogMedicine[] = [
  { id: 'telma-40', name: 'Telma 40mg Tablet', pack: 'Strip of 15 tablets', salt: 'Telmisartan (40mg)', manufacturer: 'Glenmark Pharmaceuticals', mrp: 248, categories: ['Cardiac'], rxRequired: true, prices: { tata1mg: 220, pharmeasy: 205, netmeds: 230, apollo: 215, truemeds: 198, healthkart: null, truebasics: null } },
  { id: 'glycomet-gp-1', name: 'Glycomet GP 1 Tablet PR', pack: 'Strip of 15 tablets', salt: 'Glimepiride (1mg) + Metformin (500mg)', manufacturer: 'USV Ltd', mrp: 162, categories: ['Anti Diabetic'], rxRequired: true, prices: { tata1mg: 142, pharmeasy: 148, netmeds: 136, apollo: 145, truemeds: 130, healthkart: null, truebasics: null } },
  { id: 'thyronorm-100', name: 'Thyronorm 100mcg Tablet', pack: 'Bottle of 120 tablets', salt: 'Thyroxine (100mcg)', manufacturer: 'Abbott', mrp: 232, categories: [], rxRequired: true, prices: { tata1mg: 199, pharmeasy: 207, netmeds: 212, apollo: 205, truemeds: 185, healthkart: null, truebasics: null } }
]

export const QUICK_FILTERS: Category[] = [...CATEGORIES]