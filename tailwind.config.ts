/**
 * DriveSync Tailwind Theme Configuration
 *
 * This file defines the design tokens for the application.
 * Tailwind v4 applies theme customization via the `@theme` directive in
 * globals.css (see src/app/globals.css). This file is the canonical
 * source-of-truth for all theme values used there.
 *
 * Design Philosophy:
 *  - MOBILE-FIRST: max-w-md base, scaling up to sm/lg/xl breakpoints
 *  - UTILITARIAN: Designed for a mechanic in bright sunlight — extreme
 *    high-contrast, large touch targets (min-h-[48px]).
 *  - COLOR SYSTEM: Near-black background, stark white text, warning yellows
 *    for interactive elements, urgent reds for destructive actions.
 */

import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // ----------------------------------------------------------------
        // Brand / primary interactive color — high-visibility warning yellow
        // Chosen for maximum legibility on dark backgrounds in bright sunlight
        // ----------------------------------------------------------------
        brand: {
          "50": "#fefce8",
          "100": "#fef9c3",
          "200": "#fef08a",
          "300": "#fde047",
          "400": "#facc15", // primary interactive
          "500": "#eab308",
          "600": "#ca8a04",
          "700": "#a16207",
          "800": "#854d0e",
          "900": "#713f12",
          "950": "#422006",
        },
        // ----------------------------------------------------------------
        // Danger / destructive actions — stark red
        // ----------------------------------------------------------------
        danger: {
          "50": "#fff1f2",
          "100": "#ffe4e6",
          "200": "#fecdd3",
          "300": "#fda4af",
          "400": "#fb7185",
          "500": "#f43f5e", // primary danger
          "600": "#e11d48",
          "700": "#be123c",
          "800": "#9f1239",
          "900": "#881337",
          "950": "#4c0519",
        },
        // ----------------------------------------------------------------
        // Success / complete state — muted green, readable on dark bg
        // ----------------------------------------------------------------
        success: {
          "400": "#4ade80",
          "500": "#22c55e",
          "600": "#16a34a",
        },
        // ----------------------------------------------------------------
        // Surface grays — near-black backgrounds for sunlight readability
        // Follows Tailwind's existing gray scale; these are aliases so
        // semantic names can be used in components.
        // ----------------------------------------------------------------
        surface: {
          DEFAULT: "#111827", // gray-900  — page background
          raised: "#1f2937", // gray-800  — card / panel
          overlay: "#374151", // gray-700  — borders, dividers
          muted: "#6b7280", // gray-500  — secondary text
        },
      },
      // ------------------------------------------------------------------
      // Touch-target enforcement — all interactive elements use these
      // ------------------------------------------------------------------
      minHeight: {
        touch: "48px",
      },
      minWidth: {
        touch: "48px",
      },
      // ------------------------------------------------------------------
      // Typography scale — kept legible at arm's length / bright sun
      // ------------------------------------------------------------------
      fontSize: {
        "2xs": ["0.625rem", { lineHeight: "0.875rem" }],
      },
      // ------------------------------------------------------------------
      // Z-index layers
      // ------------------------------------------------------------------
      zIndex: {
        nav: "50",
        modal: "100",
        toast: "200",
      },
    },
  },
  plugins: [],
} satisfies Config;

export default config;
