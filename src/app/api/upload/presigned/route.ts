/**
 * POST /api/upload/presigned
 *
 * Generates a short-lived (60-second) pre-signed S3 PUT URL pointing at
 * the Cloudflare R2 bucket. The client uploads the file DIRECTLY to R2
 * from the browser, bypassing the Next.js server entirely.
 *
 * This avoids the 413 Payload Too Large error that occurs when piping large
 * walkaround videos (50 MB+) through a Next.js API route.
 *
 * Request body (JSON):
 *   {
 *     fileName:    string,   // original file name
 *     contentType: string,   // MIME type (e.g. "video/mp4")
 *     workOrderId: string,   // work order the file belongs to
 *     contentLength?: number // file size in bytes (optional, for validation)
 *   }
 *
 * Response (JSON):
 *   { uploadUrl: string; publicUrl: string; key: string }
 *
 * Environment variables required:
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY, R2_SECRET_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL
 */

import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getR2Client, R2_BUCKET, r2PublicUrl } from "@/lib/r2-storage";

/** Pre-signed URLs expire after 60 seconds — tight window for direct-to-R2 uploads. */
const URL_EXPIRY_SECONDS = 60;

/** Maximum raw file size accepted: 500 MB (validated client-side; R2 enforces server-side). */
const MAX_CONTENT_LENGTH = 500 * 1024 * 1024;

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
    };

    const { fileName, contentType, workOrderId, contentLength } = body;

    // ── Input validation ─────────────────────────────────────────────────────
    if (
      typeof fileName !== "string" ||
      !fileName.trim()
    ) {
      return NextResponse.json(
        { error: "fileName is required." },
        { status: 400 },
      );
    }

    if (
      typeof contentType !== "string" ||
      !contentType.trim()
    ) {
      return NextResponse.json(
        { error: "contentType is required." },
        { status: 400 },
      );
    }

    if (
      typeof workOrderId !== "string" ||
      !workOrderId.trim()
    ) {
      return NextResponse.json(
        { error: "workOrderId is required." },
        { status: 400 },
      );
    }

    if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
      return NextResponse.json(
        { error: `Content type "${contentType}" is not allowed.` },
        { status: 415 },
      );
    }

    if (
      typeof contentLength === "number" &&
      contentLength > MAX_CONTENT_LENGTH
    ) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 500 MB." },
        { status: 413 },
      );
    }

    if (
      !process.env.R2_ACCOUNT_ID ||
      !process.env.R2_ACCESS_KEY ||
      !process.env.R2_SECRET_KEY
    ) {
      return NextResponse.json(
        { error: "R2 storage is not configured on the server." },
        { status: 503 },
      );
    }

    // ── Build object key ──────────────────────────────────────────────────────
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const key = `vault/${workOrderId}/${Date.now()}-${safeName}`;

    // ── Generate 60-second pre-signed PUT URL ─────────────────────────────────
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
    console.error("[api/upload/presigned] Error generating pre-signed URL:", err);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 },
    );
  }
}
