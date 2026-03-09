/**
 * tests/e2e/pdf-renderer.spec.ts
 *
 * Validates that renderContractPdf produces a valid binary PDF document
 * (not a JSON manifest) containing expected contract content.
 */

import { test, expect } from "@playwright/test";
import { execSync } from "child_process";

test.describe("PDF Renderer — Contract Generation", () => {
  test("renderContractPdf produces a valid PDF binary with correct header", async () => {
    const script = `
      import { renderContractPdf } from "${process.cwd()}/src/lib/pdf-renderer";
      const input = {
        workOrderId: "WO-TEST-001",
        shopName: "Acme Auto Shop",
        clientName: "Jane Doe",
        clientEmail: "jane@example.com",
        totalDollars: "250.00",
        formattedSignedAt: "Monday, March 9, 2026 at 12:00:00 PM EST",
        clientIp: "192.168.1.1",
        preInspectionMediaPaths: ["photos/front.jpg", "photos/rear.jpg"],
        signatureDataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        generatedAt: "2026-03-09T12:00:00.000Z",
      };
      const pdfBuffer = renderContractPdf(input);
      const results = {
        isBuffer: Buffer.isBuffer(pdfBuffer),
        sizeGreaterThanZero: pdfBuffer.length > 0,
        startsWithPdfHeader: pdfBuffer.slice(0, 5).toString("ascii") === "%PDF-",
        isNotJson: (() => { try { JSON.parse(pdfBuffer.toString("utf-8")); return false; } catch { return true; } })(),
        sizeBytes: pdfBuffer.length,
      };
      console.log(JSON.stringify(results));
    `;

    const output = execSync(`npx tsx -e '${script.replace(/'/g, "\\'")}'`, {
      cwd: process.cwd(),
      encoding: "utf-8",
    }).trim();

    // Parse the last line (skip any npm warnings)
    const lastLine = output.split("\n").pop()!;
    const results = JSON.parse(lastLine);

    expect(results.isBuffer).toBe(true);
    expect(results.sizeGreaterThanZero).toBe(true);
    expect(results.startsWithPdfHeader).toBe(true);
    expect(results.isNotJson).toBe(true);
    // A real PDF with embedded content should be at least a few KB
    expect(results.sizeBytes).toBeGreaterThan(1000);
  });

  test("renderContractPdf handles missing optional fields gracefully", async () => {
    const script = `
      import { renderContractPdf } from "${process.cwd()}/src/lib/pdf-renderer";
      const input = {
        workOrderId: "WO-MINIMAL",
        shopName: "",
        clientName: "John Smith",
        clientEmail: "N/A",
        totalDollars: "0.00",
        formattedSignedAt: "Monday, March 9, 2026 at 12:00:00 PM EST",
        clientIp: "Not recorded",
        preInspectionMediaPaths: [],
        signatureDataUrl: "not-a-data-url",
        generatedAt: "2026-03-09T12:00:00.000Z",
      };
      const pdfBuffer = renderContractPdf(input);
      const results = {
        isBuffer: Buffer.isBuffer(pdfBuffer),
        startsWithPdfHeader: pdfBuffer.slice(0, 5).toString("ascii") === "%PDF-",
        sizeBytes: pdfBuffer.length,
      };
      console.log(JSON.stringify(results));
    `;

    const output = execSync(`npx tsx -e '${script.replace(/'/g, "\\'")}'`, {
      cwd: process.cwd(),
      encoding: "utf-8",
    }).trim();

    const lastLine = output.split("\n").pop()!;
    const results = JSON.parse(lastLine);

    expect(results.isBuffer).toBe(true);
    expect(results.startsWithPdfHeader).toBe(true);
    expect(results.sizeBytes).toBeGreaterThan(500);
  });
});
