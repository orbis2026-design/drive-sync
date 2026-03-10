/**
 * HeroSection.tsx
 *
 * Deep dark-mode hero for the DriveSync marketing landing page.
 * Headline: "Wrench More. Type Less."
 * CTA: "Start 14-Day Free Trial"
 *
 * Mobile: centered vertical layout; product UI slideshow (financial, messages, AI) below trial text.
 * Desktop (lg:): split layout — text/CTA left (60%); product UI slideshow right (40%).
 *
 * The slideshow cycles through UI display images: dashboard, messages, AI insights.
 * Marketing illustration only — not real user data.
 */

import Link from "next/link";
import { ProductUISlideshow } from "./ProductUISlideshow";

export function HeroSection() {
  return (
    <section className="relative flex flex-col items-center justify-center overflow-hidden bg-gray-950 px-4 pt-24 pb-20 sm:pt-36 sm:pb-24 text-center lg:flex-row lg:items-center lg:text-left lg:py-28 lg:gap-12 lg:max-w-7xl lg:mx-auto lg:px-8 lg:pb-32">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 flex items-center justify-center lg:justify-start"
      >
        <div className="h-[520px] w-[520px] rounded-full bg-red-700/10 blur-3xl" />
      </div>

      {/* Left column: text & CTA */}
      <div className="relative flex flex-col items-center lg:items-start lg:w-[60%] lg:flex-shrink-0">
        <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-red-800/50 bg-red-950/60 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-red-400">
          <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
          Now with AI Vision Diagnostics
        </span>

        <h1 className="mb-4 max-w-3xl text-5xl font-black leading-none tracking-tight text-white sm:text-7xl lg:text-6xl xl:text-7xl">
          Wrench More.{" "}
          <span className="bg-gradient-to-r from-red-500 to-red-400 bg-clip-text text-transparent">
            Type Less.
          </span>
        </h1>

        <p className="mb-10 max-w-xl text-lg leading-relaxed text-gray-400">
          The complete operating system for solo mobile mechanics. Quotes,
          diagnostics, and payments in one app.
        </p>

        <div className="flex flex-col items-center gap-4 sm:flex-row lg:items-start">
          <Link
            href="/auth/register"
            className="inline-flex min-h-[56px] min-w-[260px] items-center justify-center rounded-2xl bg-red-600 px-8 py-4 text-base font-black tracking-wide text-white shadow-xl shadow-red-900/40 transition-all hover:bg-red-500 hover:shadow-red-800/60 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950"
          >
            Start 14-Day Free Trial
          </Link>
          <a
            href="#pricing"
            className="inline-flex min-h-[56px] items-center justify-center rounded-2xl border border-gray-700 bg-gray-900 px-8 py-4 text-base font-semibold text-gray-300 transition-all hover:border-gray-600 hover:bg-gray-800 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950"
          >
            View Pricing
          </a>
        </div>

        {/* Trial disclaimer — extra margin below so product display is not cramped */}
        <p className="mt-8 mb-14 text-sm text-gray-500 sm:mb-16 lg:mb-0">
          Card required to start trial · Cancel any time before 14 days
        </p>

        {/* Trust line — industry-standard brand credibility */}
        <p className="mt-6 text-xs font-medium uppercase tracking-widest text-gray-500 lg:mt-8">
          Built for mobile mechanics · Stripe & QuickBooks ready
        </p>

        {/* Mobile/tablet: product UI slideshow (financial, messages, AI) */}
        <div className="mt-6 w-full lg:hidden">
          <ProductUISlideshow variant="mobile" />
        </div>
      </div>

      {/* Desktop: product UI slideshow in right column */}
      <div
        aria-hidden="true"
        className="relative hidden lg:flex lg:w-[40%] lg:flex-shrink-0 lg:items-center lg:justify-center"
      >
        <ProductUISlideshow variant="desktop" />
        <div className="absolute inset-0 -z-10 rounded-full bg-red-700/5 blur-2xl scale-110" />
      </div>
    </section>
  );
}
