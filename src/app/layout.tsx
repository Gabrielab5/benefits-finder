import type { Metadata, Viewport } from 'next';
import { Heebo } from 'next/font/google';
import SwRegister from '@/components/SwRegister';
import './globals.css';

const heebo = Heebo({ subsets: ['hebrew', 'latin'] });

export const metadata: Metadata = {
  title: 'ההטבות שלי',
  description: 'איזה כרטיס להוציא בקופה',
  appleWebApp: { capable: true, title: 'הטבות', statusBarStyle: 'default' },
};

export const viewport: Viewport = { themeColor: '#1d4ed8', viewportFit: 'cover' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <body className={`${heebo.className} bg-gray-50 text-gray-900 antialiased`}>
        {children}
        <SwRegister />
      </body>
    </html>
  );
}
