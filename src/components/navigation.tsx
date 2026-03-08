// Re-exported from mobile-nav for backward compatibility.
"use client";

import Link from "next/link";
import { useState } from "react";
import { FEATURE_PAGES } from "@/lib/marketing-content";

// ---------------------------------------------------------------------------
// Desktop mega-menu feature items
// ---------------------------------------------------------------------------
const FEATURE_NAV_ITEMS = FEATURE_PAGES.map((p) => ({
  slug: p.slug,
  icon: p.icon,
  title: p.title,
  description: p.subheadline.slice(0, 72) + (p.subheadline.length > 72 ? "…" : ""),
}));

// ---------------------------------------------------------------------------
// MarketingNav — top navigation for marketing pages
// ---------------------------------------------------------------------------
export function Navigation() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [featuresOpen, setFeaturesOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-gray-800 bg-gray-950/95 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        {/* Logo */}
        <Link
          href="/"
          className="text-xl font-black tracking-tight text-white"
          aria-label="DriveSync home"
        >
          Drive<span className="text-red-500">Sync</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-8 lg:flex" aria-label="Marketing navigation">
          {/* Features with mega-menu */}
          <div
            className="relative"
            onMouseEnter={() => setFeaturesOpen(true)}
            onMouseLeave={() => setFeaturesOpen(false)}
          >
            <button
              type="button"
              className="group flex items-center gap-1 text-sm font-semibold text-gray-300 hover:text-white"
              aria-expanded={featuresOpen}
              aria-haspopup="true"
            >
              Features
              <svg
                className="h-4 w-4 transition-transform group-hover:rotate-180"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                  clipRule="evenodd"
                />
              </svg>
            </button>

            {/* Mega-menu dropdown */}
            {featuresOpen && (
              <div className="absolute left-1/2 top-full mt-2 w-[600px] -translate-x-1/2 rounded-2xl border border-gray-800 bg-gray-900 p-4 shadow-2xl shadow-black/60">
                <div className="grid grid-cols-2 gap-3">
                  {FEATURE_NAV_ITEMS.map((item) => (
                    <Link
                      key={item.slug}
                      href={`/features/${item.slug}`}
                      className="flex items-start gap-3 rounded-xl p-3 transition-colors hover:bg-gray-800"
                      onClick={() => setFeaturesOpen(false)}
                    >
                      <span className="text-2xl leading-none">{item.icon}</span>
                      <div>
                        <p className="text-sm font-semibold text-white">
                          {item.title}
                        </p>
                        <p className="mt-0.5 text-xs leading-relaxed text-gray-400">
                          {item.description}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>

          <Link
            href="/tools/fluid-capacity-lookup"
            className="text-sm font-semibold text-gray-300 underline-offset-4 hover:text-white hover:underline decoration-red-500"
          >
            Free Tools
          </Link>

          <a
            href="#pricing"
            className="text-sm font-semibold text-gray-300 underline-offset-4 hover:text-white hover:underline decoration-red-500"
          >
            Pricing
          </a>
        </nav>

        {/* Desktop CTA */}
        <div className="hidden lg:block">
          <Link
            href="/auth/register"
            className="inline-flex items-center rounded-xl bg-red-600 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-red-500"
          >
            Start Free Trial
          </Link>
        </div>

        {/* Mobile hamburger */}
        <button
          type="button"
          className="flex items-center justify-center rounded-lg p-2 text-gray-400 hover:text-white lg:hidden"
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((v) => !v)}
        >
          <span className="text-2xl leading-none" aria-hidden="true">
            {mobileOpen ? "✕" : "☰"}
          </span>
        </button>
      </div>

      {/* Mobile slide-down menu */}
      {mobileOpen && (
        <div className="border-t border-gray-800 bg-gray-950 px-4 pb-6 pt-4 lg:hidden">
          <div className="flex flex-col gap-1">
            <p className="mb-2 text-xs font-bold uppercase tracking-widest text-gray-500">
              Features
            </p>
            {FEATURE_NAV_ITEMS.map((item) => (
              <Link
                key={item.slug}
                href={`/features/${item.slug}`}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-gray-300 hover:bg-gray-800 hover:text-white"
                onClick={() => setMobileOpen(false)}
              >
                <span className="text-xl">{item.icon}</span>
                {item.title}
              </Link>
            ))}
            <div className="my-3 border-t border-gray-800" />
            <Link
              href="/tools/fluid-capacity-lookup"
              className="rounded-xl px-3 py-2.5 text-sm font-semibold text-gray-300 hover:bg-gray-800 hover:text-white"
              onClick={() => setMobileOpen(false)}
            >
              Free Tools
            </Link>
            <a
              href="#pricing"
              className="rounded-xl px-3 py-2.5 text-sm font-semibold text-gray-300 hover:bg-gray-800 hover:text-white"
              onClick={() => setMobileOpen(false)}
            >
              Pricing
            </a>
            <div className="mt-4">
              <Link
                href="/auth/register"
                className="block rounded-xl bg-red-600 px-5 py-3 text-center text-sm font-bold text-white hover:bg-red-500"
                onClick={() => setMobileOpen(false)}
              >
                Start Free Trial
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

// Keep backward compat for any code that imports MobileNav from this file
export { MobileNav } from "@/components/mobile-nav";

