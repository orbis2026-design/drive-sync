/**
 * parts-catalog.ts — Mock parts catalog lookup utility
 *
 * Simulates queries to an automotive parts catalog (e.g. Epicor, AutoZone B2B)
 * to retrieve compatible OEM and aftermarket part numbers for a given vehicle.
 *
 * In production, replace the mock functions with real API calls to the
 * preferred catalog provider.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PartOption {
  /** OEM or aftermarket brand name, e.g. "FRAM Extra Guard" */
  brand: string;
  /** Catalog part number, e.g. "PH7317" */
  partNumber: string;
  /** Whether this is the OEM spec part */
  isOem: boolean;
  /** Retail price estimate in US cents */
  retailPriceCents: number;
}

export interface WiperSizes {
  driver: string;   // e.g. "26\""
  passenger: string; // e.g. "18\""
}

export interface QuickSpecsResult {
  oilFilter: PartOption[];
  airFilter: PartOption[];
  cabinAirFilter: PartOption[];
  wiperBlades: {
    sizes: WiperSizes;
    options: PartOption[];
  };
}

export interface QuickSpecsInput {
  year: number;
  make: string;
  model: string;
  engine?: string | null;
  trim?: string | null;
}

export interface QuickSpecsKitItem {
  category: string;
  brand: string;
  partNumber: string;
  retailPriceCents: number;
  quantity: number;
}

// ---------------------------------------------------------------------------
// Mock catalog data
// ---------------------------------------------------------------------------

// Oil filter cross-reference by make
const OIL_FILTER_CATALOG: Record<string, PartOption[]> = {
  Honda: [
    { brand: "Honda OEM",          partNumber: "15400-PLM-A02", isOem: true,  retailPriceCents: 899  },
    { brand: "FRAM Extra Guard",   partNumber: "PH7317",        isOem: false, retailPriceCents: 649  },
    { brand: "STP Extended Life",  partNumber: "S10060XL",      isOem: false, retailPriceCents: 749  },
    { brand: "Mobil 1 Extended",   partNumber: "M1-110A",       isOem: false, retailPriceCents: 1299 },
  ],
  Toyota: [
    { brand: "Toyota OEM",         partNumber: "90915-YZZD3",   isOem: true,  retailPriceCents: 999  },
    { brand: "FRAM Extra Guard",   partNumber: "PH4967",        isOem: false, retailPriceCents: 649  },
    { brand: "STP Extended Life",  partNumber: "S4967XL",       isOem: false, retailPriceCents: 799  },
    { brand: "Mobil 1 Extended",   partNumber: "M1-113",        isOem: false, retailPriceCents: 1299 },
  ],
  Ford: [
    { brand: "Ford OEM",           partNumber: "FL820S",        isOem: true,  retailPriceCents: 1099 },
    { brand: "FRAM Extra Guard",   partNumber: "PH3600",        isOem: false, retailPriceCents: 699  },
    { brand: "STP Extended Life",  partNumber: "S3600XL",       isOem: false, retailPriceCents: 849  },
    { brand: "Motorcraft",         partNumber: "FL-820-S",      isOem: true,  retailPriceCents: 1049 },
  ],
  Chevrolet: [
    { brand: "ACDelco OEM",        partNumber: "PF2232G",       isOem: true,  retailPriceCents: 999  },
    { brand: "FRAM Extra Guard",   partNumber: "PH3614",        isOem: false, retailPriceCents: 649  },
    { brand: "STP Extended Life",  partNumber: "S3614XL",       isOem: false, retailPriceCents: 799  },
  ],
  default: [
    { brand: "FRAM Extra Guard",   partNumber: "PH3593A",       isOem: false, retailPriceCents: 649  },
    { brand: "STP Extended Life",  partNumber: "S3593XL",       isOem: false, retailPriceCents: 799  },
  ],
};

