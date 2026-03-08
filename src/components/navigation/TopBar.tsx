"use client";

/**
 * TopBar.tsx — Unified contextual top bar (Issue #115)
 *
 * Uses usePathname() to determine the current page title.
 * On desktop (lg:), also renders a "+ New Quote" quick-action button.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";

// ---------------------------------------------------------------------------
// Route → page title mapping
// ---------------------------------------------------------------------------

const ROUTE_TITLES: Record<string, string> = {
  "/analytics":  "Financials",
  "/jobs":       "Active Jobs",
  "/calendar":   "Calendar",
  "/intake":     "Vehicle Intake",
  "/clients":    "Clients",
  "/settings":   "Settings",
  "/inventory":  "Inventory Management",
  "/marketing":  "Marketing",
  "/accounting": "Accounting",
};

function getPageTitle(pathname: string): string {
  // Exact match first
  if (ROUTE_TITLES[pathname]) return ROUTE_TITLES[pathname];
  // Prefix match for nested routes
  for (const route of Object.keys(ROUTE_TITLES)) {
    if (pathname.startsWith(route + "/")) return ROUTE_TITLES[route];
  }
  return "DriveSync";
}

// ---------------------------------------------------------------------------
// TopBar component
// ---------------------------------------------------------------------------

export function TopBar() {
  const pathname = usePathname();
  const title = getPageTitle(pathname);

  return (
    <header className="sticky top-0 z-40 flex items-center justify-between h-14 px-4 bg-gray-950 border-b border-gray-800 flex-shrink-0">
      <h1 className="text-base font-black text-white tracking-tight truncate">
        {title}
      </h1>
      {/* "+ New Quote" quick-action — desktop only */}
      <Link
        href="/intake"
        className="hidden lg:inline-flex items-center gap-2 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-gray-900 text-sm font-bold px-4 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950"
      >
        <span aria-hidden="true">+</span>
        New Quote
      </Link>
    </header>
  );
}
