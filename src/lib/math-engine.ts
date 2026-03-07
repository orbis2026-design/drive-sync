/**
 * math-engine.ts — Advanced Tax & Environmental Fee Calculator (Issue #51)
 *
 * Automotive billing requires more precise tax handling than a flat percentage:
 *   - Labor is often non-taxable in many states.
 *   - Parts/materials are typically subject to sales tax.
 *   - Environmental hazardous-waste fees apply when fluids (oil, brake fluid,
 *     coolant, etc.) are included in the job.
 *
 * This module reads a `TaxMatrix` (stored per-tenant in `tax_matrix_json`)
 * and produces a fully itemised `TaxBreakdown` that can be rendered on both
 * the mechanic's Quote Builder and the Client Approval Portal for absolute
 * legal compliance.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A single parts line-item as persisted in `parts_json`.
 * Mirrors SelectedPart from the Quote Builder actions.
 */
export interface PartLine {
  partId: string;
  name: string;
  partNumber: string;
  supplier: string;
  wholesalePriceCents: number;
  retailPriceCents: number;
  quantity: number;
}

/**
 * A structured labour line-item as persisted in `labor_json`.
 */
export interface LaborLine {
  description: string;
  /** Decimal hours, e.g. 2.5 */
  hours: number;
}

/**
 * Per-tenant tax configuration stored in `tenants.tax_matrix_json`.
 *
 * All rate fields are expressed as decimal fractions (e.g. 0.085 = 8.5 %).
 * Fee fields are expressed in US dollars (e.g. 5.00 = $5.00).
 */
export interface TaxMatrix {
  /** Tax rate applied to the labour subtotal (0 in most US states). */
  labor_tax_rate: number;
  /** Tax rate applied to the parts subtotal (e.g. 0.085 for 8.5 %). */
  parts_tax_rate: number;
  /** Flat environmental/hazardous-waste fee added when fluids are detected. */
  environmental_fee_flat: number;
  /**
   * Percentage of parts subtotal charged as an environmental fee.
   * This is in addition to (not instead of) the flat fee.
   * Use 0 if you only want the flat fee.
   */
  environmental_fee_percentage: number;
}

/**
 * Fully itemised tax breakdown returned by `calculateTax`.
 * Every line is in US cents to avoid floating-point rounding errors.
 */
export interface TaxBreakdown {
  /** Sum of all parts line-items at retail (or wholesale) price × qty. */
  partsSubtotalCents: number;
  /** Sum of labour hours × shop rate. */
  laborSubtotalCents: number;
  /** Parts subtotal + labour subtotal. */
  subtotalCents: number;

  /** Tax on the parts subtotal only (TaxMatrix.parts_tax_rate). */
  partsTaxCents: number;
  /** Tax on the labour subtotal only (TaxMatrix.labor_tax_rate). */
  laborTaxCents: number;

  /**
   * True when one or more fluid parts were detected in the parts list.
   * Triggers the environmental fee.
   */
  hasFluidParts: boolean;
  /** Flat environmental/hazardous-waste fee in cents. */
  environmentalFeeFlatCents: number;
  /** Percentage-based environmental fee in cents (applied to parts subtotal). */
  environmentalFeePercentageCents: number;
  /** environmentalFeeFlatCents + environmentalFeePercentageCents */
  environmentalFeeTotalCents: number;

  /** partsTaxCents + laborTaxCents */
  totalTaxCents: number;
  /** subtotalCents + totalTaxCents + environmentalFeeTotalCents */
  grandTotalCents: number;
}

// ---------------------------------------------------------------------------
// Default tax matrix (used when no tenant-specific matrix is configured)
// ---------------------------------------------------------------------------

/** Safe fallback used when `tax_matrix_json` cannot be parsed. */
export const DEFAULT_TAX_MATRIX: TaxMatrix = {
  labor_tax_rate: 0.0,
  parts_tax_rate: 0.085,
  environmental_fee_flat: 5.0,
  environmental_fee_percentage: 0.0,
};

// ---------------------------------------------------------------------------
// Fluid detection keywords
// ---------------------------------------------------------------------------

/**
 * Keyword patterns used to identify fluid/lubricant parts in the parts list.
 * When any part name matches one of these patterns the environmental fee is
 * automatically appended to the invoice.
 */
const FLUID_KEYWORDS: RegExp[] = [
  /\boil\b/i,
  /\bcoolant\b/i,
  /\bantifreeze\b/i,
  /\bbrake\s*fluid\b/i,
  /\btransmission\s*fluid\b/i,
  /\bdifferential\s*fluid\b/i,
  /\bpower\s*steering\s*fluid\b/i,
  /\bwindshield\s*wash(er)?\b/i,
  /\bwasher\s*fluid\b/i,
  /\brefrigerant\b/i,
  /\bfreon\b/i,
  /\bgreasing\b/i,
  /\bgrease\b/i,
  /\bfluid\b/i,
  /\blubricant\b/i,
];

/**
 * Returns true when the given part name contains any fluid-related keyword.
 */
export function isFluidPart(partName: string): boolean {
  return FLUID_KEYWORDS.some((re) => re.test(partName));
}

// ---------------------------------------------------------------------------
// parseTaxMatrix
// ---------------------------------------------------------------------------

