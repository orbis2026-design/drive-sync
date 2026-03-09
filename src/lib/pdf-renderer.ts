/**
 * src/lib/pdf-renderer.ts
 *
 * Renders a legally-binding signed authorization PDF using jsPDF.
 * The generated PDF includes:
 *   • Shop & customer identification
 *   • Work order and pricing details
 *   • Pre-inspection media references
 *   • Legal authorization text (ESIGN Act / UETA)
 *   • Embedded customer electronic signature image
 */

import { jsPDF } from "jspdf";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ContractPdfInput {
  workOrderId: string;
  shopName: string;
  clientName: string;
  clientEmail: string;
  totalDollars: string;
  formattedSignedAt: string;
  clientIp: string;
  preInspectionMediaPaths: string[];
  /** Base64-encoded PNG data URL for the customer signature */
  signatureDataUrl: string;
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_WIDTH = 210; // A4 mm
const MARGIN_LEFT = 20;
const MARGIN_RIGHT = 20;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;

const LEGAL_TEXT = [
  "This document was generated automatically by DriveSync. It serves as the",
  "legally binding record of the customer's authorization for the work described",
  "above. The embedded signature is an authentic electronic signature under",
  "applicable e-signature laws (ESIGN Act, UETA). By signing, the customer",
  "authorizes the shop to perform all work described in this contract and agrees",
  "to the total amount shown.",
];

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

/**
 * Generates a signed contract PDF as a Buffer.
 * Returns binary PDF data suitable for storage or email attachment.
 */
export function renderContractPdf(input: ContractPdfInput): Buffer {
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  let y = 20;

  // ── Header ──────────────────────────────────────────────────────────────
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("SIGNED AUTHORIZATION", PAGE_WIDTH / 2, y, { align: "center" });
  y += 10;

  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  doc.text(`Work Order: ${input.workOrderId}`, PAGE_WIDTH / 2, y, {
    align: "center",
  });
  y += 12;

  // ── Horizontal rule ─────────────────────────────────────────────────────
  doc.setDrawColor(0);
  doc.setLineWidth(0.5);
  doc.line(MARGIN_LEFT, y, PAGE_WIDTH - MARGIN_RIGHT, y);
  y += 10;

  // ── Shop & Client Info ──────────────────────────────────────────────────
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Shop:", MARGIN_LEFT, y);
  doc.setFont("helvetica", "normal");
  doc.text(input.shopName || "N/A", MARGIN_LEFT + 25, y);
  y += 7;

  doc.setFont("helvetica", "bold");
  doc.text("Client:", MARGIN_LEFT, y);
  doc.setFont("helvetica", "normal");
  doc.text(input.clientName, MARGIN_LEFT + 25, y);
  y += 7;

  doc.setFont("helvetica", "bold");
  doc.text("Email:", MARGIN_LEFT, y);
  doc.setFont("helvetica", "normal");
  doc.text(input.clientEmail, MARGIN_LEFT + 25, y);
  y += 7;

  doc.setFont("helvetica", "bold");
  doc.text("IP Address:", MARGIN_LEFT, y);
  doc.setFont("helvetica", "normal");
  doc.text(input.clientIp, MARGIN_LEFT + 25, y);
  y += 12;

  // ── Financial Details ───────────────────────────────────────────────────
  doc.setDrawColor(0);
  doc.setLineWidth(0.3);
  doc.line(MARGIN_LEFT, y, PAGE_WIDTH - MARGIN_RIGHT, y);
  y += 8;

  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text(`Total Amount: $${input.totalDollars}`, MARGIN_LEFT, y);
  y += 10;

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Signed At:", MARGIN_LEFT, y);
  doc.setFont("helvetica", "normal");
  doc.text(input.formattedSignedAt, MARGIN_LEFT + 25, y);
  y += 7;

  doc.setFont("helvetica", "bold");
  doc.text("Generated:", MARGIN_LEFT, y);
  doc.setFont("helvetica", "normal");
  doc.text(input.generatedAt, MARGIN_LEFT + 25, y);
  y += 12;

  // ── Pre-inspection Media ────────────────────────────────────────────────
  if (input.preInspectionMediaPaths.length > 0) {
    doc.setDrawColor(0);
    doc.setLineWidth(0.3);
    doc.line(MARGIN_LEFT, y, PAGE_WIDTH - MARGIN_RIGHT, y);
    y += 8;

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text(
      `Pre-Inspection Media (${input.preInspectionMediaPaths.length} file${input.preInspectionMediaPaths.length > 1 ? "s" : ""}):`,
      MARGIN_LEFT,
      y,
    );
    y += 7;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    for (const path of input.preInspectionMediaPaths) {
      if (y > 260) {
        doc.addPage();
        y = 20;
      }
      doc.text(`• ${path}`, MARGIN_LEFT + 5, y);
      y += 5;
    }
    y += 5;
  }

  // ── Legal Notice ────────────────────────────────────────────────────────
  doc.setDrawColor(0);
  doc.setLineWidth(0.3);
  doc.line(MARGIN_LEFT, y, PAGE_WIDTH - MARGIN_RIGHT, y);
  y += 8;

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("LEGAL NOTICE", MARGIN_LEFT, y);
  y += 6;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const legalLines = doc.splitTextToSize(LEGAL_TEXT.join(" "), CONTENT_WIDTH);
  doc.text(legalLines, MARGIN_LEFT, y);
  y += legalLines.length * 4.5 + 8;

  // ── Signature ───────────────────────────────────────────────────────────
  if (y > 230) {
    doc.addPage();
    y = 20;
  }

  doc.setDrawColor(0);
  doc.setLineWidth(0.3);
  doc.line(MARGIN_LEFT, y, PAGE_WIDTH - MARGIN_RIGHT, y);
  y += 8;

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Customer Signature:", MARGIN_LEFT, y);
  y += 5;

  // Embed the signature image if it's a valid data URL
  if (input.signatureDataUrl.startsWith("data:image/")) {
    try {
      // jsPDF accepts data URLs directly for addImage
      const imgFormat = input.signatureDataUrl.includes("data:image/png")
        ? "PNG"
        : "JPEG";
      doc.addImage(
        input.signatureDataUrl,
        imgFormat,
        MARGIN_LEFT,
        y,
        60,
        20,
      );
      y += 25;
    } catch {
      doc.setFontSize(9);
      doc.setFont("helvetica", "italic");
      doc.text("[Signature image could not be embedded]", MARGIN_LEFT, y);
      y += 6;
    }
  }

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Signed by: ${input.clientName}`, MARGIN_LEFT, y);
  y += 5;
  doc.text(`Date: ${input.formattedSignedAt}`, MARGIN_LEFT, y);

  // ── Footer ──────────────────────────────────────────────────────────────
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(128);
    doc.text(
      `DriveSync — Page ${i} of ${pageCount}`,
      PAGE_WIDTH / 2,
      290,
      { align: "center" },
    );
    doc.setTextColor(0);
  }

  // ── Output ──────────────────────────────────────────────────────────────
  const arrayBuffer = doc.output("arraybuffer");
  return Buffer.from(arrayBuffer);
}