// Engine air filter cross-reference by make
const AIR_FILTER_CATALOG: Record<string, PartOption[]> = {
  Honda: [
    { brand: "Honda OEM",          partNumber: "17220-5BA-A00", isOem: true,  retailPriceCents: 2499 },
    { brand: "FRAM Extra Guard",   partNumber: "CA11498",       isOem: false, retailPriceCents: 1599 },
    { brand: "K&N High-Flow",      partNumber: "33-2435",       isOem: false, retailPriceCents: 5499 },
  ],
  Toyota: [
    { brand: "Toyota OEM",         partNumber: "17801-0P010",   isOem: true,  retailPriceCents: 2699 },
    { brand: "FRAM Extra Guard",   partNumber: "CA9550",        isOem: false, retailPriceCents: 1699 },
    { brand: "K&N High-Flow",      partNumber: "33-2304",       isOem: false, retailPriceCents: 5499 },
  ],
  Ford: [
    { brand: "Motorcraft OEM",     partNumber: "FA-1883",       isOem: true,  retailPriceCents: 2899 },
    { brand: "FRAM Extra Guard",   partNumber: "CA9765",        isOem: false, retailPriceCents: 1799 },
    { brand: "K&N High-Flow",      partNumber: "33-2399",       isOem: false, retailPriceCents: 5499 },
  ],
  default: [
    { brand: "FRAM Extra Guard",   partNumber: "CA7317",        isOem: false, retailPriceCents: 1599 },
    { brand: "K&N High-Flow",      partNumber: "33-2171",       isOem: false, retailPriceCents: 4999 },
  ],
};

// Cabin air filter cross-reference by make
const CABIN_FILTER_CATALOG: Record<string, PartOption[]> = {
  Honda: [
    { brand: "Honda OEM",          partNumber: "80292-TF0-G01", isOem: true,  retailPriceCents: 3299 },
    { brand: "FRAM Fresh Breeze",  partNumber: "CF11812",       isOem: false, retailPriceCents: 1999 },
    { brand: "Bosch HEPA",         partNumber: "6047C",         isOem: false, retailPriceCents: 3499 },
  ],
  Toyota: [
    { brand: "Toyota OEM",         partNumber: "87139-0E040",   isOem: true,  retailPriceCents: 3999 },
    { brand: "FRAM Fresh Breeze",  partNumber: "CF10285",       isOem: false, retailPriceCents: 2299 },
    { brand: "Bosch HEPA",         partNumber: "6010C",         isOem: false, retailPriceCents: 3499 },
  ],
  Ford: [
    { brand: "Motorcraft OEM",     partNumber: "FP-80",         isOem: true,  retailPriceCents: 3699 },
    { brand: "FRAM Fresh Breeze",  partNumber: "CF10575",       isOem: false, retailPriceCents: 2199 },
    { brand: "Bosch HEPA",         partNumber: "6027C",         isOem: false, retailPriceCents: 3499 },
  ],
  default: [
    { brand: "FRAM Fresh Breeze",  partNumber: "CF11665",       isOem: false, retailPriceCents: 1999 },
    { brand: "Bosch HEPA",         partNumber: "6022C",         isOem: false, retailPriceCents: 3499 },
  ],
};

// Wiper blade sizes by make/model
const WIPER_SIZES: Record<string, WiperSizes> = {
  "Honda:Civic":           { driver: '26"', passenger: '18"' },
  "Honda:Accord":          { driver: '26"', passenger: '19"' },
  "Toyota:Camry":          { driver: '26"', passenger: '18"' },
  "Toyota:Corolla":        { driver: '26"', passenger: '16"' },
  "Ford:F-150":            { driver: '22"', passenger: '22"' },
  "Ford:Mustang":          { driver: '20"', passenger: '20"' },
  "Chevrolet:Silverado 1500": { driver: '22"', passenger: '22"' },
  "Chevrolet:Malibu":      { driver: '26"', passenger: '17"' },
  "Nissan:Altima":         { driver: '26"', passenger: '16"' },
  "Volkswagen:Jetta":      { driver: '24"', passenger: '19"' },
  default:                 { driver: '24"', passenger: '18"' },
};

