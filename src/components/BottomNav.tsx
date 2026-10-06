'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/', label: 'איפה אני', icon: '🔍' },
  { href: '/benefits', label: 'כל ההטבות', icon: '📋' },
  { href: '/wallet', label: 'הארנק', icon: '💳' },
  { href: '/import', label: 'ייבוא', icon: '➕' },
  { href: '/sources', label: 'מקורות', icon: '⚙️' },
];

export default function BottomNav() {
  const path = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto flex max-w-xl">
        {TABS.map((t) => {
          const active = t.href === '/' ? path === '/' : path.startsWith(t.href);
          return (
            <li key={t.href} className="flex-1">
              <Link href={t.href} aria-current={active ? 'page' : undefined}
                className={`flex flex-col items-center py-2 text-xs ${active ? 'font-semibold text-blue-700' : 'text-gray-500'}`}>
                <span className="text-xl" aria-hidden>{t.icon}</span>
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
