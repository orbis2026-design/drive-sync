"use client";

/**
 * TopBar.tsx — Unified contextual top bar (Issue #115, #128)
 *
 * Three-section layout: Left (page title), Middle (global search), Right (actions + UserNav).
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserNav } from "./UserNav";

// ---------------------------------------------------------------------------
// Route → page title mapping
// ---------------------------------------------------------------------------

const ROUTE_TITLES: Record<string, string> = {
  "/analytics":     "Financials",
  "/jobs":          "Active Jobs",
  "/calendar":      "Calendar",
  "/intake":        "Vehicle Intake",
  "/clients":       "Clients",
  "/settings":      "Settings",
  "/inventory":     "Inventory Management",
  "/marketing":     "Retention Engine",
  "/accounting":    "Accounting",
  "/dispatch/qa":   "QA Inbox",
  "/fleet/billing": "Fleet Billing",
  "/parts/catalog": "Nexpart PO",
  "/messages":      "Messages",
  "/hq/chat":       "HQ Chat",
  "/expenses":      "Expenses",
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
    <header className="sticky top-0 z-40 flex items-center justify-between h-14 px-4 bg-gray-950 border-b border-gray-800 flex-shrink-0 gap-4">
      {/* Left — page title */}
      <h1 className="text-base font-medium text-gray-200 tracking-tight truncate flex-shrink-0">
        {title}
      </h1>

      {/* Middle — Global search (desktop only) */}
      <div className="hidden md:flex flex-1 justify-center">
        <button
          type="button"
          className="bg-gray-900 border border-gray-800 text-sm rounded-lg px-4 py-1.5 w-64 md:w-96 text-gray-400 flex items-center gap-2 cursor-pointer hover:border-gray-700 transition-colors"
          aria-label="Open command palette to search jobs, clients, and more"
        >
          {/* Search icon */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4 flex-shrink-0 text-gray-500"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <span className="flex-1">Search jobs, clients…</span>
          <span className="bg-gray-800 text-gray-500 text-xs px-1.5 py-0.5 rounded font-mono flex-shrink-0">
            ⌘K
          </span>
        </button>
      </div>

      {/* Right — Notifications, UserNav, New Quote */}
      <div className="flex items-center gap-3 flex-shrink-0">
        {/* Notifications bell */}
        <button
          type="button"
          className="text-gray-400 hover:text-gray-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400 rounded-lg p-1"
          aria-label="Notifications"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5"
            aria-hidden="true"
          >
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        </button>

        {/* User account nav */}
        <UserNav />

        {/* "+ New Quote" quick-action — desktop only */}
        <Link
          href="/intake"
          className="hidden md:inline-flex items-center gap-2 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-gray-900 text-sm font-bold px-4 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950"
        >
          <span aria-hidden="true">+</span>
          New Quote
        </Link>
      </div>
    </header>
  );
}
