export type PlatformId = 'tata1mg' | 'pharmeasy' | 'netmeds' | 'apollo' | 'truemeds' | 'medplus'

export type Category = 'Diabetes' | 'Blood Pressure' | 'Thyroid' | 'Heart Care' | 'Gastro' | 'Respiratory' | 'Pain Relief' | 'Vitamins & Supplements' | 'Neurological'

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
  name: string
  pack: string
  salt: string
  manufacturer: string
  mrp: number
  categories: Category[]
  rxRequired: boolean
  prices: Record<PlatformId, number>
  productUrls?: Partial<Record<PlatformId, string>>
}

export const PLATFORMS: Platform[] = [
  { id: 'tata1mg', name: 'Tata 1mg', shortName: '1mg', deliveryFee: 69, freeDeliveryAbove: 1499, membership: { name: 'Care Plan', fee: 165, durationMonths: 3, benefitPct: 0.04, benefitLabel: '4% extra discount', freeDelivery: true }, searchUrl: (q) => `https://www.1mg.com/search/all?name=${encodeURIComponent(q)}` },
  { id: 'pharmeasy', name: 'PharmEasy', shortName: 'PharmEasy', deliveryFee: 50, freeDeliveryAbove: 1999, membership: { name: 'Plus', fee: 399, durationMonths: 6, benefitPct: 0.05, benefitLabel: '5% cashback', freeDelivery: true }, searchUrl: (q) => `https://pharmeasy.in/search/all?name=${encodeURIComponent(q)}` },
  { id: 'netmeds', name: 'Netmeds', shortName: 'Netmeds', deliveryFee: 49, freeDeliveryAbove: 1499, membership: { name: 'First', fee: 149, durationMonths: 6, benefitPct: 0.03, benefitLabel: '3% NMS SuperCash', freeDelivery: true }, searchUrl: (q) => `https://www.netmeds.com/catalogsearch/result/${encodeURIComponent(q)}/all` },
  { id: 'apollo', name: 'Apollo Pharmacy', shortName: 'Apollo', deliveryFee: 40, freeDeliveryAbove: 1000, membership: { name: 'Circle', fee: 149, durationMonths: 6, benefitPct: 0.05, benefitLabel: '5% extra discount', freeDelivery: true }, searchUrl: (q) => `https://www.apollopharmacy.in/search-medicines/${encodeURIComponent(q)}` },
  { id: 'truemeds', name: 'Truemeds', shortName: 'Truemeds', deliveryFee: 50, freeDeliveryAbove: 500, membership: { name: 'Standard', fee: 0, durationMonths: 6, benefitPct: 0, benefitLabel: '-', freeDelivery: false }, searchUrl: (q) => `https://www.truemeds.in/search?q=${encodeURIComponent(q)}` },
  { id: 'medplus', name: 'MedPlus Mart', shortName: 'MedPlus', deliveryFee: 35, freeDeliveryAbove: 500, membership: { name: 'Advantage', fee: 99, durationMonths: 6, benefitPct: 0, benefitLabel: 'Special Pricing', freeDelivery: false }, searchUrl: (q) => `https://www.medplusmart.com/search/${encodeURIComponent(q)}` },
]

export const PLATFORM_BY_ID = Object.fromEntries(PLATFORMS.map((p) => [p.id, p])) as Record<PlatformId, Platform>

export const MEDICINES: Medicine[] = [
  { id: 'telma-40', name: 'Telma 40mg Tablet', pack: 'Strip of 15 tablets', salt: 'Telmisartan (40mg)', manufacturer: 'Glenmark Pharmaceuticals', mrp: 248, categories: ['Blood Pressure', 'Heart Care'], rxRequired: true, prices: { tata1mg: 220, pharmeasy: 205, netmeds: 230, apollo: 215, truemeds: 198, medplus: 225 } },
  { id: 'glycomet-gp-1', name: 'Glycomet GP 1 Tablet PR', pack: 'Strip of 15 tablets', salt: 'Glimepiride (1mg) + Metformin (500mg)', manufacturer: 'USV Ltd', mrp: 162, categories: ['Diabetes'], rxRequired: true, prices: { tata1mg: 142, pharmeasy: 148, netmeds: 136, apollo: 145, truemeds: 130, medplus: 140 } },
  { id: 'thyronorm-100', name: 'Thyronorm 100mcg Tablet', pack: 'Bottle of 120 tablets', salt: 'Thyroxine (100mcg)', manufacturer: 'Abbott', mrp: 232, categories: ['Thyroid'], rxRequired: true, prices: { tata1mg: 199, pharmeasy: 207, netmeds: 212, apollo: 205, truemeds: 185, medplus: 210 } }
]

export const QUICK_FILTERS: Category[] = ['Diabetes', 'Blood Pressure', 'Thyroid', 'Heart Care']