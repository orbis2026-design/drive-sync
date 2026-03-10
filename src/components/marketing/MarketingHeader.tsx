"use client";

/**
 * MarketingHeader.tsx
 *
 * Sticky header for the landing page with logo lockup, nav links,
 * and primary CTAs (Login + Start Trial). Industry-standard brand bar.
 */

import Link from "next/link";

export function MarketingHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-gray-800/80 bg-gray-950/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo lockup */}
        <Link
          href="/"
          className="flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950"
          aria-label="DriveSync home"
        >
          <span className="text-xl font-black tracking-tight text-white">
            Drive<span className="text-red-500">Sync</span>
          </span>
        </Link>

        {/* Nav + CTAs */}
        <nav className="flex items-center gap-3 sm:gap-6" aria-label="Main">
          <a
            href="#features"
            className="hidden text-sm font-medium text-gray-400 transition-colors hover:text-white sm:inline-block"
          >
            Features
          </a>
          <a
            href="#pricing"
            className="hidden text-sm font-medium text-gray-400 transition-colors hover:text-white sm:inline-block"
          >
            Pricing
          </a>
          <Link
            href="/auth/login"
            className="inline-flex min-h-[40px] items-center justify-center rounded-xl border border-gray-700 bg-transparent px-4 text-sm font-semibold text-gray-300 transition-all hover:border-gray-600 hover:bg-gray-800/80 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950"
          >
            Log in
          </Link>
          <Link
            href="/auth/login"
            className="inline-flex min-h-[40px] items-center justify-center rounded-xl bg-red-600 px-4 text-sm font-bold text-white shadow-lg shadow-red-900/30 transition-all hover:bg-red-500 hover:shadow-red-800/40 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950"
          >
            Start free trial
          </Link>
        </nav>
      </div>
    </header>
  );
}
