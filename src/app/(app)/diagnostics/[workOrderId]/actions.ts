"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { verifySession } from "@/lib/auth";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TSB {
  id: string;
  bulletinNumber: string;
  title: string;
  obdCode: string;
  affectedVehicles: string;
  /** Match confidence as a whole-number percentage (0–100). */
  confidence: number;
  summary: string;
  repairSteps: string[];
  estimatedLaborHours: number;
  /** Estimated labour cost in US cents. */
  estimatedLaborCostCents: number;
  /** Estimated parts cost in US cents. */
  estimatedPartsCostCents: number;
}

/** Shared return type for write Server Actions. */
export interface ActionResult {
  error?: string;
}

// ---------------------------------------------------------------------------
// TSB simulation data
// ---------------------------------------------------------------------------
// Keyed first by exact OBD-II code, then by 2-character prefix (category).
// In production this would call the NHTSA TSB API or a third-party data
// provider such as ALLDATA or Mitchell1.
// ---------------------------------------------------------------------------

interface TsbTemplate {
  title: string;
  summary: string;
  repairSteps: string[];
  estimatedLaborHours: number;
  estimatedLaborCostCents: number;
  estimatedPartsCostCents: number;
}

const TSB_BY_CODE: Record<string, TsbTemplate[]> = {
  P0300: [
    {
      title: "Engine Misfire — Carbon Deposit Service Required",
      summary:
        "Random misfire codes (P0300) on direct-injected engines are commonly caused by carbon build-up on intake valves. GDI engines do not wash valves with fuel, accelerating deposits over time.",
      repairSteps: [
        "Confirm misfire via live data — monitor Engine Load, RPM, and per-cylinder Misfire Counters.",
        "Perform intake decarbonisation using walnut blasting or an approved solvent service procedure.",
        "Inspect spark plugs; replace if gap exceeds 0.5 mm over spec or if fouling is present.",
        "Inspect ignition coils; swap the suspect coil to an adjacent cylinder to confirm a follow-the-coil pattern.",
        "Road-test: verify no misfire counters increase above threshold over 500 fuel-cut events.",
      ],
      estimatedLaborHours: 3.5,
      estimatedLaborCostCents: 38500,
      estimatedPartsCostCents: 15800,
    },
    {
      title: "Ignition Coil-on-Plug Replacement — Multiple Cylinders",
      summary:
        "Widespread coil failures have been documented on several 4-cylinder platforms. TSB recommends replacing all coils when one fails to prevent repeat shop visits.",
      repairSteps: [
        "Retrieve misfire freeze-frame data; note ambient temperature and engine load at time of fault.",
        "Perform a cylinder contribution test using a bi-directional scan tool.",
        "Replace all ignition coil-on-plug units with updated OEM part numbers.",
        "Clear codes and monitor misfire counters for two complete drive cycles.",
      ],
      estimatedLaborHours: 1.5,
      estimatedLaborCostCents: 16500,
      estimatedPartsCostCents: 24000,
    },
  ],
  P0171: [
    {
      title: "System Too Lean (Bank 1) — MAF Sensor & Intake Boot Inspection",
      summary:
        "P0171 commonly results from a torn intake boot admitting unmetered air downstream of the MAF sensor, a dirty or failing MAF, or a vacuum leak on Bank 1 runners.",
      repairSteps: [
        "Smoke-test the intake system from the throttle body to the MAF; look for smoke escaping at boot clamps or cracked hoses.",
        "Inspect and clean the MAF sensor element with approved MAF cleaner spray.",
        "Check the PCV hose and valve for cracking or blockage.",
        "Inspect fuel pressure at idle and under load (spec ±2 psi).",
        "If the lean condition persists, perform an injector flow test on Bank 1.",
      ],
      estimatedLaborHours: 2.0,
      estimatedLaborCostCents: 22000,
      estimatedPartsCostCents: 8500,
    },
  ],
  P0420: [
    {
      title: "Catalyst System Efficiency Below Threshold — Bank 1",
      summary:
        "P0420 indicates the downstream O2 sensor is oscillating similarly to the upstream sensor, suggesting catalytic converter deterioration. Rule out coolant or oil consumption first.",
      repairSteps: [
        "Inspect for oil consumption; check the PCV system, valve stem seals, and turbo seals if applicable.",
        "Check for coolant in exhaust (white smoke, sweet smell) indicating a possible head gasket issue.",
        "Compare upstream vs. downstream O2 sensor waveforms on an oscilloscope — a healthy catalyst shows a flat downstream trace.",
        "If the converter is confirmed degraded, replace with an OEM-equivalent catalyst.",
        "Update ECM calibration if a revised ROM is available for this VIN.",
      ],
      estimatedLaborHours: 2.5,
      estimatedLaborCostCents: 27500,
      estimatedPartsCostCents: 82000,
    },
  ],
  P0442: [
    {
      title: "EVAP System Small Leak — Fuel Cap & Purge Valve Inspection",
      summary:
        "Small EVAP leaks (P0442) are most commonly traced to a loose or defective fuel filler cap, a degraded purge valve diaphragm, or a cracked charcoal canister.",
      repairSteps: [
        "Verify the fuel cap seals properly; replace if the cap fails a torque-and-release check.",
        "Use an EVAP smoke machine to pressurise the EVAP system; locate and mark all leak points.",
        "Inspect the purge solenoid valve for a stuck-open condition using a scan tool actuation test.",
        "Inspect the charcoal canister for cracks and saturated media (fuel odour).",
        "Rerun the EVAP monitor to confirm repair.",
      ],
      estimatedLaborHours: 1.5,
      estimatedLaborCostCents: 16500,
      estimatedPartsCostCents: 4800,
    },
  ],
  P0128: [
    {
      title: "Coolant Temperature Below Thermostat Regulating Temperature",
      summary:
        "P0128 almost always indicates a failing thermostat that opens prematurely, preventing the engine from reaching target operating temperature. Aftermarket thermostats are a frequent contributor.",
      repairSteps: [
        "Verify ECT sensor reading matches an IR gun measurement at the thermostat housing — rule out a bad sensor first.",
        "Monitor coolant temperature with a scan tool on a 20-minute highway drive; if temp plateaus below 185 °F, the thermostat is suspect.",
        "Replace the thermostat with an OEM unit (avoid cheap aftermarket parts that fail early).",
        "Flush and refill coolant if the old thermostat has been stuck open for an extended period.",
      ],
      estimatedLaborHours: 1.0,
      estimatedLaborCostCents: 11000,
      estimatedPartsCostCents: 3500,
    },
  ],
};

