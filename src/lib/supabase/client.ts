import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase browser client — uses the public anon key.
 * Subject to Row Level Security (RLS) policies.
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Missing Supabase client environment variables: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required.",
    );
  }

  return createSupabaseClient(url, anonKey);
}
