import { createClient } from "@supabase/supabase-js";
import { fetchWithTimeout } from "./fetch-timeout";

/**
 * Read-only Supabase client for server-side queries.
 * Uses the anon key — safe to call from Server Actions and Route Handlers.
 *
 * Requires:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY
 */
export function createServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing Supabase environment variables: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required.",
    );
  }

  return createClient(url, key, {
    auth: { persistSession: false },
    global: { fetch: fetchWithTimeout },
  });
}
