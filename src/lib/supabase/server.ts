import { createServerClient as createSSRServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Supabase server client using @supabase/ssr.
 *
 * Reads session cookies from next/headers so that Server Components,
 * Server Actions, and Route Handlers can access the authenticated user's
 * session (required for auth guards, RLS, and the middleware pattern).
 *
 * Requires:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY
 */
export async function createServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing Supabase environment variables: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required.",
    );
  }

  const cookieStore = await cookies();

  return createSSRServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        // In Server Components the cookie store is read-only — set() will throw.
        // We intentionally swallow that error here per-cookie; session refresh
        // is handled by the proxy / a Route Handler, not by Server Components.
        for (const { name, value, options } of cookiesToSet) {
          try {
            cookieStore.set(name, value, options);
          } catch {
            // expected in Server Component context — safe to ignore
          }
        }
      },
    },
  });
}