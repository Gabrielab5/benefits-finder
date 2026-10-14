import Link from 'next/link';
import { ChevronLeft, Ellipsis, Layers, Plus, Settings, type LucideIcon } from 'lucide-react';
import { PageHeader } from '@/components/ui';

const LINKS: { href: string; title: string; text: string; icon: LucideIcon }[] = [
  { href: '/import', title: 'הוספת הטבות', text: 'מכרטיס או מועדון שלא בקטלוג', icon: Plus },
  { href: '/sources', title: 'הקטלוג', text: 'כל כרטיסי האשראי והמועדונים, וההטבות שלהם', icon: Layers },
  { href: '/settings', title: 'הגדרות', text: 'תאריכים, התראות ויציאה', icon: Settings },
];

/** The screens that don't need a tab of their own. */
export default function MorePage() {
  return (
    <main className="space-y-4">
      <PageHeader title="עוד" icon={Ellipsis} />
      <ul className="space-y-1 rounded-2xl border border-line bg-panel p-1.5">
        {LINKS.map(({ href, title, text, icon: Icon }) => (
          <li key={href}>
            <Link href={href} className="flex items-center gap-3 rounded-xl p-3 hover:bg-panel-2">
              <Icon size={20} className="shrink-0 text-dim" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{title}</span>
                <span className="block text-sm text-muted">{text}</span>
              </span>
              <ChevronLeft size={18} className="shrink-0 text-dim" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
