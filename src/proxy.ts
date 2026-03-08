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
 * Attempts to detect an active Supabase session from the request cookies.
 * The Supabase JS SDK v2 persists sessions under a key matching the pattern
 * `sb-<project-ref>-auth-token`.  We only verify that the cookie exists and
 * is non-empty — full JWT validation happens server-side in Route Handlers.
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

/**
 * Proxy — runs on every request before page rendering.
 *
 * Responsibilities:
 * 1. Injects an `x-pathname` header so Server Components (e.g. the (app)
 *    layout guard) can read the current URL without access to searchParams.
 * 2. Redirects unauthenticated requests to `/auth/login` (except for public
 *    routes such as /auth/*, /portal/*, /api/*, /request/*, /glovebox/*).
 *
 * Note: The subscription PAST_DUE lock-out is enforced in
 * `src/app/(app)/layout.tsx` using the x-pathname header. The proxy itself
 * cannot perform Supabase queries (Edge runtime limitations), so the DB check
 * remains in the Server Component layout.
 */
export function proxy(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;

  // Always inject the pathname header for Server Component layout guards.
  const response = NextResponse.next();
  response.headers.set("x-pathname", pathname);

  // Skip auth check for public paths.
  if (isPublicPath(pathname)) {
    return response;
  }

  // Redirect unauthenticated users to the login page.
  if (!hasSessionCookie(req)) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/auth/login";
    // Preserve the original destination so the login page can redirect back.
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for Next.js internals and static files.
     */
    "/((?!_next/static|_next/image|favicon.ico|icons|manifest.json|sw.js|workbox-.*.js).*)",
  ],
};

