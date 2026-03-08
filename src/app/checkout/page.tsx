"use client";

import { useState } from "react";
import { applyPromoCode } from "./actions";

type Tier = "SOLO_TECH" | "MULTI_VAN";

interface TierConfig {
  id: Tier;
  name: string;
  price: string;
  tagline: string;
  features: string[];
}

const TIERS: TierConfig[] = [
  {
    id: "SOLO_TECH",
    name: "Solo Tech",
    price: "$99/mo",
    tagline: "For independent mobile mechanics",
    features: [
      "Unlimited Work Orders",
      "VIN Decoder",
      "Quote Builder",
      "Client Portal",
      "SMS Notifications",
    ],
  },
  {
    id: "MULTI_VAN",
    name: "Multi-Van",
    price: "$249/mo",
    tagline: "For shops with multiple technicians",
    features: [
      "Everything in Solo Tech",
      "Fleet Dashboard",
      "Batch Invoicing",
      "Multi-Tech Dispatch",
      "QBO Sync",
    ],
  },
];

export default function CheckoutPage() {
  const [selectedTier, setSelectedTier] = useState<Tier | null>(null);
  const [promoOpen, setPromoOpen] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const [promoStatus, setPromoStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [promoMessage, setPromoMessage] = useState<string | null>(null);

  async function handleApplyCode() {
    if (!promoCode.trim()) return;

    setPromoStatus("loading");
    setPromoMessage(null);

    const result = await applyPromoCode(promoCode.trim(), selectedTier ?? "SOLO_TECH");

    if (result.error) {
      setPromoStatus("error");
      setPromoMessage(result.error);
    } else if (result.success && result.redirect) {
      setPromoStatus("success");
      setPromoMessage("Code applied! Redirecting…");
      window.location.href = result.redirect;
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-gray-950 px-4 py-10">
      <div className="mx-auto w-full max-w-2xl">
        {/* Header */}
        <div className="mb-10 text-center">
          <p className="mb-1 text-xs font-bold uppercase tracking-widest text-red-500">
            DriveSync
          </p>
          <h1 className="text-3xl font-black text-white">Choose Your Plan</h1>
          <p className="mt-2 text-sm text-gray-400">
            Start your 14-day free trial — no credit card required
          </p>
        </div>

        {/* Tier cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {TIERS.map((tier) => {
            const isSelected = selectedTier === tier.id;
            return (
              <div
                key={tier.id}
                className={`rounded-2xl border bg-gray-900 p-6 transition-all ${
                  isSelected
                    ? "border-red-500 ring-1 ring-red-500"
                    : "border-gray-800"
                }`}
              >
                <div className="mb-4">
                  <h2 className="text-xl font-black text-white">{tier.name}</h2>
                  <p className="text-2xl font-black text-red-500 mt-1">
                    {tier.price}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">{tier.tagline}</p>
                </div>

                <ul className="mb-6 space-y-2">
                  {tier.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-center gap-2 text-sm text-gray-300"
                    >
                      <span className="text-red-500">✓</span>
                      {feature}
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => setSelectedTier(tier.id)}
                  className={`w-full rounded-xl py-3 text-sm font-black uppercase tracking-wide transition-all active:scale-95 ${
                    isSelected
                      ? "bg-red-600 text-white hover:bg-red-500"
                      : "border border-gray-700 bg-gray-800 text-white hover:bg-gray-700"
                  }`}
                >
                  {isSelected ? "Selected ✓" : "Select Plan"}
                </button>
              </div>
            );
          })}
        </div>

        {/* Promo code section */}
        <div className="mt-8">
          <button
            onClick={() => setPromoOpen((o) => !o)}
            className="w-full text-center text-sm text-gray-500 hover:text-gray-300 transition-colors"
          >
            {promoOpen ? "▲" : "▼"} Have a gift code or admin override?
          </button>

          {promoOpen && (
            <div className="mt-4 rounded-2xl border border-gray-800 bg-gray-900 p-5">
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-gray-400">
                Promo / Gift Code
              </label>
              <div className="flex gap-3">
                <input
                  type="text"
                  value={promoCode}
                  onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                  placeholder="e.g. BETA2026"
                  className="flex-1 rounded-xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-white placeholder-gray-600 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                />
                <button
                  onClick={handleApplyCode}
                  disabled={promoStatus === "loading" || !promoCode.trim()}
                  className="rounded-xl bg-red-600 px-5 py-3 text-sm font-black uppercase tracking-wide text-white transition-all hover:bg-red-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {promoStatus === "loading" ? "…" : "Apply"}
                </button>
              </div>

              {promoMessage && (
                <p
                  className={`mt-3 text-sm ${
                    promoStatus === "error" ? "text-red-400" : "text-green-400"
                  }`}
                >
                  {promoMessage}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Stripe CTA */}
        <div className="mt-6">
          <button
            disabled
            className="flex w-full cursor-not-allowed items-center justify-center rounded-xl border border-gray-800 bg-gray-900 py-4 text-sm font-semibold text-gray-600"
          >
            💳 Stripe Integration Coming Soon
          </button>
          <p className="mt-2 text-center text-xs text-gray-600">
            Use a promo code above to activate your account now.
          </p>
        </div>
      </div>
    </div>
  );
}
