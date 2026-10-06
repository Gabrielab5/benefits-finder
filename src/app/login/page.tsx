'use client';
import { useState, type FormEvent } from 'react';
import { supabaseBrowser } from '@/lib/supabase/browser';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabaseBrowser().auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: false, emailRedirectTo: `${location.origin}/auth/callback` },
    });
    setBusy(false);
    if (error) setError('לא ניתן לשלוח קוד לכתובת הזו.');
    else setSent(true);
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabaseBrowser().auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' });
    setBusy(false);
    if (error) setError('הקוד שגוי או שפג תוקפו.');
    else location.href = '/';
  }

  async function google() {
    await supabaseBrowser().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${location.origin}/auth/callback` },
    });
  }

  return (
    <main className="mx-auto max-w-sm space-y-6 p-6">
      <h1 className="text-2xl font-bold">ההטבות שלי</h1>
      {!sent ? (
        <form onSubmit={sendCode} className="space-y-3">
          <label className="block">
            <span className="text-sm text-gray-600">אימייל</span>
            <input type="email" required dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-xl border border-gray-300 p-3" autoComplete="email" />
          </label>
          <button disabled={busy} className="w-full rounded-xl bg-blue-700 p-3 font-semibold text-white disabled:opacity-50">
            שלחו לי קוד כניסה
          </button>
        </form>
      ) : (
        <form onSubmit={verify} className="space-y-3">
          <p className="text-sm text-gray-600">שלחנו קוד ל-{email}. הקלידו אותו כאן (או לחצו על הקישור במייל במחשב).</p>
          <label className="block">
            <span className="text-sm text-gray-600">קוד</span>
            <input inputMode="numeric" autoComplete="one-time-code" dir="ltr" required value={code}
              onChange={(e) => setCode(e.target.value)} className="mt-1 w-full rounded-xl border border-gray-300 p-3 text-center text-2xl tracking-widest" />
          </label>
          <button disabled={busy} className="w-full rounded-xl bg-blue-700 p-3 font-semibold text-white disabled:opacity-50">
            כניסה
          </button>
          <button type="button" onClick={() => setSent(false)} className="w-full text-sm text-blue-700">
            לשלוח שוב / לשנות אימייל
          </button>
        </form>
      )}
      <button onClick={google} className="w-full rounded-xl border border-gray-300 bg-white p-3">כניסה עם Google</button>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </main>
  );
}
