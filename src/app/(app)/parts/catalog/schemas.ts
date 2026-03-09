import { z } from "zod";

// ---------------------------------------------------------------------------
// Zod schema — validates the Nexpart vehicle search fields (Issue #107)
// ---------------------------------------------------------------------------

export const NexpartVehicleSchema = z.object({
  year: z
    .number()
    .int()
    .min(1980, "Year must be 1980 or later.")
    .max(new Date().getFullYear() + 1, "Year is out of range."),
  make: z
    .string()
    .min(1, "Make is required.")
    .max(64),
  model: z
    .string()
    .min(1, "Model is required.")
    .max(64),
  vin: z
    .string()
    .max(17, "VIN must be 17 characters or fewer.")
    .refine((v) => !v || v.trim() === "" || v.trim().length === 17, {
      message: "VIN must be exactly 17 characters.",
    })
    .optional()
    .transform((v) => (v?.trim() === "" ? undefined : v?.trim())),
});

export type NexpartVehicleInput = z.infer<typeof NexpartVehicleSchema>;

// ---------------------------------------------------------------------------
// ActiveWorkOrderSummary — returned by fetchActiveWorkOrders (Issue #108)
// ---------------------------------------------------------------------------

export type ActiveWorkOrderSummary = {
  id: string;
  title: string;
  status: string;
  vehicle: {
    year: number;
    make: string;
    model: string;
    vin: string | null;
  };
};
