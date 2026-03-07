/**
 * POST /api/pdf/generate
 *
 * Generates a locked PDF containing:
 *   • Pre-inspection media references
 *   • Quote / Work Order details
 *   • Legal authorization text
 *   • Customer electronic signature
 *
 * The PDF is saved to Supabase Storage and a download URL is returned.
 *
 * Production implementation: replace the jsPDF mock with puppeteer-core
 * (via a headless Chrome provider such as @sparticuz/chromium) to render
 * a full HTML template, or use the jsPDF/pdfmake libraries.
 *
 * For the prototype, this handler generates a structured PDF manifest
 * representing the signed document and uploads it to Supabase Storage.
 */

import { NextResponse, type NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Request / Response types
// ---------------------------------------------------------------------------

interface GeneratePdfRequest {
  /** Work Order or Quote identifier */
  workOrderId: string;
  /** Customer's full name */
  clientName: string;
  /** Customer's email for emailing the PDF */
  clientEmail?: string;
  /** Base64-encoded signature image (PNG data URL) */
  signatureDataUrl: string;
  /** ISO timestamp of when the customer signed */
  signedAt: string;
  /** IP address logged from the portal session */
  clientIp?: string;
  /** Quote total in US cents */
  totalCents: number;
  /** Shop name displayed in the PDF header */
  shopName: string;
  /** Pre-inspection media file paths in Supabase Storage (optional) */
  preInspectionMediaPaths?: string[];
}

interface GeneratePdfResponse {
  /** Supabase Storage URL of the generated PDF */
  pdfUrl: string;
  /** Filename of the generated PDF */
  fileName: string;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: GeneratePdfRequest;

  try {
    body = (await request.json()) as GeneratePdfRequest;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON in request body." },
      { status: 400 },
    );
  }

  const {
    workOrderId,
    clientName,
    clientEmail,
    signatureDataUrl,
    signedAt,
    clientIp,
    totalCents,
    shopName,
    preInspectionMediaPaths = [],
  } = body;

  if (!workOrderId || !clientName || !signatureDataUrl || !signedAt) {
    return NextResponse.json(
      {
        error:
          "Missing required fields: workOrderId, clientName, signatureDataUrl, signedAt",
      },
      { status: 400 },
    );
  }

  try {
    // ── Build PDF manifest ────────────────────────────────────────────────
    // In production: use puppeteer-core + @sparticuz/chromium to render a
    // full HTML template, or use jsPDF/pdfmake for structured output.
    //
    // For this prototype we compose a structured JSON manifest representing
    // the document content. The manifest includes all legally material fields.

    const formattedSignedAt = new Date(signedAt).toLocaleString("en-US", {
      dateStyle: "full",
      timeStyle: "long",
    });
    const totalDollars = (totalCents / 100).toFixed(2);

    const pdfManifest = {
      title: `Signed Authorization — Work Order ${workOrderId}`,
      shopName,
      clientName,
      clientEmail: clientEmail ?? "N/A",
      workOrderId,
      totalAmount: `$${totalDollars}`,
      signedAt: formattedSignedAt,
      clientIp: clientIp ?? "Not recorded",
      preInspectionMediaCount: preInspectionMediaPaths.length,
      preInspectionMediaPaths,
      signatureEmbedded: signatureDataUrl.startsWith("data:image/"),
      generatedAt: new Date().toISOString(),
      legalNotice: [
        "This document was generated automatically by DriveSync.",
        "It serves as the legally binding record of the customer's authorization.",
        "The embedded signature is an authentic electronic signature under",
        "applicable e-signature laws (ESIGN Act, UETA).",
      ].join(" "),
    };

    // Produce PDF bytes — currently a JSON manifest; replace with real PDF
    const pdfBytes = Buffer.from(
      JSON.stringify(pdfManifest, null, 2),
      "utf-8",
    );

    // ── Upload to Supabase Storage ────────────────────────────────────────
    const fileName = `contracts/${workOrderId}/signed-contract-${Date.now()}.pdf`;

    // Lazy-import to avoid build-time issues when env vars are absent
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const adminDb = createAdminClient();

    const { error: uploadError } = await adminDb.storage
      .from("contracts")
      .upload(fileName, pdfBytes, {
        contentType: "application/pdf",
        upsert: false,
      });

    if (uploadError) {
      // Non-fatal in development where storage bucket may not exist
      console.warn(
        "[pdf/generate] Storage upload skipped:",
        uploadError.message,
      );
    }

    // ── Get public URL ────────────────────────────────────────────────────
    const { data: urlData } = adminDb.storage
      .from("contracts")
      .getPublicUrl(fileName);

    const pdfUrl = urlData.publicUrl;

    // ── Email notification (best-effort) ──────────────────────────────────
    // TODO: integrate with Resend / SendGrid to email the PDF to clientEmail.
    if (clientEmail) {
      console.info(
        `[pdf/generate] TODO: email signed contract to ${clientEmail}`,
      );
    }

    const response: GeneratePdfResponse = { pdfUrl, fileName };
    return NextResponse.json(response, { status: 200 });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown error generating PDF.";
    console.error("[pdf/generate]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
