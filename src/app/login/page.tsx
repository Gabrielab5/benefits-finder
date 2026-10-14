'use client';
import { useState, type FormEvent } from 'react';
import { ArrowRight, Mail } from 'lucide-react';
import LoginCollage from '@/components/LoginCollage';
import { Button, Notice, field } from '@/components/ui';
import Waiting from '@/components/Waiting';
import { TRUST_LINES } from '@/lib/core/labels';
import { supabaseBrowser } from '@/lib/supabase/browser';

function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

/** One real input (so paste and SMS/e-mail autofill work) drawn as separate digit boxes. */
function CodeBoxes({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const boxes = Math.max(6, value.length);
  return (
    <label className="group relative block" dir="ltr">
      <span className="sr-only">קוד</span>
      <input inputMode="numeric" autoComplete="one-time-code" maxLength={8} required value={value} autoFocus
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
        className="absolute inset-0 z-10 h-full w-full opacity-0" />
      <span className="flex justify-center gap-2" aria-hidden>
        {Array.from({ length: boxes }, (_, i) => (
          <span key={i}
            className={`grid h-14 w-11 place-items-center rounded-xl border bg-panel-2 text-2xl font-semibold ${
              i === value.length ? 'border-line group-focus-within:border-mint group-focus-within:ring-1 group-focus-within:ring-mint' : 'border-line'
            }`}>
            {value[i] ?? ''}
          </span>
        ))}
      </span>
    </label>
  );
}

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState<string | null>(null); // full-screen wait while the browser moves on

  async function sendCode(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabaseBrowser().auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: false, emailRedirectTo: `${location.origin}/auth/callback` },
    });
    setBusy(false);
    if (error) setError('לא הצלחנו לשלוח קוד לכתובת הזו. הכניסה פתוחה רק לכתובות שהוזמנו: בדקו שזו הכתובת שקיבלה הזמנה, או נסו שוב בעוד דקה.');
    else setSent(true);
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabaseBrowser().auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' });
    if (error) {
      setBusy(false);
      setError('הקוד שגוי או שפג תוקפו. בדקו את הספרות, או בקשו קוד חדש.');
      return;
    }
    setLeaving('נכנסים לחשבון');
    location.href = '/';
  }

  async function google() {
    setError(null);
    setLeaving('מעבירים אתכם ל-Google'); // shows at once; the redirect itself can take a few seconds
    const { error } = await supabaseBrowser().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${location.origin}/auth/callback` },
    });
    if (error) {
      setLeaving(null);
      setError('הכניסה עם Google עדיין לא הוגדרה. היכנסו עם קוד שנשלח לאימייל.');
    }
  }

  return (
    <main className="flex min-h-dvh flex-col md:grid md:grid-cols-2">
      <LoginCollage />
      {/* On a phone the form is a sheet pulled up over the collage; on a desktop it is the other half. */}
      <div className="relative -mt-6 flex-1 rounded-t-3xl border-t border-line bg-ink md:mt-0 md:rounded-none md:border-0 md:bg-transparent">
        <div className="mx-auto flex max-w-sm flex-col justify-center gap-6 px-6 pb-10 pt-7 md:min-h-dvh md:gap-8 md:py-10">
          <div className="text-center">
            <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-2xl border border-line bg-panel text-3xl font-bold text-mint">₪</div>
            <h1 className="text-3xl font-bold">ההטבות שלי</h1>
            <p className="mt-2 text-muted">איזה כרטיס להוציא בקופה — בשנייה.</p>
          </div>

          <div className="space-y-4 rounded-3xl border border-line bg-panel p-5">
            {!sent ? (
              <form onSubmit={sendCode} className="space-y-3">
                <label className="block">
                  <span className="text-sm text-muted">אימייל</span>
                  <div className="relative mt-1">
                    <Mail size={18} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-dim" aria-hidden />
                    <input type="email" required dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@example.com" autoComplete="email" className={`${field} ps-10 text-start`} />
                  </div>
                </label>
                <Button loading={busy} className="w-full py-3">{busy ? 'שולחים קוד…' : 'שלחו לי קוד כניסה'}</Button>
              </form>
            ) : (
              <form onSubmit={verify} className="space-y-4">
                <p className="text-center text-sm text-muted">
                  שלחנו קוד ל-<span className="text-fg" dir="ltr">{email}</span>
                </p>
                <CodeBoxes value={code} onChange={setCode} />
                <Button loading={busy} disabled={code.length < 6} className="w-full py-3">{busy ? 'בודקים…' : 'כניסה'}</Button>
                <button type="button" onClick={() => { setSent(false); setCode(''); }}
                  className="mx-auto flex items-center gap-1 text-sm text-mint">
                  <ArrowRight size={14} aria-hidden /> לשלוח שוב / לשנות אימייל
                </button>
              </form>
            )}

            <div className="flex items-center gap-3 text-xs text-dim">
              <span className="h-px flex-1 bg-line" /> או <span className="h-px flex-1 bg-line" />
            </div>

            <button onClick={google} disabled={!!leaving}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-white py-3 text-sm font-semibold text-gray-800 transition hover:bg-gray-100 active:scale-[0.98] disabled:opacity-80">
              {leaving ? <span className="btn-spinner text-gray-500" aria-hidden /> : <GoogleLogo />} המשך עם Google
            </button>
            {error && <Notice tone="error">{error}</Notice>}
          </div>

          <div className="space-y-1 text-center text-xs text-dim">
            {TRUST_LINES.map((t) => <p key={t}>{t}</p>)}
            <p>הכניסה פתוחה רק למשתמשים שהוזמנו.</p>
            <p>הלוגואים והכרטיסים שייכים לבעליהם ומוצגים להמחשה בלבד.</p>
          </div>
        </div>
      </div>
      {leaving && <Waiting overlay label={leaving} />}
    </main>
  );
}
