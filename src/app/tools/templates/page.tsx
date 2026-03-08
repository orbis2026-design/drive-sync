import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title:
    "Free Auto Repair Legal Templates | California BAR Compliant | DriveSync",
  description:
    "Download free, legally-compliant auto repair forms: California BAR invoices, diagnostic authorization waivers, and pre-existing damage waivers.",
};

const TEMPLATES = [
  {
    id: "california-bar-compliant-invoice",
    icon: "🧾",
    title: "California BAR Compliant Invoice",
    description:
      "A fully-compliant auto repair invoice meeting all California Bureau of Automotive Repair requirements — parts, labor, authorization signatures, and environmental fees.",
  },
  {
    id: "diagnostic-authorization-waiver",
    icon: "🔬",
    title: "Diagnostic Authorization Waiver",
    description:
      "Protect your shop legally before any diagnostic work begins. Customers authorize diagnostic fees in writing before you turn a wrench.",
  },
  {
    id: "pre-existing-damage-waiver",
    icon: "📷",
    title: "Pre-Existing Damage Waiver",
    description:
      "Document vehicle condition before service begins. Timestamped waiver protects you from spurious damage claims.",
  },
];

export default function TemplatesPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Hero */}
      <section className="px-4 py-16 text-center sm:py-24">
        <div className="mx-auto max-w-2xl">
          <span className="mb-4 inline-block rounded-full border border-red-800/50 bg-red-950/60 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-red-400">
            Free Templates
          </span>
          <h1 className="mt-4 text-4xl font-black leading-tight tracking-tight text-white sm:text-5xl">
            Auto Repair Legal Templates
          </h1>
          <p className="mt-4 text-lg text-gray-400">
            Download free, legally-compliant forms for your mobile mechanic
            shop. California BAR compliant. No sign-up required.
          </p>
        </div>
      </section>

      {/* Template cards */}
      <section className="mx-auto max-w-4xl px-4 pb-16">
        <div className="grid gap-6 sm:grid-cols-3">
          {TEMPLATES.map((tmpl) => (
            <div
              key={tmpl.id}
              className="flex flex-col rounded-2xl border border-gray-800 bg-gray-900 p-6"
            >
              <span className="text-4xl" aria-hidden="true">
                {tmpl.icon}
              </span>
              <h2 className="mt-3 text-base font-bold text-white">
                {tmpl.title}
              </h2>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-gray-400">
                {tmpl.description}
              </p>
              <Link
                href={`/tools/templates/${tmpl.id}`}
                className="mt-5 inline-flex items-center justify-center rounded-xl bg-red-600 px-5 py-2.5 text-sm font-black text-white transition-colors hover:bg-red-500"
              >
                Generate Free PDF →
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* Upsell banner */}
      <section className="border-t border-gray-800 bg-gray-900 px-4 py-12 text-center">
        <p className="text-lg font-bold text-white">
          DriveSync generates these automatically with 2-way SMS signature
          capture.
        </p>
        <p className="mt-1 text-sm text-gray-400">
          Stop doing paperwork. Your customers sign on their phone — you get
          paid faster.
        </p>
        <Link
          href="/auth/register"
          className="mt-6 inline-flex min-h-[48px] min-w-[200px] items-center justify-center rounded-2xl bg-red-600 px-8 py-3 text-base font-black text-white transition-all hover:bg-red-500"
        >
          Start Free Trial
        </Link>
      </section>

      <footer className="border-t border-gray-800 bg-gray-950 px-4 py-8 text-center text-xs text-gray-600">
        <p className="mb-1 font-bold text-gray-500">
          Drive<span className="text-red-500">Sync</span>
        </p>
        <p>© {new Date().getFullYear()} DriveSync · All rights reserved</p>
      </footer>
    </div>
  );
}
