import type { Metadata, Viewport } from 'next';
import { Heebo } from 'next/font/google';
import SwRegister from '@/components/SwRegister';
import './globals.css';

const heebo = Heebo({ subsets: ['hebrew', 'latin'] });

export const metadata: Metadata = {
  title: 'ההטבות שלי',
  description: 'איזה כרטיס להוציא בקופה',
  appleWebApp: { capable: true, title: 'הטבות', statusBarStyle: 'black-translucent' },
};

export const viewport: Viewport = { themeColor: '#0e1424', viewportFit: 'cover', colorScheme: 'dark' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <body className={`${heebo.className} min-h-dvh bg-ink text-fg antialiased`}>
        {children}
        <SwRegister />
      </body>
    </html>
  );
}
