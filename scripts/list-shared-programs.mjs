// Prints the shared programs (name + benefits link) as JSON — used by the monthly refresh.
import nextEnv from '@next/env';
import { createClient } from '@supabase/supabase-js';

nextEnv.loadEnvConfig(process.cwd());
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const { data, error } = await sb.from('programs').select('name,kind,benefits_url').is('user_id', null).order('name');
if (error) throw error;
console.log(JSON.stringify(data, null, 2));
