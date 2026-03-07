import { type NextRequest } from "next/server";
import { proxy, config } from "@/proxy";

/**
 * Next.js middleware entry point.
 *
 * Delegates to the proxy helper which injects the `x-pathname` header
 * so Server Components can read the current URL without access to
 * searchParams (required by the (app) layout subscription guard).
 *
 * Note: Supabase session refresh cannot be performed here due to
 * Edge runtime limitations. Auth checks remain in Server Component
 * layouts where the Node.js runtime is available.
 */
export function middleware(request: NextRequest) {
  return proxy(request);
}

export { config };
