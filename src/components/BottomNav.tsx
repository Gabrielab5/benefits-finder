'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { List, Plus, Search, Settings, Wallet, type LucideIcon } from 'lucide-react';

const TABS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: '/', label: 'איפה אני', icon: Search },
  { href: '/benefits', label: 'כל ההטבות', icon: List },
  { href: '/wallet', label: 'הארנק', icon: Wallet },
  { href: '/import', label: 'ייבוא', icon: Plus },
  { href: '/sources', label: 'מקורות', icon: Settings },
];

export default function BottomNav() {
  const path = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 px-3 pb-[max(env(safe-area-inset-bottom),12px)]">
      <ul className="mx-auto flex max-w-xl rounded-2xl border border-line bg-panel/95 p-1.5 backdrop-blur">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = href === '/' ? path === '/' : path.startsWith(href);
          return (
            <li key={href} className="flex-1">
              <Link href={href} aria-current={active ? 'page' : undefined}
                className={`flex flex-col items-center gap-0.5 rounded-xl py-1.5 text-[11px] transition ${
                  active ? 'bg-panel-2 font-semibold text-mint' : 'text-dim hover:text-muted'
                }`}>
                <Icon size={20} strokeWidth={active ? 2.4 : 1.8} aria-hidden />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