// Wiper blade part options by size
function wiperOptionsForSize(driverSize: string, passengerSize: string): PartOption[] {
  return [
    {
      brand: "Bosch ICON",
      partNumber: `22B${driverSize.replace('"', '')}-${passengerSize.replace('"', '')}`,
      isOem: false,
      retailPriceCents: 3999,
    },
    {
      brand: "Rain-X Latitude",
      partNumber: `RX${driverSize.replace('"', '')}${passengerSize.replace('"', '')}`,
      isOem: false,
      retailPriceCents: 2999,
    },
    {
      brand: "Michelin Endurance",
      partNumber: `MEW${driverSize.replace('"', '')}${passengerSize.replace('"', '')}`,
      isOem: false,
      retailPriceCents: 3499,
    },
  ];
}

// ---------------------------------------------------------------------------
// Main lookup function
// ---------------------------------------------------------------------------

/**
 * Fetches compatible part numbers for the given vehicle.
 * Simulates a catalog API call — replace with real integration in production.
 */
export async function lookupQuickSpecs(
  input: QuickSpecsInput,
): Promise<QuickSpecsResult> {
  // Simulate network latency
  await new Promise((resolve) => setTimeout(resolve, 350));

  const { make, model } = input;

  const oilFilter =
    OIL_FILTER_CATALOG[make] ?? OIL_FILTER_CATALOG.default;
  const airFilter =
    AIR_FILTER_CATALOG[make] ?? AIR_FILTER_CATALOG.default;
  const cabinAirFilter =
    CABIN_FILTER_CATALOG[make] ?? CABIN_FILTER_CATALOG.default;

  const wiperSizes =
    WIPER_SIZES[`${make}:${model}`] ?? WIPER_SIZES.default;
  const wiperOptions = wiperOptionsForSize(wiperSizes.driver, wiperSizes.passenger);

  return {
    oilFilter,
    airFilter,
    cabinAirFilter,
    wiperBlades: {
      sizes: wiperSizes,
      options: wiperOptions,
    },
  };
}

/**
 * Builds a "kit" of recommended parts (one item per category) ready for
 * insertion into a Work Order's parts list.
 */
export function buildQuickSpecsKit(specs: QuickSpecsResult): QuickSpecsKitItem[] {
  // Pick the first non-OEM option where available (best-value aftermarket)
  function pickBestAftermarket(options: PartOption[]): PartOption {
    return options.find((o) => !o.isOem) ?? options[0];
  }

  const oil = pickBestAftermarket(specs.oilFilter);
  const air = pickBestAftermarket(specs.airFilter);
  const cabin = pickBestAftermarket(specs.cabinAirFilter);
  const wiper = pickBestAftermarket(specs.wiperBlades.options);

  return [
    {
      category: "Oil Filter",
      brand: oil.brand,
      partNumber: oil.partNumber,
      retailPriceCents: oil.retailPriceCents,
      quantity: 1,
    },
    {
      category: "Engine Air Filter",
      brand: air.brand,
      partNumber: air.partNumber,
      retailPriceCents: air.retailPriceCents,
      quantity: 1,
    },
    {
      category: "Cabin Air Filter",
      brand: cabin.brand,
      partNumber: cabin.partNumber,
      retailPriceCents: cabin.retailPriceCents,
      quantity: 1,
    },
    {
      category: "Wiper Blades",
      brand: wiper.brand,
      partNumber: `${wiper.partNumber} (${specs.wiperBlades.sizes.driver}/${specs.wiperBlades.sizes.passenger})`,
      retailPriceCents: wiper.retailPriceCents,
      quantity: 2, // driver + passenger
    },
  ];
}
