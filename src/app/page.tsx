import type { Metadata } from "next";
import Link from "next/link";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { HeroSection } from "@/components/marketing/HeroSection";
import { FeatureGrid } from "@/components/marketing/FeatureGrid";
import { PricingTable } from "@/components/marketing/PricingTable";
import { FEATURE_PAGES } from "@/lib/marketing-content";

export const metadata: Metadata = {
  title: "DriveSync — Wrench More. Type Less.",
  description:
    "The complete operating system for solo mobile mechanics. Quotes, diagnostics, and payments in one app.",
};

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gray-950">
      <MarketingHeader />
      <HeroSection />
      <FeatureGrid />

      {/* Feature Hubs */}
      <section className="bg-gray-950 px-4 py-20">
        <div className="mx-auto max-w-6xl">
          <div className="mb-10 text-center">
            <span className="mb-3 inline-block text-xs font-bold uppercase tracking-widest text-gray-500">
              Deep dives
            </span>
            <h2 className="text-3xl font-black text-white sm:text-4xl">
              Feature Hubs
            </h2>
            <p className="mt-2 text-sm text-gray-500">
              Everything you need to know about each DriveSync capability — built for the field.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {FEATURE_PAGES.map((feature) => (
              <Link
                key={feature.slug}
                href={`/features/${feature.slug}`}
                className="group flex flex-col items-center rounded-2xl border border-gray-800 bg-gray-900/70 p-5 text-center transition-colors hover:border-red-800/60 hover:bg-gray-900"
              >
                <span className="text-4xl">{feature.icon}</span>
                <p className="mt-3 text-sm font-semibold leading-snug text-white group-hover:text-red-400">
                  {feature.title}
                </p>
                <span className="mt-3 text-xs font-semibold text-red-500 group-hover:underline">
                  Learn more →
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <PricingTable />

      {/* Footer */}
      <footer className="border-t border-gray-800 bg-gray-950 px-4 py-10 text-center text-xs text-gray-600">
        <p className="mb-1 text-lg font-black tracking-tight text-white">
          Drive<span className="text-red-500">Sync</span>
        </p>
        <p className="mb-1 text-gray-500">Wrench More. Type Less.</p>
        <p className="mt-2">© {new Date().getFullYear()} DriveSync · All rights reserved</p>
        <p className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1">
          <a href="/auth/login" className="underline hover:text-gray-400">
            Sign in
          </a>
          <span aria-hidden="true">·</span>
          <a href="#pricing" className="underline hover:text-gray-400">
            Pricing
          </a>
          <span aria-hidden="true">·</span>
          <Link
            href="/features/auto-repair-invoices"
            className="underline hover:text-gray-400"
          >
            Invoices
          </Link>
          <span aria-hidden="true">·</span>
          <Link
            href="/tools/fluid-capacity-lookup"
            className="underline hover:text-gray-400"
          >
            Fluid Lookup
          </Link>
          <span aria-hidden="true">·</span>
          <Link
            href="/tools/templates"
            className="underline hover:text-gray-400"
          >
            Free Templates
          </Link>
        </p>
      </footer>
    </div>
  );
}
