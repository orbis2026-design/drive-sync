/**
 * mock-supplier-catalogue.ts — Dev/test fixture for the supplier-api module.
 *
 * This file is NEVER imported in production. It is dynamically loaded only
 * when `NODE_ENV !== 'production'` and real supplier credentials are absent.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Zod schema (used at runtime to validate the fixture before use)
// ---------------------------------------------------------------------------

export const MockEntrySchema = z.object({
  partNumber: z.string(),
  name: z.string(),
  brand: z.string(),
  wholesalePriceCents: z.number(),
  etaMinutes: z.number(),
  warehouseQty: z.number(),
  category: z.string(),
  subcategory: z.string(),
  source: z.enum(["AutoZone", "Worldpac"]),
});

export const MockCatalogueSchema = z.array(MockEntrySchema);

export type MockEntry = z.infer<typeof MockEntrySchema>;

// ---------------------------------------------------------------------------
// Catalogue data
// ---------------------------------------------------------------------------

export const MOCK_CATALOGUE: MockEntry[] = [
  // Brakes — Rotors
  {
    partNumber: "NP-BR-OEM-FRONT-1",
    name: "Front Brake Rotor — OEM",
    brand: "DuraStop",
    category: "Brakes",
    subcategory: "Rotors",
    wholesalePriceCents: 6200,
    etaMinutes: 45,
    warehouseQty: 8,
    source: "AutoZone",
  },
  {
    partNumber: "NP-BR-CER-FRONT-1",
    name: "Front Brake Rotor — Drilled & Slotted",
    brand: "PowerStop",
    category: "Brakes",
    subcategory: "Rotors",
    wholesalePriceCents: 9800,
    etaMinutes: 90,
    warehouseQty: 3,
    source: "Worldpac",
  },
  // Brakes — Pads
  {
    partNumber: "NP-BP-CER-FRONT-1",
    name: "Front Brake Pads — Ceramic",
    brand: "Akebono",
    category: "Brakes",
    subcategory: "Pads — Ceramic",
    wholesalePriceCents: 5400,
    etaMinutes: 45,
    warehouseQty: 12,
    source: "AutoZone",
  },
  {
    partNumber: "NP-BP-SEM-FRONT-1",
    name: "Front Brake Pads — Semi-Metallic",
    brand: "Wagner",
    category: "Brakes",
    subcategory: "Pads — Semi-Metallic",
    wholesalePriceCents: 3800,
    etaMinutes: 30,
    warehouseQty: 20,
    source: "AutoZone",
  },
  // Engine — Filters
  {
    partNumber: "NP-EF-OIL-1",
    name: "Oil Filter",
    brand: "Mobil 1",
    category: "Engine",
    subcategory: "Filters",
    wholesalePriceCents: 1100,
    etaMinutes: 25,
    warehouseQty: 50,
    source: "AutoZone",
  },
  {
    partNumber: "NP-EF-AIR-1",
    name: "Engine Air Filter",
    brand: "K&N",
    category: "Engine",
    subcategory: "Filters",
    wholesalePriceCents: 2400,
    etaMinutes: 25,
    warehouseQty: 18,
    source: "AutoZone",
  },
  // Engine — Ignition
  {
    partNumber: "NP-IG-SP-1",
    name: "Iridium Spark Plugs (Set of 4)",
    brand: "NGK",
    category: "Engine",
    subcategory: "Ignition",
    wholesalePriceCents: 4800,
    etaMinutes: 30,
    warehouseQty: 10,
    source: "Worldpac",
  },
  {
    partNumber: "NP-IG-COIL-1",
    name: "Ignition Coil Pack",
    brand: "Delphi",
    category: "Engine",
    subcategory: "Ignition",
    wholesalePriceCents: 8900,
    etaMinutes: 60,
    warehouseQty: 5,
    source: "Worldpac",
  },
  // Suspension — Shocks
  {
    partNumber: "NP-SU-SH-FRONT-1",
    name: "Front Shock Absorber",
    brand: "KYB",
    category: "Suspension",
    subcategory: "Shocks & Struts",
    wholesalePriceCents: 7200,
    etaMinutes: 180,
    warehouseQty: 4,
    source: "Worldpac",
  },
  // Steering — Tie Rods
  {
    partNumber: "NP-ST-TR-OUTER-1",
    name: "Outer Tie Rod End",
    brand: "Moog",
    category: "Steering",
    subcategory: "Tie Rods",
    wholesalePriceCents: 3400,
    etaMinutes: 45,
    warehouseQty: 7,
    source: "AutoZone",
  },
  // Electrical — Sensors
  {
    partNumber: "NP-EL-O2-UP-1",
    name: "Upstream Oxygen Sensor",
    brand: "Bosch",
    category: "Electrical",
    subcategory: "Sensors",
    wholesalePriceCents: 6100,
    etaMinutes: 60,
    warehouseQty: 6,
    source: "Worldpac",
  },
  {
    partNumber: "NP-EL-MAF-1",
    name: "Mass Airflow Sensor",
    brand: "Standard Motor",
    category: "Electrical",
    subcategory: "Sensors",
    wholesalePriceCents: 9200,
    etaMinutes: 240,
    warehouseQty: 3,
    source: "Worldpac",
  },
  // Cooling
  {
    partNumber: "NP-CL-WP-1",
    name: "Water Pump",
    brand: "GMB",
    category: "Cooling",
    subcategory: "Water Pumps",
    wholesalePriceCents: 8400,
    etaMinutes: 90,
    warehouseQty: 5,
    source: "Worldpac",
  },
  {
    partNumber: "NP-CL-TH-1",
    name: "Thermostat & Housing Assembly",
    brand: "Stant",
    category: "Cooling",
    subcategory: "Thermostats",
    wholesalePriceCents: 3200,
    etaMinutes: 45,
    warehouseQty: 9,
    source: "AutoZone",
  },
];
