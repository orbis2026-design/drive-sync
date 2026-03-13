import type { WorkOrderStatus } from "@prisma/client";

/**
 * High-level job types we care about for the Boltbook pivot.
 *
 * These are intentionally _not_ persisted as an enum column yet; they are
 * encoded into JSON fields on the work order (e.g. checklists_json) so we can
 * iterate on the product without risky migrations.
 */
export type JobType =
  | "OIL_CHANGE"
  | "OIL_CHANGE_PLUS_BRAKES"
  | "DIAGNOSTIC"
  | "GENERAL_REPAIR";

/**
 * Normalized shape for a pre-inspection checklist item.
 * Stored inside work_orders.checklists_json under the "preInspection" key.
 */
export type ChecklistStatus = "ok" | "attention" | "critical" | "na";

export type PreInspectionItemId =
  | "fluids"
  | "leaks"
  | "tireWear"
  | "brakesVisual"
  | "lights"
  | "wipers"
  | "windshield"
  | "battery";

export interface PreInspectionItem {
  id: PreInspectionItemId;
  label: string;
  status: ChecklistStatus;
  note?: string;
}

export interface PreInspectionChecklistState {
  completed: boolean;
  completedAt?: string;
  items: PreInspectionItem[];
}

/**
 * Generic line-item kinds that can exist on an oil-change focused job.
 * These are snapshots derived from parts_json and labor_json.
 */
export type WorkOrderLineItemKind = "PART" | "LABOR" | "FEE" | "LIGHT_JOB";

export interface WorkOrderLineItemPrice {
  unitPriceCents: number;
  quantity: number;
  subtotalCents: number;
}

export interface WorkOrderLineItem {
  id: string;
  kind: WorkOrderLineItemKind;
  description: string;
  price: WorkOrderLineItemPrice;
  /** Optional inventory SKU / part number for analytics. */
  sku?: string;
  /** Arbitrary tags, e.g. ["oil-change-package"], ["simple-brake-job"]. */
  tags?: string[];
}

export interface WorkOrderMoneySummary {
  partsCents: number;
  laborCents: number;
  feesCents: number;
  taxCents: number;
  totalCents: number;
}

/**
 * Snapshot of how an oil-change oriented work order is represented in
 * JSON fields plus existing typed columns.
 */
export interface OilChangeWorkOrderSnapshot {
  id: string;
  tenantId: string;
  vehicleId: string;
  status: WorkOrderStatus;
  title: string;
  description: string;
  jobType: JobType;
  mileageAtIntake: number | null;
  /** Structured pre-inspection checklist. */
  preInspection?: PreInspectionChecklistState;
  /** Flattened, display-ready line items. */
  lineItems: WorkOrderLineItem[];
  /** Roll-up money summary used for pricing UI. */
  money: WorkOrderMoneySummary;
}

/**
 * Helpers
 */

export function computeMoneySummary(
  lineItems: WorkOrderLineItem[],
  taxRate: number,
): WorkOrderMoneySummary {
  const base = lineItems.reduce(
    (acc, item) => {
      const { subtotalCents } = item.price;
      if (item.kind === "PART") {
        acc.partsCents += subtotalCents;
      } else if (item.kind === "LABOR") {
        acc.laborCents += subtotalCents;
      } else if (item.kind === "FEE") {
        acc.feesCents += subtotalCents;
      }
      return acc;
    },
    { partsCents: 0, laborCents: 0, feesCents: 0 },
  );

  const subtotal = base.partsCents + base.laborCents + base.feesCents;
  const taxCents = Math.round(subtotal * taxRate);

  return {
    ...base,
    taxCents,
    totalCents: subtotal + taxCents,
  };
}

export function isLightJob(item: WorkOrderLineItem): boolean {
  return item.kind === "LIGHT_JOB" || item.tags?.includes("simple-brake-job") === true;
}

