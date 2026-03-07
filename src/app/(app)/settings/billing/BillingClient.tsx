"use client";

import { useState, useTransition } from "react";
import {
  createBillingPortalSession,
} from "./actions";
import type { SubscriptionDetails } from "./actions";

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function StatusBadge({
  status,
}: {
  status: SubscriptionDetails["subscriptionStatus"];
}) {
  const configs = {
    ACTIVE: {
      label: "Active",
      classes: "bg-green-900/40 border-green-700 text-green-400",
      dot: "bg-green-400",
    },
    PAST_DUE: {
      label: "Past Due",
      classes: "bg-red-900/40 border-red-700 text-red-400",
      dot: "bg-red-400 animate-pulse",
    },
    CANCELED: {
      label: "Canceled",
      classes: "bg-gray-800 border-gray-700 text-gray-400",
      dot: "bg-gray-500",
    },
    NONE: {
      label: "No Subscription",
      classes: "bg-gray-800 border-gray-700 text-gray-400",
      dot: "bg-gray-500",
    },
  } as const;

  const cfg = configs[status as keyof typeof configs] ?? configs.NONE;

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full border ${cfg.classes}`}
    >
      <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main billing client component
// ---------------------------------------------------------------------------

export default function BillingClient({
  initial,
}: {
  initial: SubscriptionDetails;
}) {
  const [details] = useState<SubscriptionDetails>(initial);
  const [isPending, startTransition] = useTransition();
  const [toast, setToast] = useState<string | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  }

  function handleOpenPortal() {
    startTransition(async () => {
      const res = await createBillingPortalSession(
        typeof window !== "undefined" ? window.location.href : "/settings/billing",
      );
      if ("error" in res) {
        showToast(res.error);
      } else {
        window.location.href = res.url;
      }
    });
  }

  const isPastDue = details.subscriptionStatus === "PAST_DUE";

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-gray-800 border border-gray-600 text-sm text-white px-4 py-2 rounded-xl shadow-2xl max-w-xs text-center">
          {toast}
        </div>
      )}

      <div className="max-w-xl mx-auto px-4 pt-6 pb-20 space-y-6">
        {/* Past-due banner */}
        {isPastDue && (
          <div className="bg-red-900/20 border border-red-800 rounded-2xl p-4 flex items-start gap-3">
            <span className="text-2xl">⚠️</span>
            <div>
              <p className="font-semibold text-red-400 text-sm">
                Payment Past Due
              </p>
              <p className="text-xs text-red-300/70 mt-0.5">
                Your account has a past-due balance. Update your payment method
                to restore full access.
              </p>
            </div>
          </div>
        )}

        {/* Plan card */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-lg">DriveSync Pro</h2>
            <StatusBadge status={details.subscriptionStatus} />
          </div>

          <div className="flex items-end gap-1 mb-4">
            <span className="text-4xl font-black text-white">$99</span>
            <span className="text-gray-400 pb-1">/month</span>
          </div>

          <ul className="space-y-2 mb-6">
            {[
              "Unlimited work orders & quotes",
              "Client portal with digital signatures",
              "AI-powered diagnostics & MPI",
              "Parts catalog & supplier punch-out",
              "SMS marketing & reminders",
              "Live en-route tracking for clients",
              "QuickBooks Online sync",
              "3D vehicle handoff visualizer",
            ].map((feat) => (
              <li key={feat} className="flex items-center gap-2 text-sm text-gray-300">
                <span className="text-green-400 text-xs">✓</span>
                {feat}
              </li>
            ))}
          </ul>

          {details.stripeCustomerId ? (
            <button
              onClick={handleOpenPortal}
              disabled={isPending}
              className="w-full bg-brand-400 hover:bg-brand-300 text-black font-bold py-3 rounded-xl transition-colors disabled:opacity-60"
            >
              {isPending ? "Opening…" : "Manage Subscription & Invoices →"}
            </button>
          ) : (
            <button
              onClick={handleOpenPortal}
              disabled={isPending}
              className="w-full bg-brand-400 hover:bg-brand-300 text-black font-bold py-3 rounded-xl transition-colors disabled:opacity-60"
            >
              {isPending ? "Redirecting…" : "Subscribe — $99/mo →"}
            </button>
          )}

          <p className="text-xs text-gray-600 text-center mt-3">
            Billing is managed securely via Stripe. You can cancel anytime.
          </p>
        </div>

        {/* Billing details */}
        {details.stripeCustomerId && (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
            <h3 className="font-semibold text-sm text-gray-300 mb-4">
              Billing Details
            </h3>

            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Stripe Customer ID</span>
                <span className="text-gray-300 font-mono text-xs">
                  {details.stripeCustomerId}
                </span>
              </div>

              {details.currentPeriodEnd && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Next billing date</span>
                  <span className="text-gray-300">
                    {new Date(details.currentPeriodEnd).toLocaleDateString(
                      "en-US",
                      { month: "long", day: "numeric", year: "numeric" },
                    )}
                  </span>
                </div>
              )}

              {details.paymentMethodLast4 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Card on file</span>
                  <span className="text-gray-300">
                    •••• •••• •••• {details.paymentMethodLast4}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Invoices */}
        {details.invoices && details.invoices.length > 0 && (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
            <h3 className="font-semibold text-sm text-gray-300 mb-4">
              Recent Invoices
            </h3>

            <div className="space-y-2">
              {details.invoices.map((inv) => (
                <div
                  key={inv.id}
                  className="flex items-center justify-between gap-2 py-2 border-b border-gray-800 last:border-0"
                >
                  <div>
                    <p className="text-sm text-gray-200">
                      {new Date(inv.date * 1000).toLocaleDateString("en-US", {
                        month: "short",
                        year: "numeric",
                      })}
                    </p>
                    <span
                      className={`text-xs ${
                        inv.status === "paid"
                          ? "text-green-400"
                          : "text-red-400"
                      }`}
                    >
                      {inv.status.charAt(0).toUpperCase() +
                        inv.status.slice(1)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-white">
                      {(inv.amountCents / 100).toLocaleString("en-US", {
                        style: "currency",
                        currency: "USD",
                      })}
                    </span>
                    {inv.pdfUrl && (
                      <a
                        href={inv.pdfUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-sky-400 hover:text-sky-300"
                      >
                        PDF
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
