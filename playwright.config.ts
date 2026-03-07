import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E test configuration.
 *
 * Runs the Core Loop test (Issue #40) against the running Next.js dev server.
 * The CI pipeline starts the server before running tests, so `webServer` below
 * is configured to re-use an existing server when PORT is already in use.
 *
 * Environment variables required at test time:
 *   PLAYWRIGHT_BASE_URL   — override the base URL (default: http://localhost:3000)
 *
 * Phase 19 (Issue #71): projects array is locked to iPhone 14 Pro to strictly
 * emulate the mechanic's physical environment. Global setup logs in a test
 * FIELD_TECH user via Supabase Auth and saves storage state so individual
 * tests never see the login screen.
 */

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",

  // Fail fast: stop after the first test failure in CI.
  forbidOnly: !!process.env.CI,

  // Retry flaky tests once in CI.
  retries: process.env.CI ? 1 : 0,

  // Run tests sequentially so they share the same server state.
  workers: 1,

  reporter: [
    ["list"],
    ...(process.env.CI ? [["github"] as [string]] : []),
  ],

  // Global setup logs in the test FIELD_TECH user once before all suites run.
  globalSetup: "./tests/global-setup.ts",

  use: {
    baseURL: BASE_URL,
    // Collect traces on first retry so you can diagnose CI failures.
    trace: "on-first-retry",
    // Capture screenshots on failure.
    screenshot: "only-on-failure",
    // Reuse the authenticated storage state produced by global-setup.
    storageState: "tests/.auth/field-tech.json",
  },

  projects: [
    {
      // Issue #71: Exclusively emulate the mechanic's physical device.
      name: "iPhone 14 Pro",
      use: {
        ...devices["iPhone 14 Pro"],
        hasTouch: true,
        colorScheme: "dark",
      },
    },
  ],

  // Start the Next.js dev server automatically when running locally.
  // In CI the server is started separately before this config is used.
  webServer: {
    command: "npm run dev",
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