const TSB_BY_PREFIX: Record<string, TsbTemplate[]> = {
  P0: [
    {
      title: "Generic Powertrain Fault — Comprehensive Diagnostic Required",
      summary:
        "This powertrain code requires a full system scan with live-data analysis to identify the root cause. Inspect related sensors, wiring harnesses, and actuators.",
      repairSteps: [
        "Retrieve all stored and pending DTCs with a bi-directional scan tool.",
        "Document freeze-frame data (RPM, load, coolant temp, fuel trim).",
        "Inspect the wiring harness and connectors relevant to the flagged circuit.",
        "Perform component tests as directed by the OEM diagnostic flow chart.",
        "Road-test and confirm repair with two completed drive cycles.",
      ],
      estimatedLaborHours: 2.0,
      estimatedLaborCostCents: 22000,
      estimatedPartsCostCents: 0,
    },
  ],
  P1: [
    {
      title: "Manufacturer-Specific Powertrain Code — OEM Bulletin Required",
      summary:
        "P1xxx codes are manufacturer-specific. Consult the OEM service portal for this vehicle's make and year for the applicable TSB and repair procedure.",
      repairSteps: [
        "Cross-reference the code with OEM ALLDATA or Mitchell1 service information.",
        "Retrieve the TSB list from the OEM portal for the specific make, model, and year.",
        "Follow the OEM diagnostic tree step-by-step; do not skip flow-chart branches.",
        "Check for applicable software or calibration updates that address the symptom.",
      ],
      estimatedLaborHours: 2.5,
      estimatedLaborCostCents: 27500,
      estimatedPartsCostCents: 0,
    },
  ],
  B0: [
    {
      title: "Generic Body Electronics Fault",
      summary:
        "Body fault codes typically relate to exterior lighting, power windows, mirrors, or door modules. Check for blown fuses and corrosion in body harness connectors.",
      repairSteps: [
        "Pull fuse panel data for the affected circuit.",
        "Inspect body harness connectors for corrosion, especially at door and trunk hinge areas.",
        "Perform a module self-test with the scan tool.",
        "Verify ground straps at B+ and chassis ground points.",
      ],
      estimatedLaborHours: 1.5,
      estimatedLaborCostCents: 16500,
      estimatedPartsCostCents: 0,
    },
  ],
  C0: [
    {
      title: "Chassis / ABS-Brake System Fault",
      summary:
        "Chassis codes (C0xxx) often relate to ABS, stability control, or suspension. Wheel speed sensor failures and low brake fluid are the most frequent causes.",
      repairSteps: [
        "Inspect all four wheel speed sensors for damage, debris, or contamination.",
        "Check the ABS module ground and power supply.",
        "Verify brake fluid level and condition (dark fluid or older than 3 years).",
        "If stability control codes are also present, inspect the yaw rate and steering angle sensors.",
      ],
      estimatedLaborHours: 2.0,
      estimatedLaborCostCents: 22000,
      estimatedPartsCostCents: 12000,
    },
  ],
  U0: [
    {
      title: "Network Communication Fault — CAN Bus Inspection",
      summary:
        "U0xxx codes indicate communication loss on the CAN bus. The root cause is often a faulty module pulling bus voltage low, a broken CAN wire, or corrosion at a junction connector.",
      repairSteps: [
        "Identify which module is losing communication from the DTC description.",
        "Measure CAN Hi/Lo resistance at the OBD-II port (pins 6 and 14): should read ~60 Ω with ignition off.",
        "Inspect the wiring harness routing for chafing against body sheet metal.",
        "Check module power and ground before condemning the module itself.",
      ],
      estimatedLaborHours: 3.0,
      estimatedLaborCostCents: 33000,
      estimatedPartsCostCents: 0,
    },
  ],
};

