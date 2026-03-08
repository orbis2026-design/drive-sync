import type { Metadata } from "next";
import { FluidLookupClient } from "./FluidLookupClient";

export const metadata: Metadata = {
  title: "Free Vehicle Fluid Capacity Lookup Tool | DriveSync",
  description:
    "Look up engine oil capacity and OEM oil weight for any vehicle — free. Mobile mechanic tool by DriveSync.",
};

const webAppSchema = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "DriveSync Free Fluid Capacity Lookup",
  description: "Free vehicle fluid capacity lookup tool for mechanics",
  url: "https://drivesync.app/tools/fluid-capacity-lookup",
  applicationCategory: "UtilitiesApplication",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
};

export default function FluidCapacityLookupPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webAppSchema) }}
      />
      <div className="min-h-screen bg-gray-950 text-white">
        {/* Hero */}
        <section className="px-4 py-16 text-center sm:py-24">
          <div className="mx-auto max-w-2xl">
            <span className="mb-4 inline-block rounded-full border border-red-800/50 bg-red-950/60 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-red-400">
              Free Tool
            </span>
            <h1 className="mt-4 text-4xl font-black leading-tight tracking-tight text-white sm:text-5xl">
              Vehicle Fluid Capacity Lookup
            </h1>
            <p className="mt-4 text-lg text-gray-400">
              Look up engine oil capacity and OEM oil weight for any vehicle —
              free, no sign-up required.
            </p>
          </div>
        </section>

        {/* Interactive lookup */}
        <FluidLookupClient />

        {/* Upsell footer */}
        <section className="mt-12 bg-gray-900 px-4 py-12 text-center">
          <p className="mb-2 text-lg font-bold text-white">
            Want transmission fluid, coolant intervals, torque specs, and TSBs?
          </p>
          <p className="mb-6 text-sm text-gray-400">
            All of that — and real-time van stock tracking — is inside
            DriveSync.
          </p>
          <a
            href="/auth/register"
            className="inline-flex min-h-[48px] min-w-[220px] items-center justify-center rounded-2xl bg-red-600 px-8 py-3 text-base font-black text-white transition-all hover:bg-red-500"
          >
            Start Free Trial — Unlock Everything
          </a>
        </section>

        <footer className="border-t border-gray-800 bg-gray-950 px-4 py-8 text-center text-xs text-gray-600">
          <p className="mb-1 font-bold text-gray-500">
            Drive<span className="text-red-500">Sync</span>
          </p>
          <p>© {new Date().getFullYear()} DriveSync · All rights reserved</p>
        </footer>
      </div>
    </>
  );
}
