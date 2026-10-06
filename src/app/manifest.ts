import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'ההטבות שלי',
    short_name: 'הטבות',
    start_url: '/',
    display: 'standalone',
    dir: 'rtl',
    lang: 'he',
    background_color: '#f9fafb',
    theme_color: '#1d4ed8',
    icons: [{ src: '/icon', sizes: '512x512', type: 'image/png' }],
  };
}
