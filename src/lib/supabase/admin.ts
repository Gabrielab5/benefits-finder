import { createClient } from '@supabase/supabase-js';

/** Bypasses RLS. Server-only (cron). Never import from a client component. */
export function supabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
