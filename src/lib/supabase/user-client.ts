// User-scoped Supabase client built from a per-request access token.
// Respects RLS — use this when you want operations to run "as the user".
// The frontend supplies the JWT via `Authorization: Bearer <access_token>`.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function getUserClient(accessToken: string): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("Supabase env not configured: SUPABASE_URL / SUPABASE_ANON_KEY missing");
  }
  return createClient(url, anonKey, {
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
