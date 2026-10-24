export const AFFILIATE_LINKS: Record<string, string> = {
  netmeds: 'https://bitli.in/fXSeE3g',
  pharmeasy: 'https://bitli.in/RgPA7jb',
  truemeds: 'https://bitli.in/q5BzlAJ',
  healthkart: 'https://bitli.in/J3FhuXc',
  truebasics: 'https://bitli.in/flUn3nX',
}

export function getAffiliateUrl(platformKey: string, fallbackUrl: string): string {
  return AFFILIATE_LINKS[platformKey.toLowerCase()] || fallbackUrl
}
