/**
 * Shared payment and card-processing fee logic for financial reporting.
 *
 * Used by analytics (dashboard) and accounting (monthly reports) so card fees
 * are only applied when payment method is card — never for cash, check, or null.
 *
 * Edge cases handled:
 * - cash / check: no card fee (isCardPayment returns false).
 * - null paymentMethod: legacy or missing data; no card fee (conservative).
 * - Only "card_tap" and "card_manual" incur fees; any other string is treated as non-card.
 */

/** Stripe / Square processing fee: 2.9% + $0.30 per transaction. */
export const CARD_FEE_RATE = 0.029;
export const CARD_FEE_FIXED_CENTS = 30;

/** Stored payment method values on WorkOrder (payment_method column). */
export const PAYMENT_METHOD_CARD_TAP = "card_tap";
export const PAYMENT_METHOD_CARD_MANUAL = "card_manual";

/**
 * Returns true only when the work order was paid by card (tap or manual entry).
 * Cash, check, and null (legacy/unknown) do not incur card processing fees.
 */
export function isCardPayment(paymentMethod: string | null): boolean {
  return (
    paymentMethod === PAYMENT_METHOD_CARD_TAP ||
    paymentMethod === PAYMENT_METHOD_CARD_MANUAL
  );
}

/**
 * Computes approximate card processing fee in cents for a given total (total
 * including tax). Only call when isCardPayment(method) is true.
 */
export function computeCardFeeCents(totalCents: number): number {
  return Math.round(totalCents * CARD_FEE_RATE) + CARD_FEE_FIXED_CENTS;
}
