// ---------------------------------------------------------------------------
// Maintenance schedule utilities — shared between server and client code.
// Pure functions; no async, no Prisma, no "use server".
// ---------------------------------------------------------------------------

/** One item in a GlobalVehicle's maintenanceScheduleJson array. */
export type MaintenanceItem = {
  /** Human-readable service name, e.g. "Oil Change", "100k Mile Service". */
  service: string;
  /**
   * Recurring mileage interval (e.g. 5 000 for oil changes).
   * Omit when the service is a one-time milestone.
   */
  intervalMiles?: number;
  /**
   * One-time odometer milestone (e.g. 100 000 for the 100k service).
   * Omit when the service is recurring.
   */
  atMileage?: number;
};

export type MaintenanceBadge = {
  service: string;
  label: string;
  urgency: "overdue" | "due_soon";
  icon: string;
  detail: string;
};

/** Threshold (miles) before a one-time milestone service is flagged "due soon". */
const MILESTONE_DUE_SOON_THRESHOLD = 2_000;
/** Threshold (miles) before a recurring service is flagged "due soon". */
const RECURRING_DUE_SOON_THRESHOLD = 500;
/**
 * Given current odometer reading and a maintenance schedule, return the list
 * of services that are overdue or coming due soon.
 */
export function computeMaintenanceBadges(
  mileageIn: number,
  schedule: MaintenanceItem[]
): MaintenanceBadge[] {
  const badges: MaintenanceBadge[] = [];

  for (const item of schedule) {
    if (item.atMileage !== undefined) {
      // One-time milestone service (e.g. "100k Mile Service")
      if (mileageIn >= item.atMileage) {
        badges.push({
          service: item.service,
          label: `${item.service} Overdue`,
          urgency: "overdue",
          icon: "🔴",
          detail: `Vehicle at ${mileageIn.toLocaleString()} mi — was due at ${item.atMileage.toLocaleString()} mi`,
        });
      } else if (item.atMileage - mileageIn <= MILESTONE_DUE_SOON_THRESHOLD) {
        badges.push({
          service: item.service,
          label: `${item.service} Due Soon`,
          urgency: "due_soon",
          icon: "⚠️",
          detail: `Due at ${item.atMileage.toLocaleString()} mi — ${(item.atMileage - mileageIn).toLocaleString()} mi away`,
        });
      }
    } else if (item.intervalMiles !== undefined && item.intervalMiles > 0) {
      // Recurring service (e.g. "Oil Change" every 5 000 mi)
      const remainder = mileageIn % item.intervalMiles;
      const dueInMiles = remainder === 0 ? 0 : item.intervalMiles - remainder;
      const nextDue =
        Math.ceil(mileageIn / item.intervalMiles) * item.intervalMiles;

      if (dueInMiles === 0 && mileageIn >= item.intervalMiles) {
        badges.push({
          service: item.service,
          label: `${item.service} Due`,
          urgency: "overdue",
          icon: "🔴",
          detail: `Due now at ${nextDue.toLocaleString()} mi`,
        });
      } else if (dueInMiles > 0 && dueInMiles <= RECURRING_DUE_SOON_THRESHOLD) {
        badges.push({
          service: item.service,
          label: `${item.service} Due Soon`,
          urgency: "due_soon",
          icon: "⚠️",
          detail: `Due in ${dueInMiles.toLocaleString()} mi (at ${nextDue.toLocaleString()} mi)`,
        });
      }
    }
  }

  return badges;
}
