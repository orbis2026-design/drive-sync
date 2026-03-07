import { NextRequest, NextResponse } from "next/server";

/**
 * Proxy — runs on every request before page rendering.
 *
 * Responsibilities:
 * 1. Injects an `x-pathname` header so Server Components (e.g. the (app)
 *    layout guard) can read the current URL without access to searchParams.
 *
 * Note: The subscription PAST_DUE lock-out is enforced in
 * `src/app/(app)/layout.tsx` using this header. The proxy itself cannot
 * perform Supabase queries (Edge runtime limitations), so the DB check
 * remains in the Server Component layout.
 */
export function proxy(req: NextRequest): NextResponse {
  const response = NextResponse.next();
  // Forward the pathname so Server Components can read it via headers()
  response.headers.set("x-pathname", req.nextUrl.pathname);
  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for Next.js internals and static files.
     */
    "/((?!_next/static|_next/image|favicon.ico|icons|manifest.json|sw.js).*)",
  ],
};

