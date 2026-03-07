/**
 * predictive-service.ts — Predictive Service Engine (Issue #57)
 *
 * Utility functions for cross-referencing a vehicle's current odometer
 * reading against the cached maintenance matrix to generate one-tap
 * upsell suggestions for the Quote Builder.
 *
 * All functions are pure (no async, no DB access) so they can be called
 * from both Server Components and Client Components.
 */

import type { MaintenanceInterval, MaintenanceSchedule } from "@/lib/schemas/maintenance";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A maintenance task that is due within the look-ahead window. */
export interface DueService {
  /** The mileage interval this task belongs to. */
  mileage: number;
  /** Human-readable task name, e.g. "Replace Engine Oil". */
  task: string;
  /**
   * Miles until the next occurrence of this interval.
   * Negative values indicate the vehicle has already passed the milestone.
   */
  milesUntilDue: number;
  /** True when the vehicle has already passed this milestone. */
  isOverdue: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Look-ahead window in miles (Issue #57: "3,000-mile radius"). */
const LOOK_AHEAD_MILES = 3_000;

// ---------------------------------------------------------------------------
// getDueServices
// ---------------------------------------------------------------------------

/**
 * Returns all maintenance tasks that fall within a 3,000-mile radius of the
 * vehicle's current odometer reading.
 *
 * "Within a 3,000-mile radius" means tasks where the upcoming mileage
 * milestone is within 3,000 miles ahead of `currentMileage` OR the milestone
 * has already been passed (overdue).
 *
 * Tasks are deduplicated against `completedTasks` — a set of task names that
 * the mechanic has already performed on this vehicle on past PAID WorkOrders.
 *
 * @param currentMileage   - Current odometer reading.
 * @param maintenanceMatrix - The validated maintenance schedule from GlobalVehicles.
 * @param completedTasks   - (optional) Task names already performed; these are filtered out.
 */
export function getDueServices(
  currentMileage: number,
  maintenanceMatrix: MaintenanceSchedule,
  completedTasks: string[] = [],
): DueService[] {
  if (currentMileage < 0 || !Number.isFinite(currentMileage)) return [];
  if (!maintenanceMatrix || maintenanceMatrix.length === 0) return [];

  const completedSet = new Set(
    completedTasks.map((t) => t.trim().toLowerCase()),
  );

  const due: DueService[] = [];

  for (const interval of maintenanceMatrix) {
    // Find the next upcoming occurrence of this mileage milestone.
    // E.g. if currentMileage=47 000 and interval.mileage=30 000,
    // the next due milestone is 60 000.
    const nextMilestone = nextOccurrence(currentMileage, interval.mileage);
    const milesUntilDue = nextMilestone - currentMileage;
    const isOverdue = milesUntilDue <= 0;

    // Include tasks that are overdue or within the look-ahead window.
    if (milesUntilDue <= LOOK_AHEAD_MILES) {
      for (const task of interval.tasks) {
        if (completedSet.has(task.trim().toLowerCase())) continue;
        due.push({
          mileage: nextMilestone,
          task,
          milesUntilDue,
          isOverdue,
        });
      }
    }
  }

  // Sort: overdue first, then by ascending milesUntilDue.
  due.sort((a, b) => a.milesUntilDue - b.milesUntilDue);

  return due;
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Given the current odometer and a recurring mileage interval, returns the
 * next milestone at or above the current reading.
 *
 * Examples:
 *   nextOccurrence(47 000, 30 000) → 60 000
 *   nextOccurrence(30 000, 30 000) → 30 000  (exactly on the milestone)
 *   nextOccurrence(1 000,  5 000)  →  5 000
 */
function nextOccurrence(currentMileage: number, intervalMileage: number): number {
  if (intervalMileage <= 0) return 0;
  return Math.ceil(currentMileage / intervalMileage) * intervalMileage;
}

// ---------------------------------------------------------------------------
// formatMilesUntilDue — display helper for UI
// ---------------------------------------------------------------------------

/**
 * Returns a human-readable label for how far away a due service is.
 *
 * Examples:
 *   formatMilesUntilDue(0)    → "Due Now"
 *   formatMilesUntilDue(-500) → "Overdue by 500 mi"
 *   formatMilesUntilDue(2500) → "Due in 2,500 mi"
 */
export function formatMilesUntilDue(milesUntilDue: number): string {
  if (milesUntilDue === 0) return "Due Now";
  if (milesUntilDue < 0) {
    return `Overdue by ${Math.abs(milesUntilDue).toLocaleString()} mi`;
  }
  return `Due in ${milesUntilDue.toLocaleString()} mi`;
}
