import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import Waiting from './Waiting';

/** Shared look for text inputs, selects and textareas. */
export const field =
  'w-full rounded-xl border border-line bg-panel-2 px-3 py-2.5 text-fg placeholder:text-dim ' +
  'focus:border-mint focus:outline-none focus:ring-1 focus:ring-mint disabled:opacity-50';

/**
 * Callback ref for the first field of a form that opens below the fold (often under the floating nav):
 * scrolls it into view and focuses it, once, when it mounts.
 */
export function reveal(el: HTMLElement | null) {
  if (!el) return;
  const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ block: 'center', behavior: smooth ? 'smooth' : 'auto' });
  el.focus({ preventScroll: true });
}

const VARIANTS = {
  primary: 'shiny bg-mint text-mint-ink font-semibold hover:brightness-110',
  secondary: 'border border-line bg-panel-2 text-fg hover:border-mint/60 hover:text-mint',
  ghost: 'text-mint hover:bg-panel-2',
  danger: 'text-bad hover:bg-panel-2',
} as const;

/** `loading`: disabled with a spinner right away, so a tap always shows it registered. */
export function Button({
  variant = 'primary',
  className = '',
  loading = false,
  disabled,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof VARIANTS; loading?: boolean }) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm transition active:scale-[0.98] disabled:pointer-events-none ${loading ? 'disabled:opacity-80' : 'disabled:opacity-40'} ${VARIANTS[variant]} ${className}`}
    >
      {loading && <span className="btn-spinner" aria-hidden />}
      {children}
    </button>
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
      className={`tap shrink-0 rounded-full px-3.5 py-1.5 text-sm transition ${
        active ? 'shiny bg-mint font-semibold text-mint-ink' : 'border border-line bg-panel/60 text-muted hover:border-violet/60 hover:text-fg'
      } ${className}`}
    />
  );
}

export function PageHeader({ title, subtitle, icon: Icon }: { title: string; subtitle?: string; icon?: LucideIcon }) {
  return (
    <header className="flex items-center gap-3 pt-2">
      {Icon && (
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-violet/30 to-mint/20 text-mint ring-1 ring-white/10">
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
  // Screen readers announce errors at once and a success when they pause; info and warnings stay quiet.
  const role = tone === 'error' ? 'alert' : tone === 'success' ? 'status' : undefined;
  return <p role={role} className={`rounded-xl border px-3 py-2 text-sm ${TONES[tone]}`}>{children}</p>;
}

export function Loading({ label = 'טוענים את ההטבות שלכם' }: { label?: string }) {
  return <Waiting label={label} />;
}

export function SectionTitle({ children, as: Tag = 'h2' }: { children: ReactNode; as?: 'h2' | 'h3' }) {
  return <Tag className="text-xs font-semibold tracking-wide text-dim">{children}</Tag>;
}
