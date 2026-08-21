import { createClient } from "@supabase/supabase-js";
import { getKeeperLabRuntimeConfig } from "./runtime-config";

const runtimeConfig = getKeeperLabRuntimeConfig();
const buildEnvironment = typeof process === "undefined" ? undefined : process.env;
const configuredUrl = runtimeConfig.supabaseUrl || buildEnvironment?.NEXT_PUBLIC_SUPABASE_URL;
const url = configuredUrl?.replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "");
const key = runtimeConfig.supabaseAnonKey || buildEnvironment?.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase = url && key ? createClient(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
}) : null;
export const isSupabaseConfigured = Boolean(supabase);
