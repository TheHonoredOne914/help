import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

if (!isSupabaseConfigured) {
  console.warn(
    "[BestDel] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. " +
    "Copy frontend/.env.example to frontend/.env and fill in your Supabase credentials. " +
    "Auth is disabled — all routes are accessible without login."
  );
}

export const supabase = createClient(
  supabaseUrl ?? "http://localhost:54321",
  supabaseAnonKey ?? "missing-anon-key",
);
