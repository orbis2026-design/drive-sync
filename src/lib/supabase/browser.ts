import { createBrowserClient } from "@supabase/ssr";

/**
 * Returns a Supabase browser client that stores the session in cookies
 * (via @supabase/ssr) instead of localStorage, so every server request
 * (middleware, Server Components, Route Handlers) can see the session.
 *
 * Use this everywhere you need a client-side Supabase client.
 * Do NOT call createClient() from @supabase/supabase-js on the client.
 */
export function getBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Missing Supabase client environment variables: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required.",
    );
  }

  return createBrowserClient(url, anonKey);
}
