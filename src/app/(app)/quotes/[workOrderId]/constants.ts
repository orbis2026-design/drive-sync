/**
 * Shared Quote Builder constants.
 *
 * Imported by both the Server Actions (actions.ts) and the client component
 * (QuoteBuilderClient.tsx) so the live preview and the backend calculation
 * always use exactly the same tax rate.
 */

/** Sales-tax rate applied to the full invoice subtotal (8.75 %). */
export const TAX_RATE = 0.0875;

/**
 * Fallback shop labour rate used when no tenant-specific rate is configured.
 * $110.00 per hour — a representative mid-market independent-shop rate.
 */
export const DEFAULT_SHOP_RATE_CENTS = 11000;
