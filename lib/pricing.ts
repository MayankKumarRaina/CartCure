import { MEDICINES, PLATFORMS, type CatalogMedicine, type Platform, type PlatformId } from './data'

export type CartItem = { medicine: CatalogMedicine; qty: number }
export type CartLine = CartItem

export type PlatformQuote = {
  platform: Platform
  subtotal: number
  delivery: number
  standardTotal: number
  memberBenefit: number
  deliverySaved: number
  savingsPerOrder: number
  memberPayToday: number
  amortizedFee: number
  memberEffectivePerRefill: number
  refillsToBreakEven: number
  profitableFromFirstCart: boolean
  worthIt: boolean
  periodNetSavings: number
}

export type BestOption = {
  platform: Platform
  withMembership: boolean
  cost: number
  savings: number
}

export function toCartLines(items: Record<string, number>, medicines: CatalogMedicine[] = MEDICINES): CartLine[] {
  const medicineById = Object.fromEntries(medicines.map((m) => [m.id, m]))
  return Object.entries(items)
    .filter(([, qty]) => qty > 0)
    .map(([id, qty]) => ({ medicine: medicineById[id], qty }))
    .filter((line) => Boolean(line.medicine))
}

export function quoteFor(platform: Platform, lines: CartLine[]): PlatformQuote {
  const subtotal = lines.reduce((sum, l) => sum + l.medicine.prices[platform.id] * l.qty, 0)
  const delivery =
    subtotal === 0 || subtotal >= platform.freeDeliveryAbove ? 0 : platform.deliveryFee
  const standardTotal = subtotal + delivery

  const { fee, durationMonths, benefitPct, freeDelivery } = platform.membership
  const memberBenefit = Math.round(subtotal * benefitPct)
  const deliverySaved = freeDelivery ? delivery : 0
  const savingsPerOrder = memberBenefit + deliverySaved
  const amortizedFee = fee / durationMonths
  const memberPayToday = subtotal - memberBenefit + fee
  const memberEffectivePerRefill = Math.round(subtotal - memberBenefit + amortizedFee)
  const refillsToBreakEven = savingsPerOrder > 0 ? Math.ceil(fee / savingsPerOrder) : Infinity

  return {
    platform,
    subtotal,
    delivery,
    standardTotal,
    memberBenefit,
    deliverySaved,
    savingsPerOrder,
    memberPayToday,
    amortizedFee,
    memberEffectivePerRefill,
    refillsToBreakEven,
    profitableFromFirstCart: savingsPerOrder >= fee,
    worthIt: refillsToBreakEven <= durationMonths,
    periodNetSavings: savingsPerOrder * durationMonths - fee,
  }
}

// Replace your existing quoteAll function with this:

export function quoteAll(lines: CartLine[], platforms: Platform[] = PLATFORMS): PlatformQuote[] {
  return platforms.map((p) => quoteFor(p, lines))
}

export function bestOption(quotes: PlatformQuote[], includeMemberships: boolean): BestOption | null {
  if (quotes.length === 0 || quotes[0].subtotal === 0) return null
  const worst = Math.max(...quotes.map((q) => q.standardTotal))

  const candidates = quotes.flatMap((q) => {
    const options = [{ platform: q.platform, withMembership: false, cost: q.standardTotal }]
    if (includeMemberships && q.worthIt && q.memberEffectivePerRefill < q.standardTotal) {
      options.push({ platform: q.platform, withMembership: true, cost: q.memberEffectivePerRefill })
    }
    return options
  })

  const best = candidates.reduce((a, b) => (b.cost < a.cost ? b : a))
  return { ...best, savings: Math.max(0, worst - best.cost) }
}

export function lowestPlatformFor(medicine: CatalogMedicine): PlatformId {
  return PLATFORMS.reduce((a, b) => (medicine.prices[b.id] < medicine.prices[a.id] ? b : a)).id
}

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})

export function formatINR(value: number) {
  return inr.format(Math.round(value))
}
