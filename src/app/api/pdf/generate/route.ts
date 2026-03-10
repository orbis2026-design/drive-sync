/**
 * POST /api/pdf/generate
 *
 * Generates a legally-binding signed PDF contract containing:
 *   • Pre-inspection media references
 *   • Quote / Work Order details
 *   • Legal authorization text (ESIGN Act / UETA)
 *   • Customer electronic signature (embedded image)
 *
 * The PDF is rendered with jsPDF, saved to Supabase Storage, emailed to the
 * customer via Resend, and a download URL is returned.
 */

import { NextResponse, type NextRequest } from "next/server";
import { renderContractPdf } from "@/lib/pdf-renderer";
import { prisma } from "@/lib/prisma";
import { sendContractEmail } from "@/lib/email";

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
    // ── Render real PDF ───────────────────────────────────────────────────
    const formattedSignedAt = new Date(signedAt).toLocaleString("en-US", {
      dateStyle: "full",
      timeStyle: "long",
    });
    const totalDollars = (totalCents / 100).toFixed(2);
    const generatedAt = new Date().toISOString();

    const pdfBytes = renderContractPdf({
      workOrderId,
      shopName,
      clientName,
      clientEmail: clientEmail ?? "N/A",
      totalDollars,
      formattedSignedAt,
      clientIp: clientIp ?? "Not recorded",
      preInspectionMediaPaths,
      signatureDataUrl,
      generatedAt,
    });

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

    // ── Register WorkOrderDocument row (best-effort) ─────────────────────
    try {
      const workOrder = await prisma.workOrder.findUnique({
        where: { id: workOrderId },
        select: { tenantId: true },
      });
      if (workOrder) {
        await prisma.workOrderDocument.create({
          data: {
            tenantId: workOrder.tenantId,
            workOrderId,
            type: "CONTRACT",
            storageKey: fileName,
            bucket: "contracts",
            filename: fileName.split("/").pop() ?? "signed-contract.pdf",
            metadataJson: { publicUrl: pdfUrl },
          },
        });
      }
    } catch {
      // Non-fatal; PDF remains usable via direct link.
    }

    // ── Email notification (best-effort) ──────────────────────────────────
    if (clientEmail) {
      const attachmentName = `signed-contract-${workOrderId}.pdf`;
      await sendContractEmail({
        to: clientEmail,
        clientName,
        shopName,
        workOrderId,
        pdfBuffer: pdfBytes,
        pdfFileName: attachmentName,
      });
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
