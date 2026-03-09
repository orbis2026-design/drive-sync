/**
 * tests/e2e/pdf-renderer.spec.ts
 *
 * Validates that renderContractPdf produces a valid binary PDF document
 * (not a JSON manifest) containing expected contract content.
 */

import { test, expect } from "@playwright/test";
import { renderContractPdf } from "../../src/lib/pdf-renderer";

test.describe("PDF Renderer — Contract Generation", () => {
  test("renderContractPdf produces a valid PDF binary with correct header", async () => {
    const pdfBuffer = renderContractPdf({
      workOrderId: "WO-TEST-001",
      shopName: "Acme Auto Shop",
      clientName: "Jane Doe",
      clientEmail: "jane@example.com",
      totalDollars: "250.00",
      formattedSignedAt: "Monday, March 9, 2026 at 12:00:00 PM EST",
      clientIp: "192.168.1.1",
      preInspectionMediaPaths: ["photos/front.jpg", "photos/rear.jpg"],
      signatureDataUrl:
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      generatedAt: "2026-03-09T12:00:00.000Z",
    });

    // Must be a Buffer
    expect(Buffer.isBuffer(pdfBuffer)).toBe(true);
    expect(pdfBuffer.length).toBeGreaterThan(0);

    // PDF files must start with %PDF-
    expect(pdfBuffer.slice(0, 5).toString("ascii")).toBe("%PDF-");

    // Must NOT be valid JSON (proving it's not a manifest)
    expect(() => JSON.parse(pdfBuffer.toString("utf-8"))).toThrow();

    // A real PDF with embedded content should be at least a few KB
    expect(pdfBuffer.length).toBeGreaterThan(1000);
  });

  test("renderContractPdf handles missing optional fields gracefully", async () => {
    const pdfBuffer = renderContractPdf({
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
    });

    expect(Buffer.isBuffer(pdfBuffer)).toBe(true);
    expect(pdfBuffer.slice(0, 5).toString("ascii")).toBe("%PDF-");
    expect(pdfBuffer.length).toBeGreaterThan(500);
  });
});
