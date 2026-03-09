/**
 * HeroSection.tsx
 *
 * Deep dark-mode hero for the DriveSync marketing landing page.
 * Headline: "Wrench More. Type Less."
 * CTA: "Start 14-Day Free Trial"
 *
 * Mobile: centered vertical layout.
 * Desktop (lg:): split layout — text/CTA left (60%), dashboard graphic right (40%).
 *
 * Note: The revenue bars and metrics below are **intentional marketing
 * illustration data** for the public landing page. They do not represent
 * real user data and are not a mock/placeholder that needs replacement.
 */

import Link from "next/link";

/**
 * Illustrative weekly revenue bar heights (% of max) for the marketing
 * dashboard graphic. This is static design content, not operational mock data.
 */
const DEMO_REVENUE_BARS = [40, 65, 50, 80, 55, 90, 75, 95];

export function HeroSection() {
  return (
    <section className="relative flex flex-col items-center justify-center overflow-hidden bg-gray-950 px-4 py-24 sm:py-36 text-center lg:flex-row lg:items-center lg:text-left lg:py-28 lg:gap-12 lg:max-w-7xl lg:mx-auto lg:px-8">
      {/* Subtle radial spotlight */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 flex items-center justify-center lg:justify-start"
      >
        <div className="h-[520px] w-[520px] rounded-full bg-red-700/10 blur-3xl" />
      </div>

      {/* ── Left column: text & CTA (full width mobile, 60% desktop) ── */}
      <div className="relative flex flex-col items-center lg:items-start lg:w-[60%] lg:flex-shrink-0">
        {/* Badge */}
        <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-red-800/50 bg-red-950/60 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-red-400">
          <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
          Now with AI Vision Diagnostics
        </span>

        {/* Main headline */}
        <h1 className="mb-4 max-w-3xl text-5xl font-black leading-none tracking-tight text-white sm:text-7xl lg:text-6xl xl:text-7xl">
          Wrench More.{" "}
          <span className="bg-gradient-to-r from-red-500 to-red-400 bg-clip-text text-transparent">
            Type Less.
          </span>
        </h1>

        {/* Subheadline */}
        <p className="mb-10 max-w-xl text-lg leading-relaxed text-gray-400">
          The complete operating system for solo mobile mechanics. Quotes,
          diagnostics, and payments in one app.
        </p>

        {/* Primary CTA */}
        <div className="flex flex-col items-center gap-4 sm:flex-row lg:items-start">
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
        <p className="mt-8 text-sm text-gray-600">
          Card required to start trial · Cancel any time before 14 days
        </p>
      </div>

      {/* ── Right column: mock SaaS dashboard graphic (desktop only) ── */}
      <div
        aria-hidden="true"
        className="relative hidden lg:flex lg:w-[40%] lg:flex-shrink-0 lg:items-center lg:justify-center"
      >
        <div className="w-full max-w-sm rounded-2xl border border-gray-700 bg-gray-900 p-5 shadow-2xl shadow-black/60">
          {/* Dashboard header bar */}
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-red-500" />
              <div className="h-3 w-3 rounded-full bg-yellow-400" />
              <div className="h-3 w-3 rounded-full bg-green-500" />
            </div>
            <div className="h-4 w-24 rounded bg-gray-800" />
          </div>

          {/* Metric cards row */}
          <div className="mb-4 grid grid-cols-2 gap-3">
            {[
              { label: "Net Profit", value: "$4,820", color: "text-green-400" },
              { label: "Open Jobs", value: "12", color: "text-yellow-400" },
              { label: "Parts COGS", value: "$1,340", color: "text-orange-400" },
              { label: "Card Fees", value: "$87", color: "text-red-400" },
            ].map((m) => (
              <div
                key={m.label}
                className="rounded-xl bg-gray-800 border border-gray-700 p-3"
              >
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1">
                  {m.label}
                </p>
                <p className={`text-xl font-black tabular-nums ${m.color}`}>
                  {m.value}
                </p>
              </div>
            ))}
          </div>

          {/* Chart placeholder */}
          <div className="rounded-xl bg-gray-800 border border-gray-700 p-3 mb-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-3">
              Weekly Revenue
            </p>
            <div className="flex items-end gap-1.5 h-16">
              {DEMO_REVENUE_BARS.map((h, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-sm bg-gradient-to-t from-red-600 to-red-400 opacity-80"
                  style={{ height: `${h}%` }}
                />
              ))}
            </div>
          </div>

          {/* Job pipeline row */}
          <div className="rounded-xl bg-gray-800 border border-gray-700 p-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2">
              Job Pipeline
            </p>
            <div className="flex gap-2">
              {[
                { label: "Intake", count: 3, color: "bg-blue-600" },
                { label: "Active", count: 5, color: "bg-yellow-500" },
                { label: "Done", count: 4, color: "bg-green-600" },
              ].map((s) => (
                <div key={s.label} className="flex-1 text-center">
                  <div
                    className={`${s.color} rounded-lg py-2 mb-1 text-white text-sm font-black`}
                  >
                    {s.count}
                  </div>
                  <p className="text-[9px] text-gray-500 uppercase tracking-widest">
                    {s.label}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Decorative glow behind the card */}
        <div className="absolute inset-0 -z-10 rounded-full bg-red-700/5 blur-2xl scale-110" />
      </div>
    </section>
  );
}
