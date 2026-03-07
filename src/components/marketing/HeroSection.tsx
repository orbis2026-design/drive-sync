/**
 * HeroSection.tsx
 *
 * Deep dark-mode hero for the DriveSync marketing landing page.
 * Headline: "Wrench More. Type Less."
 * CTA: "Start 14-Day Free Trial"
 */

import Link from "next/link";

export function HeroSection() {
  return (
    <section className="relative flex flex-col items-center justify-center overflow-hidden bg-gray-950 px-4 py-24 sm:py-36 text-center">
      {/* Subtle radial spotlight */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
      >
        <div className="h-[520px] w-[520px] rounded-full bg-red-700/10 blur-3xl" />
      </div>

      {/* Badge */}
      <span className="relative mb-6 inline-flex items-center gap-2 rounded-full border border-red-800/50 bg-red-950/60 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-red-400">
        <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
        Now with AI Vision Diagnostics
      </span>

      {/* Main headline */}
      <h1 className="relative mb-4 max-w-3xl text-5xl font-black leading-none tracking-tight text-white sm:text-7xl">
        Wrench More.{" "}
        <span className="bg-gradient-to-r from-red-500 to-red-400 bg-clip-text text-transparent">
          Type Less.
        </span>
      </h1>

      {/* Subheadline */}
      <p className="relative mb-10 max-w-xl text-lg leading-relaxed text-gray-400">
        The complete operating system for solo mobile mechanics. Quotes,
        diagnostics, and payments in one app.
      </p>

      {/* Primary CTA */}
      <div className="relative flex flex-col items-center gap-4 sm:flex-row">
        <Link
          href="/auth/login"
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

      {/* Social proof blurb */}
      <p className="relative mt-8 text-sm text-gray-600">
        Card required to start trial · Cancel any time before 14 days
      </p>
    </section>
  );
}
