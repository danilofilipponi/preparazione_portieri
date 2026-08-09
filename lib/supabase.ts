import { createClient } from "@supabase/supabase-js";

const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const url = configuredUrl?.replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "");
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase = url && key ? createClient(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
}) : null;
export const isSupabaseConfigured = Boolean(supabase);
