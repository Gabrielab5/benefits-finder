'use client';
import { use, useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, Eye, EyeOff, Lock, Mail } from 'lucide-react';
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

/** What the Supabase project has switched on (Authentication → Sign In / Providers), so the page never offers a way in that fails. */
type AuthSettings = { external: Record<string, boolean>; disable_signup: boolean };

/** One real input (so paste and SMS/e-mail autofill work) drawn as separate digit boxes. */
function CodeBoxes({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const boxes = Math.max(6, value.length);
  return (
    <label className="group relative block" dir="ltr">
      <span className="sr-only">{label}</span>
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

export default function LoginPage({ searchParams }: { searchParams: Promise<{ failed?: string }> }) {
  const failed = use(searchParams).failed; // set by /auth/callback when a Google or e-mail link didn't sign in
  const [signup, setSignup] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState<'password' | 'code' | 'verify' | null>(null);
  const [error, setError] = useState<string | null>(failed ? 'הכניסה לא הושלמה. נסו שוב, או היכנסו בדרך אחרת.' : null);
  const [leaving, setLeaving] = useState<string | null>(null); // full-screen wait while the browser moves on
  const [auth, setAuth] = useState<AuthSettings | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY! },
    }).then((r) => r.json()).then(setAuth, () => {}); // offline: no Google button, which couldn't work anyway
  }, []);
  const signupOpen = auth ? !auth.disable_signup : false;

  function enter() {
    setLeaving('נכנסים לחשבון');
    location.href = '/';
  }

  async function submitPassword(e: FormEvent) {
    e.preventDefault();
    setBusy('password');
    setError(null);
    const sb = supabaseBrowser();
    const creds = { email: email.trim(), password };
    if (!signup) {
      const { error } = await sb.auth.signInWithPassword(creds);
      if (!error) return enter();
      setBusy(null);
      setError(error.code === 'email_not_confirmed'
        ? 'האימייל עוד לא אושר. היכנסו עם קוד למייל: זה גם יאשר אותו.'
        : 'האימייל או הסיסמה לא נכונים. שכחתם סיסמה? היכנסו עם קוד למייל.');
      return;
    }
    const { data, error } = await sb.auth.signUp({ ...creds, options: { emailRedirectTo: `${location.origin}/auth/callback` } });
    setBusy(null);
    // An address that is already registered comes back as a user with no identities, and no e-mail is sent.
    if (error?.code === 'user_already_exists' || (data.user && !data.user.identities?.length)) {
      setError('כבר יש חשבון עם האימייל הזה. היכנסו עם הסיסמה, או עם קוד למייל.');
    } else if (error) {
      setError(error.code === 'weak_password'
        ? 'הסיסמה קלה מדי לניחוש. נסו סיסמה ארוכה יותר, עם אותיות ומספרים.'
        : 'לא הצלחנו ליצור את החשבון. נסו שוב בעוד דקה.');
    } else if (data.session) enter(); // e-mail confirmation is off
    else setSent(true); // confirm the address with the code from the e-mail (or its link)
  }

  async function sendCode() {
    if (!emailRef.current?.reportValidity()) return;
    setBusy('code');
    setError(null);
    const { error } = await supabaseBrowser().auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    });
    setBusy(null);
    if (error) setError(signupOpen
      ? 'לא הצלחנו לשלוח קוד לכתובת הזו. בדקו שהיא נכונה, או נסו שוב בעוד דקה.'
      : 'לא הצלחנו לשלוח קוד לכתובת הזו. הכניסה פתוחה רק לכתובות שהוזמנו: בדקו שזו הכתובת שקיבלה הזמנה, או נסו שוב בעוד דקה.');
    else setSent(true);
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    setBusy('verify');
    setError(null);
    const { error } = await supabaseBrowser().auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' });
    if (!error) return enter();
    setBusy(null);
    setError('הקוד שגוי או שפג תוקפו. בדקו את הספרות, או בקשו קוד חדש.');
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
      setError('הכניסה עם Google לא זמינה כרגע. היכנסו עם אימייל.');
    }
  }

  return (
    <main className="flex min-h-dvh flex-col md:grid md:grid-cols-2">
      <LoginCollage />
      {/* On a phone the form is a sheet pulled up over the collage; on a desktop it is the other half. */}
      <div className="relative -mt-6 flex-1 rounded-t-3xl border-t border-line bg-ink md:mt-0 md:rounded-none md:border-0 md:bg-transparent">
        <div className="mx-auto flex max-w-sm flex-col justify-center gap-6 px-6 pb-10 pt-7 md:min-h-dvh md:gap-8 md:py-10">
          <div className="text-center">
            <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-2xl border border-line bg-panel text-3xl font-bold text-mint" aria-hidden>₪</div>
            <h1 className="text-3xl font-bold">ההטבות שלי</h1>
            <p className="mt-2 text-muted">איזה כרטיס להוציא בקופה — בשנייה.</p>
          </div>

          <div className="space-y-4 rounded-3xl border border-line bg-panel p-5">
            {!sent ? (
              <form onSubmit={submitPassword} className="space-y-3">
                <h2 aria-live="polite" className="text-lg font-semibold">{signup ? 'יצירת חשבון' : 'כניסה'}</h2>
                <label className="block">
                  <span className="text-sm text-muted">אימייל</span>
                  <div className="relative mt-1">
                    <Mail size={18} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-dim" aria-hidden />
                    <input ref={emailRef} type="email" required dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@example.com" autoComplete="email" className={`${field} px-10 text-start`} />
                  </div>
                </label>
                <div>
                  <label htmlFor="password" className="text-sm text-muted">סיסמה</label>
                  <div className="relative mt-1">
                    <Lock size={18} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-dim" aria-hidden />
                    <input id="password" type={showPassword ? 'text' : 'password'} required dir="ltr" value={password}
                      onChange={(e) => setPassword(e.target.value)} minLength={signup ? 8 : undefined}
                      autoComplete={signup ? 'new-password' : 'current-password'}
                      aria-describedby={signup ? 'password-hint' : undefined} className={`${field} px-10 text-start`} />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} aria-pressed={showPassword} aria-label="הצגת הסיסמה"
                      className="tap absolute end-1.5 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-dim hover:text-fg">
                      {showPassword ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
                    </button>
                  </div>
                  {signup && <p id="password-hint" className="mt-1 text-xs text-dim">לפחות 8 תווים.</p>}
                </div>
                <Button loading={busy === 'password'} disabled={!!busy} className="w-full py-3">
                  {signup ? (busy ? 'יוצרים חשבון…' : 'יצירת חשבון') : (busy === 'password' ? 'נכנסים…' : 'כניסה')}
                </Button>
                {!signup && (
                  <button type="button" onClick={sendCode} disabled={!!busy} className="tap mx-auto block text-sm text-mint disabled:opacity-60">
                    {busy === 'code' ? 'שולחים קוד…' : 'שכחתם סיסמה? שלחו לי קוד כניסה למייל'}
                  </button>
                )}
                {signupOpen && (
                  <p className="text-center text-sm text-muted">
                    {signup ? 'כבר יש לכם חשבון?' : 'חדשים כאן?'}{' '}
                    <button type="button" onClick={() => { setSignup(!signup); setError(null); }} className="tap font-semibold text-mint">
                      {signup ? 'כניסה' : 'יצירת חשבון'}
                    </button>
                  </p>
                )}
              </form>
            ) : (
              <form onSubmit={verify} className="space-y-4">
                <p className="text-center text-sm text-muted">
                  שלחנו קוד ל-<span className="text-fg" dir="ltr">{email}</span>
                </p>
                <CodeBoxes value={code} onChange={setCode} label={`הקוד ששלחנו ל-${email}`} />
                <Button loading={busy === 'verify'} disabled={code.length < 6} className="w-full py-3">{busy ? 'בודקים…' : 'כניסה'}</Button>
                <button type="button" onClick={() => { setSent(false); setCode(''); setError(null); }}
                  className="tap mx-auto flex items-center gap-1 text-sm text-mint">
                  <ArrowRight size={14} aria-hidden /> לשלוח שוב / לשנות אימייל
                </button>
              </form>
            )}

            {auth?.external.google && (
              <>
                <div className="flex items-center gap-3 text-xs text-dim">
                  <span className="h-px flex-1 bg-line" aria-hidden /> או <span className="h-px flex-1 bg-line" aria-hidden />
                </div>
                <button type="button" onClick={google} disabled={!!leaving}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-white py-3 text-sm font-semibold text-gray-800 transition hover:bg-gray-100 active:scale-[0.98] disabled:opacity-80">
                  <GoogleLogo /> המשך עם Google
                </button>
              </>
            )}
            {error && <Notice tone="error">{error}</Notice>}
          </div>

          <div className="space-y-1 text-center text-xs text-dim">
            {TRUST_LINES.map((t) => <p key={t}>{t}</p>)}
            {auth?.disable_signup && <p>הכניסה פתוחה רק למשתמשים שהוזמנו.</p>}
            <p>הלוגואים והכרטיסים שייכים לבעליהם ומוצגים להמחשה בלבד.</p>
          </div>
        </div>
      </div>
      {leaving && <Waiting overlay label={leaving} />}
    </main>
  );
}
