/**
 * mock-parts-bridge-catalogue.ts — Dev/test fixture for the parts-bridge adapter.
 *
 * This file is NEVER imported in production. It is dynamically loaded only
 * when `NODE_ENV !== 'production'` and real supplier credentials are absent.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Zod schema (used at runtime to validate the fixture before use)
// ---------------------------------------------------------------------------

export const MockPartSchema = z.object({
  partNumber: z.string(),
  name: z.string(),
  brand: z.string(),
  wholesaleCostCents: z.number(),
  etaMinutes: z.number(),
  availabilityCount: z.number(),
  supplier: z.enum(["O'Reilly", "AutoZone"]),
  keywords: z.array(z.string()),
  fitment: z.object({
    yearStart: z.number(),
    yearEnd: z.number(),
    makes: z.array(z.string()),
    models: z.array(z.string()),
  }),
});

export const MockPartsCatalogueSchema = z.array(MockPartSchema);

export type MockPart = z.infer<typeof MockPartSchema>;

// ---------------------------------------------------------------------------
// Catalogue data
// ---------------------------------------------------------------------------

export const MOCK_PARTS: MockPart[] = [
  // Brake Pads
  {
    partNumber: "PB-BP-CER-F-1",
    name: "Front Brake Pads — Ceramic",
    brand: "Akebono",
    wholesaleCostCents: 5400,
    etaMinutes: 45,
    availabilityCount: 14,
    supplier: "O'Reilly",
    keywords: ["brake", "pad", "pads", "ceramic", "front"],
    fitment: {
      yearStart: 2010,
      yearEnd: 2026,
      makes: ["Honda", "Toyota", "Nissan", "Hyundai", "Kia"],
      models: [],
    },
  },
  {
    partNumber: "PB-BP-SEM-F-1",
    name: "Front Brake Pads — Semi-Metallic",
    brand: "Wagner",
    wholesaleCostCents: 3800,
    etaMinutes: 30,
    availabilityCount: 22,
    supplier: "AutoZone",
    keywords: ["brake", "pad", "pads", "semi-metallic", "metallic", "front"],
    fitment: {
      yearStart: 2005,
      yearEnd: 2026,
      makes: ["Ford", "Chevrolet", "GMC", "Dodge", "Ram"],
      models: [],
    },
  },
  {
    partNumber: "PB-BP-CER-R-1",
    name: "Rear Brake Pads — Ceramic",
    brand: "Akebono",
    wholesaleCostCents: 4900,
    etaMinutes: 45,
    availabilityCount: 10,
    supplier: "O'Reilly",
    keywords: ["brake", "pad", "pads", "ceramic", "rear"],
    fitment: {
      yearStart: 2010,
      yearEnd: 2026,
      makes: ["Honda", "Toyota", "Nissan", "Hyundai", "Kia"],
      models: [],
    },
  },
  // Rotors
  {
    partNumber: "PB-BR-OEM-F-1",
    name: "Front Brake Rotor — OEM Replacement",
    brand: "DuraStop",
    wholesaleCostCents: 6200,
    etaMinutes: 45,
    availabilityCount: 8,
    supplier: "O'Reilly",
    keywords: ["rotor", "rotors", "disc", "discs", "brake", "front"],
    fitment: {
      yearStart: 2005,
      yearEnd: 2026,
      makes: ["Honda", "Toyota", "Ford", "Chevrolet", "Nissan"],
      models: [],
    },
  },
  {
    partNumber: "PB-BR-DS-F-1",
    name: "Front Brake Rotor — Drilled & Slotted",
    brand: "PowerStop",
    wholesaleCostCents: 9800,
    etaMinutes: 90,
    availabilityCount: 4,
    supplier: "AutoZone",
    keywords: ["rotor", "rotors", "drilled", "slotted", "sport", "front"],
    fitment: {
      yearStart: 2010,
      yearEnd: 2026,
      makes: ["Ford", "Chevrolet", "Subaru", "Jeep"],
      models: [],
    },
  },
  {
    partNumber: "PB-BR-OEM-R-1",
    name: "Rear Brake Rotor — OEM Replacement",
    brand: "DuraStop",
    wholesaleCostCents: 5800,
    etaMinutes: 45,
    availabilityCount: 6,
    supplier: "O'Reilly",
    keywords: ["rotor", "rotors", "disc", "discs", "brake", "rear"],
    fitment: {
      yearStart: 2005,
      yearEnd: 2026,
      makes: ["Honda", "Toyota", "Ford", "Chevrolet", "Nissan"],
      models: [],
    },
  },
  // Filters
  {
    partNumber: "PB-EF-OIL-1",
    name: "Oil Filter — Extended Life",
    brand: "Mobil 1",
    wholesaleCostCents: 1100,
    etaMinutes: 20,
    availabilityCount: 60,
    supplier: "AutoZone",
    keywords: ["oil", "filter", "filters"],
    fitment: {
      yearStart: 1995,
      yearEnd: 2026,
      makes: ["Honda", "Toyota", "Ford", "Chevrolet", "Nissan", "BMW", "Audi"],
      models: [],
    },
  },
  {
    partNumber: "PB-EF-AIR-1",
    name: "Engine Air Filter",
    brand: "K&N",
    wholesaleCostCents: 2400,
    etaMinutes: 20,
    availabilityCount: 25,
    supplier: "O'Reilly",
    keywords: ["air", "filter", "filters", "engine", "airfilter"],
    fitment: {
      yearStart: 1995,
      yearEnd: 2026,
      makes: ["Honda", "Toyota", "Ford", "Chevrolet", "Nissan", "BMW", "Audi"],
      models: [],
    },
  },
  {
    partNumber: "PB-CF-CAB-1",
    name: "Cabin Air Filter — HEPA",
    brand: "Bosch",
    wholesaleCostCents: 1800,
    etaMinutes: 20,
    availabilityCount: 30,
    supplier: "O'Reilly",
    keywords: ["cabin", "air", "filter", "filters", "hepa", "pollen"],
    fitment: {
      yearStart: 2000,
      yearEnd: 2026,
      makes: ["Honda", "Toyota", "Ford", "Chevrolet", "Nissan", "BMW"],
      models: [],
    },
  },
];
