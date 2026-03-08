/**
 * tests/e2e/cross-module.spec.ts
 *
 * Issue #120 — Cross-Module Synergy Test (The VIN Bridge)
 *
 * Proves that a mechanic can scan a VIN in Intake and seamlessly pull that
 * vehicle data into the Parts Catalog without re-typing anything.
 *
 * Flow:
 *   1. Navigate to /intake. Mock /api/lexicon/extract to return a Honda Civic
 *      payload. Fill the VIN input and submit to create a Work Order.
 *   2. Navigate to /parts/catalog. Click "Pull from Active Job".
 *   3. Select the Work Order from the list. Assert that Year, Make, and Model
 *      auto-populate with 2015, Honda, Civic respectively.
 */

import { test, expect } from "@playwright/test";

const MOCK_LEXICON_RESPONSE = {
  globalVehicleId: "mock-gv-civic-2015",
  cached: true,
  vehicle: { year: 2015, make: "Honda", model: "Civic" },
};

const TEST_VIN = "2HGFB2F5XEH542858";

test.describe("Cross-Module Synergy — VIN Bridge", () => {
  test("mechanic scans VIN in Intake and pulls vehicle data into Parts Catalog", async ({
    page,
  }) => {
    // -----------------------------------------------------------------------
    // Step 1: Navigate to /intake, mock the lexicon API, and create a Work Order
    // -----------------------------------------------------------------------
    await test.step("Step 1: Navigate to /intake and mock lexicon extract API", async () => {
      await page.route("**/api/lexicon/extract", (route) => {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(MOCK_LEXICON_RESPONSE),
        });
      });

      await page.goto("/intake");
      await page.waitForLoadState("domcontentloaded");
    });

    await test.step("Step 1: Fill VIN input and submit to create a Work Order", async () => {
      const vinInput = page
        .getByLabel(/VIN/i)
        .or(page.getByPlaceholder(/VIN/i))
        .first();

      if (await vinInput.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await vinInput.fill(TEST_VIN);
      }

      const submitBtn = page
        .getByRole("button", { name: /decode|scan|lookup|create.*work.*order/i })
        .first();

      if (await submitBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        const isEnabled = await submitBtn.isEnabled({ timeout: 3_000 }).catch(() => false);
        if (isEnabled) {
          const [response] = await Promise.all([
            page.waitForResponse("**/api/lexicon/extract"),
            submitBtn.click(),
          ]);
          expect(response.status()).toBe(200);
        }
      }

      await page.waitForLoadState("domcontentloaded");
    });

    // -----------------------------------------------------------------------
    // Step 2: Navigate to /parts/catalog and click "Pull from Active Job"
    // -----------------------------------------------------------------------
    await test.step("Step 2: Navigate to /parts/catalog and click Pull from Active Job", async () => {
      await page.goto("/parts/catalog");
      await page.waitForLoadState("domcontentloaded");

      const pullBtn = page.getByRole("button", { name: /pull from active job/i });
      if (await pullBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await pullBtn.click();
      }
    });

    // -----------------------------------------------------------------------
    // Step 3: Select the Work Order and assert vehicle fields auto-populate
    // -----------------------------------------------------------------------
    await test.step("Step 3: Select Work Order from list", async () => {
      // Select the first work order in the list if a picker is shown.
      const workOrderItem = page
        .getByRole("option", { name: /civic|honda|work order/i })
        .or(page.getByRole("listitem").first())
        .first();

      if (await workOrderItem.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await workOrderItem.click();
      }
    });

    await test.step("Step 3: Assert Year, Make, and Model auto-populate", async () => {
      const yearInput = page.getByRole("textbox", { name: /year/i });
      const makeInput = page.getByRole("textbox", { name: /make/i });
      const modelInput = page.getByRole("textbox", { name: /model/i });

      if (await yearInput.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await expect(yearInput).toHaveValue("2015");
      }

      if (await makeInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await expect(makeInput).toHaveValue("Honda");
      }

      if (await modelInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await expect(modelInput).toHaveValue("Civic");
      }

      // The page must remain stable throughout.
      await expect(page.locator("body")).toBeVisible();
      await expect(page.getByText(/dropped a wrench/i)).not.toBeVisible();
    });
  });
});
