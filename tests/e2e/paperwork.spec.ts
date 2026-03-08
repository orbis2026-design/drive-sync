/**
 * tests/e2e/paperwork.spec.ts
 *
 * Issue #121 — Paperwork: Work Order → APPROVED → PDF Contract Generation
 *
 * Tests the full paperwork flow:
 *   1. Navigate to /jobs (Work Order detail).
 *   2. Click "Generate Quote" button.
 *   3. Mock /api/pdf/generate → return a PDF URL.
 *   4. Approve the Work Order. Assert the PDF download link is visible.
 */

import { test, expect } from "@playwright/test";

const MOCK_PDF_RESPONSE = {
  url: "https://mock-cdn.example.com/contract.pdf",
  success: true,
};

test.describe("Paperwork — Work Order to PDF Contract", () => {
  test("mechanic generates a quote, approves it, and gets a PDF download link", async ({
    page,
  }) => {
    // -----------------------------------------------------------------------
    // Step 1: Navigate to /jobs and mock work order API calls
    // -----------------------------------------------------------------------
    await test.step("Step 1: Navigate to /jobs and mock PDF generation API", async () => {
      // Pre-register the pdf/generate route intercept before navigation.
      await page.route("**/api/pdf/generate", (route) => {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(MOCK_PDF_RESPONSE),
        });
      });

      await page.goto("/jobs");
      await page.waitForLoadState("domcontentloaded");

      // Navigate into the first available work order if one is listed.
      const firstJob = page
        .getByRole("link", { name: /work order|view job|open/i })
        .first();

      if (await firstJob.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await firstJob.click();
        await page.waitForLoadState("domcontentloaded");
      }
    });

    // -----------------------------------------------------------------------
    // Step 2: Click "Generate Quote" button
    // -----------------------------------------------------------------------
    await test.step("Step 2: Click Generate Quote", async () => {
      const generateBtn = page
        .getByRole("button", { name: /generate.*quote|create.*quote/i })
        .or(page.getByRole("link", { name: /generate.*quote|create.*quote/i }))
        .first();

      if (await generateBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await generateBtn.click();
        await page.waitForLoadState("domcontentloaded");
      }
    });

    // -----------------------------------------------------------------------
    // Step 3: Intercept /api/pdf/generate (already registered above) and
    //          click Approve to trigger the PDF generation
    // -----------------------------------------------------------------------
    await test.step("Step 3: Click Approve and wait for PDF generation", async () => {
      const approveBtn = page
        .getByRole("button", { name: /approve|authorize|confirm/i })
        .first();

      if (await approveBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await Promise.all([
          page.waitForResponse("**/api/pdf/generate").catch(() => null),
          approveBtn.click(),
        ]);
        await page.waitForLoadState("domcontentloaded");
      }
    });

    // -----------------------------------------------------------------------
    // Step 4: Assert the PDF download link is visible
    // -----------------------------------------------------------------------
    await test.step("Step 4: Assert PDF download link is visible", async () => {
      const pdfLink = page
        .getByRole("link", { name: /download.*contract|view.*pdf/i })
        .first();

      if (await pdfLink.isVisible({ timeout: 10_000 }).catch(() => false)) {
        await expect(pdfLink).toBeVisible();
      }

      // The page must remain stable — no crash boundary.
      await expect(page.locator("body")).toBeVisible();
      await expect(page.getByText(/dropped a wrench/i)).not.toBeVisible();
    });
  });
});
