export type OilChangePackageId =
  | "CONVENTIONAL"
  | "SYNTHETIC_BLEND"
  | "FULL_SYNTHETIC"
  | "EURO_SYNTHETIC";

export type LightJobTemplateId = "SIMPLE_BRAKE_JOB";

export interface OilChangePackage {
  id: OilChangePackageId;
  name: string;
  description: string;
  includes: string[];
}

export const OIL_CHANGE_PACKAGES: OilChangePackage[] = [
  {
    id: "CONVENTIONAL",
    name: "Conventional Oil Change",
    description: "Up to 5qt conventional oil + basic filter",
    includes: ["Conventional oil (up to 5qt)", "Standard oil filter", "Fluid top-off", "Visual inspection"],
  },
  {
    id: "SYNTHETIC_BLEND",
    name: "Synthetic Blend Oil Change",
    description: "Up to 5qt synthetic blend + basic filter",
    includes: ["Synthetic blend oil (up to 5qt)", "Standard oil filter", "Fluid top-off", "Visual inspection"],
  },
  {
    id: "FULL_SYNTHETIC",
    name: "Full Synthetic Oil Change",
    description: "Up to 5qt full synthetic + premium filter",
    includes: [
      "Full synthetic oil (up to 5qt)",
      "Premium oil filter",
      "Fluid top-off",
      "Visual inspection",
      "Tire pressure check",
    ],
  },
  {
    id: "EURO_SYNTHETIC",
    name: "European Spec Synthetic",
    description: "Euro-spec oil & filter for high-performance vehicles",
    includes: [
      "Euro-spec synthetic oil",
      "Premium oil filter",
      "Fluid top-off",
      "Visual inspection",
    ],
  },
];

export interface LightJobTemplate {
  id: LightJobTemplateId;
  name: string;
  description: string;
}

export const LIGHT_JOB_TEMPLATES: LightJobTemplate[] = [
  {
    id: "SIMPLE_BRAKE_JOB",
    name: "Simple Brake Job",
    description: "Pads and rotors on one axle, standard commuter vehicle.",
  },
];

