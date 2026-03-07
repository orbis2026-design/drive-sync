"use client";

/**
 * PricingTable.tsx
 *
 * Two-tier pricing table for DriveSync.
 *
 * Tiers:
 *   1. Solo Tech  — $99/mo
 *   2. Multi-Van Shop — $249/mo
 *
 * Each "Start Trial" button calls the subscription checkout API route,
 * which creates a Stripe Customer + Checkout Session and redirects the
 * browser to the Stripe-hosted payment page.
 */

import { useState, useTransition } from "react";

type Tier = {
  id: string;
  name: string;
  price: string;
  period: string;
  priceId: string; // Stripe Price ID — set via environment variable at runtime
  badge?: string;
  highlight: boolean;
  accentClass: string;
  borderClass: string;
  features: string[];
};

const TIERS: Tier[] = [
  {
    id: "solo",
    name: "Solo Tech",
    price: "$99",
    period: "/mo",
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_SOLO ?? "price_solo_placeholder",
    highlight: false,
    accentClass: "text-gray-300",
    borderClass: "border-gray-700",
    features: [
      "1 User",
      "Unlimited VIN Scans",
      "AI Vision Diagnostics",
      "Standard Stripe POS",
      "Native SMS Handoffs",
      "Global Lexicon Access",
      "14-day free trial",
    ],
  },
  {
    id: "fleet",
    name: "Multi-Van Shop",
    price: "$249",
    period: "/mo",
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_FLEET ?? "price_fleet_placeholder",
    badge: "Most Popular",
    highlight: true,
    accentClass: "text-yellow-400",
    borderClass: "border-yellow-600/60",
    features: [
      "Up to 5 Users",
      "Everything in Solo Tech",
      "Fleet Batch Invoicing",
      "Dispatch Kanban Board",
      "QA Approval Queue",
      "Role-Based Access Control",
      "14-day free trial",
    ],
  },
];

export function PricingTable() {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleStartTrial(priceId: string) {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/stripe/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ priceId }),
        });

        const data = (await res.json()) as { url?: string; error?: string };

        if (!res.ok || !data.url) {
          setError(data.error ?? "Could not start checkout. Please try again.");
          return;
        }

        window.location.href = data.url;
      } catch {
        setError("Network error — please check your connection and try again.");
      }
    });
  }

  return (
    <section id="pricing" className="bg-gray-950 px-4 py-20">
      <div className="mx-auto max-w-4xl">
        {/* Header */}
        <div className="mb-12 text-center">
          <span className="mb-3 inline-block text-xs font-bold uppercase tracking-widest text-gray-500">
            Simple pricing
          </span>
          <h2 className="text-3xl font-black text-white sm:text-4xl">
            Pick your plan
          </h2>
          <p className="mt-3 text-gray-400">
            Both plans include a 14-day free trial. A card is required to start
            — cancel any time before the trial ends.
          </p>
        </div>

        {/* Error banner */}
        {error && (
          <div
            role="alert"
            className="mb-6 rounded-2xl border border-red-700 bg-red-950 px-4 py-3 text-sm text-red-400"
          >
            {error}
          </div>
        )}

        {/* Tier cards */}
        <div className="grid gap-6 sm:grid-cols-2">
          {TIERS.map((tier) => (
            <div
              key={tier.id}
              className={`relative flex flex-col rounded-2xl border ${tier.borderClass} ${
                tier.highlight ? "bg-gray-900" : "bg-gray-900/60"
              } p-6`}
            >
              {/* Popular badge */}
              {tier.badge && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full border border-yellow-600/50 bg-yellow-900/80 px-4 py-1 text-xs font-bold uppercase tracking-widest text-yellow-400">
                  {tier.badge}
                </span>
              )}

              {/* Tier name */}
              <h3 className={`text-base font-bold uppercase tracking-widest ${tier.accentClass}`}>
                {tier.name}
              </h3>

              {/* Price */}
              <div className="mt-3 flex items-end gap-1">
                <span className="text-5xl font-black text-white">
                  {tier.price}
                </span>
                <span className="mb-1 text-sm text-gray-500">{tier.period}</span>
              </div>

              {/* Divider */}
              <hr className="my-5 border-gray-800" />

              {/* Feature list */}
              <ul className="flex-1 space-y-2.5">
                {tier.features.map((f) => (
                  <li key={f} className="flex items-center gap-2.5 text-sm text-gray-300">
                    <span className="text-green-500">✓</span>
                    {f}
                  </li>
                ))}
              </ul>

              {/* CTA button */}
              <button
                type="button"
                disabled={isPending}
                onClick={() => handleStartTrial(tier.priceId)}
                className={`mt-8 flex min-h-[52px] w-full items-center justify-center rounded-xl text-sm font-black uppercase tracking-wide transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900 disabled:opacity-50 disabled:cursor-not-allowed ${
                  tier.highlight
                    ? "bg-yellow-500 text-gray-900 hover:bg-yellow-400 focus-visible:ring-yellow-400 shadow-xl shadow-yellow-900/30"
                    : "bg-red-600 text-white hover:bg-red-500 focus-visible:ring-red-500 shadow-xl shadow-red-900/30"
                }`}
              >
                {isPending ? "Starting…" : "Start 14-Day Free Trial"}
              </button>
            </div>
          ))}
        </div>

        {/* Footer note */}
        <p className="mt-8 text-center text-xs text-gray-600">
          Prices in USD · Billed monthly · Cancel any time · Stripe-secured
          checkout
        </p>
      </div>
    </section>
  );
}
