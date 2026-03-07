/**
 * maintenance.ts — Zod schema for the Phase 14/15 maintenance matrix.
 *
 * The canonical shape stored in `GlobalVehicles.maintenance_schedule_json`
 * is a strictly-typed array of interval objects, each pairing a fixed
 * odometer milestone with the tasks due at that milestone.
 *
 * Example:
 *   [
 *     { mileage: 5000,  tasks: ["Replace Engine Oil", "Rotate Tires"] },
 *     { mileage: 30000, tasks: ["Replace Engine Air Filter", "Flush Brake Fluid"] },
 *   ]
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// MaintenanceIntervalSchema — one row in the matrix
// ---------------------------------------------------------------------------

export const MaintenanceIntervalSchema = z.object({
  /** Fixed odometer milestone, e.g. 5000, 30000, 60000. */
  mileage: z
    .number()
    .int()
    .positive("Mileage must be a positive integer.")
    .max(200_000, "Mileage must be ≤ 200,000."),

  /** Human-readable task names due at this interval. */
  tasks: z
    .array(z.string().min(1).max(200))
    .min(1, "Each interval must list at least one task."),
});

export type MaintenanceInterval = z.infer<typeof MaintenanceIntervalSchema>;

// ---------------------------------------------------------------------------
// MaintenanceScheduleSchema — the full array persisted in the DB
// ---------------------------------------------------------------------------

export const MaintenanceScheduleSchema = z
  .array(MaintenanceIntervalSchema)
  .min(1, "Maintenance schedule must contain at least one interval.");

export type MaintenanceSchedule = z.infer<typeof MaintenanceScheduleSchema>;
