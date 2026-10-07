import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'ההטבות שלי',
    short_name: 'הטבות',
    start_url: '/',
    display: 'standalone',
    dir: 'rtl',
    lang: 'he',
    background_color: '#0e1424',
    theme_color: '#0e1424',
    icons: [{ src: '/icon', sizes: '512x512', type: 'image/png' }],
  };
}