/**
 * Safely parses a raw JSON value (from `tenants.tax_matrix_json`) into a
 * validated `TaxMatrix`.  Any missing or invalid fields fall back to the
 * `DEFAULT_TAX_MATRIX` values.
 */
export function parseTaxMatrix(raw: unknown): TaxMatrix {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...DEFAULT_TAX_MATRIX };
  }

  const r = raw as Record<string, unknown>;

  function safeRate(key: string, fallback: number): number {
    const v = r[key];
    if (typeof v === "number" && isFinite(v) && v >= 0 && v <= 1) {
      return v;
    }
    return fallback;
  }

  function safeFee(key: string, fallback: number): number {
    const v = r[key];
    if (typeof v === "number" && isFinite(v) && v >= 0) {
      return v;
    }
    return fallback;
  }

  return {
    labor_tax_rate: safeRate(
      "labor_tax_rate",
      DEFAULT_TAX_MATRIX.labor_tax_rate,
    ),
    parts_tax_rate: safeRate(
      "parts_tax_rate",
      DEFAULT_TAX_MATRIX.parts_tax_rate,
    ),
    environmental_fee_flat: safeFee(
      "environmental_fee_flat",
      DEFAULT_TAX_MATRIX.environmental_fee_flat,
    ),
    environmental_fee_percentage: safeRate(
      "environmental_fee_percentage",
      DEFAULT_TAX_MATRIX.environmental_fee_percentage,
    ),
  };
}

// ---------------------------------------------------------------------------
// calculateTax — core math engine
// ---------------------------------------------------------------------------

export interface CalculateTaxParams {
  parts: PartLine[];
  laborLines: LaborLine[];
  /** Shop labour rate in US cents per hour. */
  shopRateCents: number;
  /**
   * When true, parts are billed at `wholesalePriceCents` rather than
   * `retailPriceCents` (customer-supplied parts scenario).
   */
  customerSuppliedParts?: boolean;
  taxMatrix: TaxMatrix;
}

/**
 * Calculates a fully itemised tax breakdown applying the provided TaxMatrix.
 *
 * Algorithm:
 *   1. Sum parts at retail (or wholesale) price × quantity → partsSubtotal.
 *   2. Sum labour hours × shopRate → laborSubtotal.
 *   3. Detect fluid parts → hasFluidParts.
 *   4. Apply parts_tax_rate to partsSubtotal → partsTax.
 *   5. Apply labor_tax_rate to laborSubtotal → laborTax.
 *   6. If hasFluidParts:
 *        environmentalFeeFlat  = environmental_fee_flat × 100 (to cents)
 *        environmentalFeePct   = round(partsSubtotal × environmental_fee_percentage)
 *   7. grandTotal = subtotal + partsTax + laborTax + environmentalFeeTotal.
 */
export function calculateTax(params: CalculateTaxParams): TaxBreakdown {
  const { parts, laborLines, shopRateCents, customerSuppliedParts, taxMatrix } =
    params;

  // --- 1. Parts subtotal -----------------------------------------------
  const partsSubtotalCents = parts.reduce((sum, p) => {
    const unitPrice = customerSuppliedParts
      ? p.wholesalePriceCents
      : p.retailPriceCents;
    return sum + unitPrice * p.quantity;
  }, 0);

  // --- 2. Labour subtotal -----------------------------------------------
  const laborSubtotalCents = Math.round(
    laborLines.reduce((sum, l) => sum + Math.max(0, l.hours), 0) * shopRateCents,
  );

  const subtotalCents = partsSubtotalCents + laborSubtotalCents;

  // --- 3. Fluid detection -----------------------------------------------
  const hasFluidParts = parts.some((p) => isFluidPart(p.name));

  // --- 4 & 5. Tax calculations ------------------------------------------
  const partsTaxCents = Math.round(
    partsSubtotalCents * taxMatrix.parts_tax_rate,
  );
  const laborTaxCents = Math.round(
    laborSubtotalCents * taxMatrix.labor_tax_rate,
  );
  const totalTaxCents = partsTaxCents + laborTaxCents;

  // --- 6. Environmental fee ---------------------------------------------
  let environmentalFeeFlatCents = 0;
  let environmentalFeePercentageCents = 0;

  if (hasFluidParts) {
    // Convert dollar flat fee → cents
    environmentalFeeFlatCents = Math.round(
      taxMatrix.environmental_fee_flat * 100,
    );
    environmentalFeePercentageCents = Math.round(
      partsSubtotalCents * taxMatrix.environmental_fee_percentage,
    );
  }

  const environmentalFeeTotalCents =
    environmentalFeeFlatCents + environmentalFeePercentageCents;

  // --- 7. Grand total ---------------------------------------------------
  const grandTotalCents =
    subtotalCents + totalTaxCents + environmentalFeeTotalCents;

  return {
    partsSubtotalCents,
    laborSubtotalCents,
    subtotalCents,
    partsTaxCents,
    laborTaxCents,
    hasFluidParts,
    environmentalFeeFlatCents,
    environmentalFeePercentageCents,
    environmentalFeeTotalCents,
    totalTaxCents,
    grandTotalCents,
  };
}

// ---------------------------------------------------------------------------
// formatCentsAsDollars — display helper
// ---------------------------------------------------------------------------

/** Formats a cent integer as a US dollar string, e.g. 8550 → "$85.50" */
export function formatCentsAsDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
