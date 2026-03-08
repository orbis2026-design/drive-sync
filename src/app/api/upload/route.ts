/**
 * POST /api/upload
 *
 * Generates a pre-signed S3 PUT URL pointing at the Cloudflare R2 bucket.
 * The client uploads the file directly to R2, bypassing the Next.js server
 * entirely (saves memory & egress bandwidth).
 *
 * Request body (JSON):
 *   { fileName: string; contentType: string; workOrderId?: string; context?: string }
 *
 * Response (JSON):
 *   { uploadUrl: string; publicUrl: string; key: string }
 *
 * The returned `publicUrl` is stored in the Supabase work_orders row after
 * the browser completes the direct-to-R2 PUT.
 */

import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getR2Client, R2_BUCKET, r2PublicUrl } from "@/lib/r2-storage";

/** Pre-signed URLs expire after 10 minutes — enough for the upload to complete */
const URL_EXPIRY_SECONDS = 600;

/** Maximum allowed raw file size: 200 MB */
const MAX_CONTENT_LENGTH = 200 * 1024 * 1024;

const ALLOWED_CONTENT_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/3gpp",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
]);

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json() as {
      fileName?: unknown;
      contentType?: unknown;
      workOrderId?: unknown;
      contentLength?: unknown;
      context?: unknown;
    };

    const { fileName, contentType, workOrderId, contentLength, context } = body;

    // ── Input validation ───────────────────────────────────────────────────
    const hasWorkOrder = typeof workOrderId === "string" && workOrderId.trim();
    const hasContext = typeof context === "string" && context.trim();

    if (
      typeof fileName !== "string" ||
      !fileName.trim() ||
      typeof contentType !== "string" ||
      !contentType.trim() ||
      (!hasWorkOrder && !hasContext)
    ) {
      console.warn("[api/upload] Validation failed: fileName, contentType, and either workOrderId or context are required.", { fileName, contentType, workOrderId, context });
      return NextResponse.json(
        { error: "fileName, contentType, and either workOrderId or context are required." },
        { status: 400 }
      );
    }

    if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
      return NextResponse.json(
        { error: `Content type "${contentType}" is not allowed.` },
        { status: 415 }
      );
    }

    if (
      typeof contentLength === "number" &&
      contentLength > MAX_CONTENT_LENGTH
    ) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 200 MB." },
        { status: 413 }
      );
    }

    // Sanity-check env config
    if (!process.env.R2_ACCOUNT_ID || !process.env.R2_ACCESS_KEY || !process.env.R2_SECRET_KEY) {
      return NextResponse.json(
        { error: "R2 storage is not configured on the server." },
        { status: 503 }
      );
    }

    // ── Build object key ───────────────────────────────────────────────────
    // Sanitise the original file name: keep only safe characters.
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    let key: string;
    if (hasWorkOrder) {
      key = `walkaround/${workOrderId}/${Date.now()}-${safeName}`;
    } else if (context === "logo") {
      key = `logos/${Date.now()}-${safeName}`;
    } else {
      console.warn("[api/upload] Validation failed: unsupported context value.", { context });
      return NextResponse.json(
        { error: "fileName, contentType, and either workOrderId or context are required." },
        { status: 400 }
      );
    }

    // ── Generate pre-signed PUT URL ────────────────────────────────────────
    const command = new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(getR2Client(), command, {
      expiresIn: URL_EXPIRY_SECONDS,
    });

    const publicUrl = r2PublicUrl(key);

    return NextResponse.json({ uploadUrl, publicUrl, key });
  } catch (err) {
    console.error("[api/upload] Error generating pre-signed URL:", err);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 }
    );
  }
}
