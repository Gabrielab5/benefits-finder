'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ChevronDown, MessageCircle, Send } from 'lucide-react';
import { Chip } from '@/components/ui';
import type { ChatMessage } from '@/lib/ai/chat';

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

/** Free-text AI chat over the user's own benefits, folded into one row on home until it's opened. */
export default function AssistantChat() {
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
        write(ERRORS[error] ?? 'הצ׳אט לא הצליח לענות הפעם. נסו לשאול שוב בעוד רגע.');
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
    <details className="group rounded-2xl border border-line bg-panel">
      <summary className="flex cursor-pointer list-none items-center gap-3 rounded-2xl p-3.5 text-muted hover:text-fg">
        <MessageCircle size={18} aria-hidden />
        <span className="flex-1 font-semibold">שאלו את העוזר</span>
        <ChevronDown size={18} className="transition group-open:rotate-180" aria-hidden />
      </summary>

      <div ref={listRef} aria-live="polite" className="max-h-80 space-y-2.5 overflow-y-auto border-t border-line p-4">
        {messages.length === 0 ? (
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <Chip key={s} aria-pressed={undefined} onClick={() => ask(s)}>{s}</Chip>
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
    </details>
  );
}