// ---------------------------------------------------------------------------
// simulateTSBLookup — deterministic simulation of a TSB database query
// ---------------------------------------------------------------------------

function simulateTSBLookup(
  obdCode: string,
  make: string,
  model: string,
  year: number,
): TSB[] {
  const code = obdCode.toUpperCase().trim();
  const prefix2 = code.slice(0, 2); // e.g. "P0"

  const templates =
    TSB_BY_CODE[code] ??
    TSB_BY_PREFIX[prefix2] ??
    TSB_BY_PREFIX["P0"]; // ultimate generic fallback

  // Small make-based confidence modifier to feel realistic
  const makeBonus = ["Honda", "Toyota", "Ford", "Chevrolet"].includes(make)
    ? 3
    : 0;

  return templates.map((tpl, idx) => {
    // Exact code matches start at 94%; prefix fallbacks start at 71%
    const isExactMatch = Boolean(TSB_BY_CODE[code]);
    const baseConfidence = isExactMatch ? 94 - idx * 12 : 71 - idx * 15;
    const confidence = Math.max(45, Math.min(99, baseConfidence + makeBonus));

    return {
      id: `${code}-${idx}`,
      bulletinNumber: `TSB-${String(year).slice(-2)}-${code}-${String(idx + 1).padStart(3, "0")}`,
      title: tpl.title,
      obdCode: code,
      affectedVehicles: `${year} ${make} ${model}`,
      confidence,
      summary: tpl.summary,
      repairSteps: tpl.repairSteps,
      estimatedLaborHours: tpl.estimatedLaborHours,
      estimatedLaborCostCents: tpl.estimatedLaborCostCents,
      estimatedPartsCostCents: tpl.estimatedPartsCostCents,
    };
  });
}

// ---------------------------------------------------------------------------
// Server Action — lookupTSBs
// ---------------------------------------------------------------------------

/**
 * Looks up Technical Service Bulletins (TSBs) for the given OBD-II code.
 * The work order's vehicle Make/Model/Year is fetched from the database and
 * used to personalise confidence scores and affected-vehicle labelling.
 */
export async function lookupTSBs(
  workOrderId: string,
  obdCode: string,
): Promise<{ tsbs: TSB[] } | { error: string }> {
  if (!workOrderId) {
    return { error: "Missing work order ID." };
  }

  const { tenantId } = await verifySession();

  const code = obdCode.trim().toUpperCase();
  if (!/^[PBCU][0-3][0-9]{3}$/.test(code)) {
    return {
      error:
        "Invalid OBD-II code. Expected format: P0300, B0100, C0265, U0100.",
    };
  }

  // Fetch vehicle context — fall back to generic labels if DB is unavailable.
  let make = "Unknown";
  let model = "Unknown";
  let year = new Date().getFullYear();

  try {
    const workOrder = await prisma.workOrder.findFirst({
      where: { id: workOrderId, tenantId },
      include: { vehicle: { select: { make: true, model: true, year: true } } },
    });

    if (workOrder?.vehicle) {
      make = workOrder.vehicle.make;
      model = workOrder.vehicle.model;
      year = workOrder.vehicle.year;
    }
  } catch {
    // Database unavailable in demo — continue with generic vehicle context.
  }

  const tsbs = simulateTSBLookup(code, make, model, year);
  return { tsbs };
}

// ---------------------------------------------------------------------------
// Server Action — addToQuote
// ---------------------------------------------------------------------------

/**
 * Appends the TSB's estimated repair costs to the WorkOrder's labour and
 * parts totals, and logs the TSB reference in the notes field.
 */
export async function addToQuote(
  workOrderId: string,
  tsb: TSB,
): Promise<ActionResult> {
  if (!workOrderId) {
    return { error: "Missing work order ID." };
  }

  const { tenantId } = await verifySession();

  try {
    const existing = await prisma.workOrder.findFirst({
      where: { id: workOrderId, tenantId },
      select: { laborCents: true, partsCents: true, notes: true },
    });

    if (!existing) {
      return { error: "Work order not found." };
    }

    const tsbNote = `[${tsb.bulletinNumber}] ${tsb.title} — Est. ${tsb.estimatedLaborHours}h labour`;
    const updatedNotes = existing.notes
      ? `${existing.notes}\n${tsbNote}`
      : tsbNote;

    await prisma.workOrder.updateMany({
      where: { id: workOrderId, tenantId },
      data: {
        laborCents: existing.laborCents + tsb.estimatedLaborCostCents,
        partsCents: existing.partsCents + tsb.estimatedPartsCostCents,
        notes: updatedNotes,
      },
    });

    revalidatePath("/jobs");
    return {};
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { error: `Failed to update quote: ${message}` };
  }
}
