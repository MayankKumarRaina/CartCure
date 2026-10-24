import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'DawaDaam',
    short_name: 'DawaDaam',
    description: 'Compare medicine prices across 6 Indian pharmacies',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#0d9488',
    icons: [
      { src: '/dawadaam-icon.png', sizes: '192x192', type: 'image/png' },
      { src: '/dawadaam-icon.png', sizes: '512x512', type: 'image/png' },
    ],
  }
}
