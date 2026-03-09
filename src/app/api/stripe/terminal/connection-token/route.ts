/**
 * POST /api/stripe/terminal/connection-token
 *
 * Generates a Stripe Terminal connection token so that a browser-based
 * Stripe Terminal SDK can discover and connect to a physical card reader.
 *
 * Reference: https://stripe.com/docs/terminal/payments/setup-integration
 *
 * Environment variables required:
 *   STRIPE_SECRET_KEY — Stripe secret API key (sk_live_… or sk_test_…)
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { getStripe } from "@/lib/stripe";

/** Zod schema for the Stripe connection token response. */
const ConnectionTokenSchema = z.object({
  object: z.literal("terminal.connection_token"),
  secret: z.string().min(1),
});

export async function POST() {
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json(
      {
        error:
          "Stripe Terminal is not configured. Set STRIPE_SECRET_KEY in Settings → Integrations.",
      },
      { status: 503 },
    );
  }

  try {
    const stripe = getStripe();
    const token = await stripe.terminal.connectionTokens.create();

    // Validate the response shape before returning to the client.
    const validated = ConnectionTokenSchema.safeParse(token);
    if (!validated.success) {
      return NextResponse.json(
        { error: "Unexpected response from Stripe Terminal API." },
        { status: 502 },
      );
    }

    return NextResponse.json({ secret: validated.data.secret });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Stripe Terminal error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
