'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { CreditCard, Search, Send, Sparkles, TrendingUp, Wallet } from 'lucide-react';
import type { ChatMessage } from '@/lib/ai/chat';

const STEPS = [
  { icon: Wallet, title: 'מוסיפים את הארנק', text: 'כרטיסי האשראי והמועדונים שלכם — בלשונית "ארנק".' },
  { icon: Search, title: 'מחפשים חנות', text: 'כותבים איפה אתם קונים ומזינים סכום.' },
  { icon: TrendingUp, title: 'משלמים בחכמה', text: 'מקבלים דירוג לפי ₪ חיסכון — והכרטיס המנצח מסומן.' },
];

const SUGGESTIONS = [
  'מה הכי משתלם לי בשופרסל?',
  'איזו רשת אופנה נותנת לי הכי הרבה הנחה?',
  'באיזה כרטיס כדאי לתדלק?',
  'אילו הטבות יום הולדת יש לי?',
];

const ERRORS: Record<string, string> = {
  ai_off: 'הצ׳אט החכם כבוי כרגע (אין מפתח AI מוגדר).',
  unauthorized: 'צריך להתחבר מחדש.',
  rate_limited: 'הגעתם למכסת השאלות החינמית לרגע זה. נסו שוב בעוד דקה.',
};

/** Home intro (what the app does, how to use it) plus a free-text AI chat over the user's own benefits. */
export default function HomeGuide() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  async function ask(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    const history: ChatMessage[] = [...messages, { role: 'user', content: q }];
    setMessages([...history, { role: 'assistant', content: '' }]);
    setInput('');
    setBusy(true);
    const write = (content: string) => setMessages((m) => [...m.slice(0, -1), { role: 'assistant', content }]);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history }),
      });
      if (!res.ok || !res.body) {
        const { error } = await res.json().catch(() => ({ error: '' }));
        write(ERRORS[error] ?? 'משהו השתבש. נסו שוב.');
        return;
      }
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let out = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        write((out += value));
      }
    } catch {
      write('אין חיבור. נסו שוב כשתהיו מחוברים.');
    } finally {
      setBusy(false);
    }
  }

  const submit = (e: FormEvent) => { e.preventDefault(); ask(input); };

  return (
    <div className="space-y-5">
      <section className="hero-glow fade-up relative overflow-hidden rounded-3xl border border-line p-5">
        <div className="relative z-10 space-y-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-mint/15 px-3 py-1 text-xs font-semibold text-mint">
            <Sparkles size={14} aria-hidden /> כל ההטבות שלכם במקום אחד
          </span>
          <h2 className="text-2xl font-extrabold leading-tight">
            לעולם לא תשלמו <span className="shimmer-text">יותר מדי</span>
          </h2>
          <p className="text-sm leading-relaxed text-muted">
            האפליקציה יודעת אילו כרטיסי אשראי ומועדונים יש לכם, ומראה ברגע — בכל חנות — עם מה הכי משתלם לשלם ובכמה שקלים תחסכו.
          </p>
        </div>
        <CreditCard className="float-slow absolute -bottom-4 -start-4 text-mint/10" size={120} aria-hidden />
      </section>

      <section className="space-y-2">
        <h2 className="text-xs font-semibold tracking-wide text-dim">איך זה עובד?</h2>
        <ol className="grid gap-2 sm:grid-cols-3">
          {STEPS.map(({ icon: Icon, title, text }, i) => (
            <li key={title} style={{ animationDelay: `${120 + i * 110}ms` }}
              className="fade-up group flex items-start gap-3 rounded-2xl border border-line bg-panel p-3.5 transition hover:-translate-y-0.5 hover:border-mint/40 sm:flex-col">
              <span className="relative grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-panel-2 text-mint transition group-hover:scale-110">
                <Icon size={20} aria-hidden />
                <span className="absolute -end-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-mint text-[11px] font-bold text-mint-ink">{i + 1}</span>
              </span>
              <span>
                <span className="block font-semibold">{title}</span>
                <span className="text-sm text-muted">{text}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section style={{ animationDelay: '480ms' }} aria-label="צ׳אט חכם"
        className="fade-up gradient-border overflow-hidden rounded-3xl">
        <header className="flex items-center gap-3 border-b border-line p-4">
          <span className="pulse-ring grid h-10 w-10 place-items-center rounded-xl bg-mint/15 text-mint">
            <Sparkles size={20} aria-hidden />
          </span>
          <div>
            <h2 className="font-bold">שאלו את העוזר החכם</h2>
            <p className="text-xs text-muted">איפה הכי משתלם? איזו חנות דומה נותנת יותר הנחה?</p>
          </div>
        </header>

        <div ref={listRef} aria-live="polite" className="max-h-80 space-y-2.5 overflow-y-auto p-4">
          {messages.length === 0 ? (
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s, i) => (
                <button key={s} type="button" onClick={() => ask(s)} style={{ animationDelay: `${600 + i * 80}ms` }}
                  className="fade-up rounded-full border border-line bg-panel-2 px-3.5 py-1.5 text-sm text-muted transition hover:border-mint/50 hover:text-fg active:scale-95">
                  {s}
                </button>
              ))}
            </div>
          ) : (
            messages.map((m, i) => (
              <div key={i} className={`pop-in flex ${m.role === 'user' ? 'justify-start' : 'justify-end'}`}>
                <p className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                  m.role === 'user' ? 'rounded-ss-md bg-mint text-mint-ink' : 'rounded-se-md bg-panel-2 text-fg'
                }`}>
                  {m.content || (
                    <span className="typing inline-flex gap-1" aria-label="חושב">
                      <span /><span /><span />
                    </span>
                  )}
                </p>
              </div>
            ))
          )}
        </div>

        <form onSubmit={submit} className="flex gap-2 border-t border-line p-3">
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="כתבו שאלה חופשית…"
            aria-label="שאלה לעוזר" maxLength={2000}
            className="min-w-0 flex-1 rounded-xl border border-line bg-panel-2 px-3 py-2.5 text-fg placeholder:text-dim focus:border-mint focus:outline-none focus:ring-1 focus:ring-mint" />
          <button type="submit" disabled={busy || !input.trim()} aria-label="שליחה"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-mint text-mint-ink transition hover:brightness-110 active:scale-90 disabled:opacity-40">
            <Send size={18} className="-scale-x-100" aria-hidden />
          </button>
        </form>
      </section>
    </div>
  );
}
