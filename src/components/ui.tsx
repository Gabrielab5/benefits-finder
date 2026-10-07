import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

/** Shared look for text inputs, selects and textareas. */
export const field =
  'w-full rounded-xl border border-line bg-panel-2 px-3 py-2.5 text-fg placeholder:text-dim ' +
  'focus:border-mint focus:outline-none focus:ring-1 focus:ring-mint disabled:opacity-50';

const VARIANTS = {
  primary: 'bg-mint text-mint-ink font-semibold hover:brightness-110',
  secondary: 'border border-line bg-panel-2 text-fg hover:border-dim',
  ghost: 'text-mint hover:bg-panel-2',
  danger: 'text-bad hover:bg-panel-2',
} as const;

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof VARIANTS }) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 ${VARIANTS[variant]} ${className}`}
    />
  );
}

export function Card({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={`rounded-2xl border border-line bg-panel p-4 ${className}`} />;
}

export function Chip({
  active = false,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      {...props}
      className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm transition ${
        active ? 'bg-mint font-semibold text-mint-ink' : 'border border-line text-muted hover:text-fg'
      } ${className}`}
    />
  );
}

export function PageHeader({ title, subtitle, icon: Icon }: { title: string; subtitle?: string; icon?: LucideIcon }) {
  return (
    <header className="flex items-center gap-3 pt-2">
      {Icon && (
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-panel-2 text-mint">
          <Icon size={20} aria-hidden />
        </span>
      )}
      <div>
        <h1 className="text-xl font-bold text-fg">{title}</h1>
        {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
      </div>
    </header>
  );
}

const TONES = {
  info: 'border-line bg-panel-2 text-muted',
  warn: 'border-warn/30 bg-warn/10 text-warn',
  error: 'border-bad/30 bg-bad/10 text-bad',
  success: 'border-mint/30 bg-mint/10 text-mint',
} as const;

export function Notice({ tone = 'info', children }: { tone?: keyof typeof TONES; children: ReactNode }) {
  return <p className={`rounded-xl border px-3 py-2 text-sm ${TONES[tone]}`}>{children}</p>;
}

export function Loading() {
  return (
    <div className="space-y-3 p-4" aria-label="טוען">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-20 animate-pulse rounded-2xl bg-panel" />
      ))}
    </div>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="text-xs font-semibold tracking-wide text-dim">{children}</h2>;
}
