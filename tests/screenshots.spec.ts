/**
 * README screenshot capture.
 *
 * Run with: npx playwright test tests/screenshots.spec.ts --project=Desktop Chrome
 *
 * Requires:
 *   - Dev server running (or let Playwright start it via webServer).
 *   - For app screens (jobs, clients, work-order-hub, etc.): run the full E2E
 *     suite once so global-setup creates tests/.auth/field-tech.json, or run
 *     with valid E2E_FIELD_TECH_* env and Supabase so auth state is created.
 *
 * Screenshots are written to docs/screenshots/.
 */

import { test } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const SCREENSHOTS_DIR = path.join(process.cwd(), "docs", "screenshots");
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

test.beforeAll(() => {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
});

test.describe("README screenshots (public)", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("landing page", async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, "landing.png"),
      fullPage: true,
    });
  });

  test("login page", async ({ page }) => {
    await page.goto(`${BASE_URL}/auth/login`, { waitUntil: "domcontentloaded" });
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, "login.png"),
      fullPage: true,
    });
  });
});

test.describe("README screenshots (app, authenticated)", () => {
  test("jobs board", async ({ page }) => {
    await page.goto(`${BASE_URL}/jobs`, { waitUntil: "networkidle" });
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, "jobs.png"),
      fullPage: true,
    });
  });

  test("clients", async ({ page }) => {
    await page.goto(`${BASE_URL}/clients`, { waitUntil: "networkidle" });
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, "clients.png"),
      fullPage: true,
    });
  });

  test("work order hub, quote builder, checkout", async ({ page }) => {
    await page.goto(`${BASE_URL}/jobs`, { waitUntil: "networkidle" });
    const hubLink = page.locator('a[href^="/work-orders/"]').first();
    const count = await hubLink.count();
    if (count === 0) {
      test.skip();
      return;
    }
    const href = await hubLink.getAttribute("href");
    const workOrderId = href?.match(/\/work-orders\/([^/]+)/)?.[1];
    if (!workOrderId) {
      test.skip();
      return;
    }

    await page.goto(`${BASE_URL}/work-orders/${workOrderId}`, {
      waitUntil: "networkidle",
    });
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, "work-order-hub.png"),
      fullPage: true,
    });

    await page.goto(`${BASE_URL}/quotes/${workOrderId}`, {
      waitUntil: "networkidle",
    });
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, "quote-builder.png"),
      fullPage: true,
    });

    await page.goto(`${BASE_URL}/checkout/${workOrderId}`, {
      waitUntil: "networkidle",
    });
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, "checkout.png"),
      fullPage: true,
    });
  });
});
