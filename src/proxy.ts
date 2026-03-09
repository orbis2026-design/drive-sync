import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// Public route prefixes — never require authentication.
// ---------------------------------------------------------------------------

const PUBLIC_PREFIXES = [
  "/auth/",
  "/portal/",
  "/request/",
  "/glovebox/",
  "/api/",
  "/onboarding",
  "/_next/",
  "/offline",
  "/features/",
  "/tools/",
  "/intake",
  "/favicon.ico",
  "/public",
];

const PUBLIC_EXACT = new Set(["/", "/auth/login", "/onboarding"]);

/**
 * Returns true when the pathname is publicly accessible without a session.
 */
function isPublicPath(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/**
 * Proxy — runs on every request before page rendering.
 *
 * Responsibilities:
 * 1. Refreshes the Supabase session using @supabase/ssr (cookie-based).
 * 2. Injects an `x-pathname` header so Server Components (e.g. the (app)
 *    layout guard) can read the current URL without access to searchParams.
 * 3. Redirects unauthenticated requests to `/auth/login` for protected (app)
 *    routes. Public routes bypass authentication checks.
 *
 * Note: The subscription PAST_DUE lock-out is enforced in
 * `src/app/(app)/layout.tsx` using the x-pathname header. The proxy itself
 * cannot perform Prisma queries (Edge runtime limitations), so the DB check
 * remains in the Server Component layout.
 */
export async function proxy(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;

  // Start with a response that passes the request through.
  let response = NextResponse.next({ request: req });

  // Always inject the pathname header for Server Component layout guards.
  response.headers.set("x-pathname", pathname);

  // Attempt to refresh the Supabase session using @supabase/ssr.
  // This keeps session cookies fresh on every request.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (url && anonKey) {
    const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            req.cookies.set(name, value),
          );
          response = NextResponse.next({ request: req });
          response.headers.set("x-pathname", pathname);
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    });

    // Refresh the session (extends expiry, updates cookies).
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Skip auth check for public paths.
    if (!isPublicPath(pathname) && !user) {
      const loginUrl = req.nextUrl.clone();
      loginUrl.pathname = "/auth/login";
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }
  } else {
    // Env vars missing (build/test environment): fall back to cookie detection.
    if (!isPublicPath(pathname) && !hasSessionCookie(req)) {
      const loginUrl = req.nextUrl.clone();
      loginUrl.pathname = "/auth/login";
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return response;
}

/**
 * Fallback: detect an active Supabase session from cookies.
 * Used when env vars are unavailable (e.g. build environments).
 */
function hasSessionCookie(req: NextRequest): boolean {
  for (const cookie of req.cookies.getAll()) {
    if (
      cookie.name.startsWith("sb-") &&
      cookie.name.endsWith("-auth-token") &&
      cookie.value.trim().length > 0
    ) {
      return true;
    }
  }
  return false;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for Next.js internals and static files.
     */
    "/((?!_next/static|_next/image|favicon.ico|icons|manifest.json|sw.js|workbox-.*.js).*)",
  ],
};

// ---------------------------------------------------------------------------
// Public route prefixes — never require authentication.
