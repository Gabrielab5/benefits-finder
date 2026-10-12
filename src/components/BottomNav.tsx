'use client';
import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Layers, List, Plus, Search, Settings, Wallet, type LucideIcon } from 'lucide-react';

const TABS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: '/', label: 'איפה אני', icon: Search },
  { href: '/benefits', label: 'כל ההטבות', icon: List },
  { href: '/wallet', label: 'הארנק', icon: Wallet },
  { href: '/import', label: 'ייבוא', icon: Plus },
  { href: '/sources', label: 'מקורות', icon: Layers },
  { href: '/settings', label: 'הגדרות', icon: Settings },
];

const isActive = (href: string, path: string) => (href === '/' ? path === '/' : path.startsWith(href));

/** Touch starts inside something that scrolls sideways or takes input — leave the gesture to it. */
function ownsSwipe(el: Element | null): boolean {
  for (; el && el !== document.body; el = el.parentElement) {
    if (el.matches('input, textarea, select, [contenteditable]')) return true;
    const x = getComputedStyle(el).overflowX;
    if ((x === 'auto' || x === 'scroll') && el.scrollWidth > el.clientWidth) return true;
  }
  return false;
}

export default function BottomNav() {
  const path = usePathname();
  const router = useRouter();

  // Swipe between tabs. RTL: tabs run right→left, so swiping right moves to the next tab.
  useEffect(() => {
    let start: { x: number; y: number } | null = null;
    const down = (e: TouchEvent) => {
      start = e.touches.length === 1 && !ownsSwipe(e.target as Element) ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
    };
    const up = (e: TouchEvent) => {
      if (!start) return;
      const dx = e.changedTouches[0].clientX - start.x;
      const dy = e.changedTouches[0].clientY - start.y;
      start = null;
      if (Math.abs(dx) < 70 || Math.abs(dy) > Math.abs(dx) * 0.6) return;
      const i = TABS.findIndex((t) => isActive(t.href, path));
      const next = i >= 0 && TABS[i + (dx > 0 ? 1 : -1)];
      if (next) router.push(next.href);
    };
    document.addEventListener('touchstart', down, { passive: true });
    document.addEventListener('touchend', up, { passive: true });
    return () => {
      document.removeEventListener('touchstart', down);
      document.removeEventListener('touchend', up);
    };
  }, [path, router]);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 px-3 pb-[max(env(safe-area-inset-bottom),12px)]">
      <ul className="mx-auto flex max-w-xl rounded-2xl border border-line bg-panel/95 p-1.5 backdrop-blur">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = isActive(href, path);
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
