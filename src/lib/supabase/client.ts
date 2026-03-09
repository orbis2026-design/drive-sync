import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase browser client using @supabase/ssr.
 *
 * Uses createBrowserClient instead of the bare createClient so that session
 * cookies are properly set and read by the middleware, Server Components,
 * and Route Handlers. This ensures the auth session is visible server-side.
 *
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

  return createBrowserClient(url, anonKey);
}
