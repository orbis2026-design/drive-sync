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

  use: {
    baseURL: BASE_URL,
    // Collect traces on first retry so you can diagnose CI failures.
    trace: "on-first-retry",
    // Capture screenshots on failure.
    screenshot: "only-on-failure",
    // Short viewport — reflects a typical mechanic phone screen.
    viewport: { width: 390, height: 844 },
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "Mobile Chrome",
      use: { ...devices["Pixel 7"] },
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
