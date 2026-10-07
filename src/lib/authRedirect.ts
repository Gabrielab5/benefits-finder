/**
 * When Supabase can't use the requested return address it falls back to the Site URL, so the login
 * code (Google / e-mail link) can land on "/" or "/login". Forward it to the route that exchanges it.
 */
export function authCodeRedirect(url: URL): URL | null {
  const code = url.searchParams.get('code');
  if (!code || url.pathname.startsWith('/auth/')) return null;
  const to = new URL('/auth/callback', url);
  to.searchParams.set('code', code);
  return to;
}
