import { createClient } from '@supabase/supabase-js';

// Vite env vars (Vercel) take priority; env.js works as a local fallback
const url = import.meta.env.VITE_SUPABASE_URL || window.ENV?.SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY || window.ENV?.SUPABASE_ANON_KEY;

if (!url || !key) {
  throw new Error('Missing Supabase credentials. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to Vercel, or fill in env.js locally.');
}

export const supabase = createClient(url, key);
