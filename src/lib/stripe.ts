/**
 * src/lib/stripe.ts
 *
 * Shared Stripe server-side utility for DriveSync.
 * Provides a lazily-initialized Stripe client so the key is never read
 * at module load time (which would fail during Next.js build).
 *
 * Environment variables required:
 *   STRIPE_SECRET_KEY — Stripe secret API key (sk_live_… or sk_test_…)
 */

import Stripe from "stripe";

/** Lazily-initialized Stripe instance. */
let _stripe: Stripe | null = null;

/**
 * Returns a singleton Stripe client initialized from STRIPE_SECRET_KEY.
 * Throws if the environment variable is absent so callers surface a clear error.
 */
export function getStripe(): Stripe {
  if (_stripe) return _stripe;

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY environment variable is not set.",
    );
  }

  _stripe = new Stripe(key, { apiVersion: "2026-02-25.clover" });
  return _stripe;
}
