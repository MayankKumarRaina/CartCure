export const AFFILIATE_LINKS: Record<string, string> = {
  netmeds: 'https://bitli.in/fXSeE3g',
  pharmeasy: 'https://bitli.in/RgPA7jb',
  truemeds: 'https://bitli.in/q5BzlAJ',
  healthkart: 'https://bitli.in/J3FhuXc',
  truebasics: 'https://bitli.in/flUn3nX',
}

export const WELLNESS_PARTNERS = [
  { id: 'healthkart', name: 'HealthKart', badge: 'HK' },
  { id: 'truebasics', name: 'TrueBasics', badge: 'TB' },
] as const

export function hasAffiliateLink(platformId: string): boolean {
  const url = AFFILIATE_LINKS[platformId.trim().toLowerCase()]
  return typeof url === 'string' && url.trim().length > 0
}

export type StoreClickSource =
  | 'card_hero'
  | 'card_chip'
  | 'card_drawer'
  | 'basket_checkout'
  | 'partner_banner'

export type TrackAndOpenStoreParams = {
  platformId: string
  targetUrl: string
  medicineId?: string | number
  medicineName?: string
  clickedPrice?: number | null
  sourceComponent: StoreClickSource
  basketSize?: number
}

export function trackAndOpenStore(params: TrackAndOpenStoreParams): void {
  const payload = {
    platformId: params.platformId,
    isAffiliate: hasAffiliateLink(params.platformId),
    medicineId: params.medicineId,
    medicineName: params.medicineName,
    clickedPrice: params.clickedPrice,
    sourceComponent: params.sourceComponent,
    basketSize: params.basketSize,
  }

  try {
    const body = new Blob([JSON.stringify(payload)], { type: 'application/json' })
    if (!navigator.sendBeacon('/api/track-click', body)) {
      void fetch('/api/track-click', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true,
      }).catch(() => {})
    }
  } catch {
    void fetch('/api/track-click', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {})
  }

  window.open(params.targetUrl, '_blank', 'noopener,noreferrer')
}

export function getAffiliateUrl(platformKey: string, fallbackUrl: string): string {
  return AFFILIATE_LINKS[platformKey.trim().toLowerCase()] || fallbackUrl
}
