/**
 * GET /api/cron/backup
 *
 * Disaster-recovery CRON job that snapshots the live database to a private
 * Cloudflare R2 bucket (Issue #100).
 *
 * What it does:
 *  1. Verifies the caller via a shared Bearer token (`CRON_SECRET`).
 *  2. Reads every key table using the Supabase Admin client (bypasses RLS).
 *  3. Serialises the snapshot to newline-delimited JSON and gzip-compresses it.
 *  4. Uploads the compressed archive to the `drive-sync-backups` R2 bucket
 *     with a timestamped key: `daily/YYYY-MM-DD/backup.json.gz`.
 *  5. Deletes any backup objects that are older than 30 days to maintain a
 *     rolling retention window and control storage costs.
 *
 * Schedule: configure as a daily CRON in Vercel / Supabase pg_cron / GitHub Actions.
 *
 * Required environment variables:
 *   CRON_SECRET              — shared secret verified in the Authorization header
 *   NEXT_PUBLIC_SUPABASE_URL — Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY — Supabase service-role key (bypasses RLS)
 *   R2_ACCOUNT_ID            — Cloudflare account ID
 *   R2_ACCESS_KEY            — R2 API token Access Key ID
 *   R2_SECRET_KEY            — R2 API token Secret Access Key
 *   R2_BACKUP_BUCKET_NAME    — (optional) backup bucket name; defaults to "drive-sync-backups"
 */

import { NextRequest, NextResponse } from "next/server";
import { gzip } from "node:zlib";
import { promisify } from "node:util";
import {
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
  type ObjectIdentifier,
} from "@aws-sdk/client-s3";
import { createAdminClient } from "@/lib/supabase/admin";
import { getR2Client, R2_BACKUP_BUCKET } from "@/lib/r2-storage";

const gzipAsync = promisify(gzip);

/** Tables included in the daily snapshot — ordered by dependency. */
const TABLES = [
  "tenants",
  "clients",
  "tenant_vehicles",
  "global_vehicles",
  "work_orders",
  "consumables",
  "warranties",
  "expenses",
  "outbound_campaigns",
  "shop_messages",
  "promo_codes",
] as const;

/** Backups older than this many days are automatically pruned. */
const RETENTION_DAYS = 30;

// ---------------------------------------------------------------------------
// Security — Bearer token guard
// ---------------------------------------------------------------------------

function isAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  const auth = req.headers.get("authorization") ?? "";
  return auth === `Bearer ${cronSecret}`;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const r2 = getR2Client();
  const admin = createAdminClient();

  // ── 1. Snapshot all tables ──────────────────────────────────────────────
  const snapshot: Record<string, unknown[]> = {};

  for (const table of TABLES) {
    const { data, error } = await admin.from(table).select("*");
    if (error) {
      console.error(`[cron/backup] Failed to read table "${table}":`, error.message);
      return NextResponse.json(
        { error: `Failed to read table "${table}": ${error.message}` },
        { status: 500 },
      );
    }
    snapshot[table] = data ?? [];
  }

  // ── 2. Serialise & compress ─────────────────────────────────────────────
  const json = JSON.stringify({
    generated_at: new Date().toISOString(),
    tables: snapshot,
  });

  let compressed: Buffer;
  try {
    compressed = await gzipAsync(Buffer.from(json, "utf-8"));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown compression error";
    console.error("[cron/backup] Compression failed:", msg);
    return NextResponse.json({ error: `Compression failed: ${msg}` }, { status: 500 });
  }

  // ── 3. Upload to R2 ─────────────────────────────────────────────────────
  // toISOString() always returns a UTC timestamp, so the date slice is UTC.
  const today = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD" in UTC
  const objectKey = `daily/${today}/backup.json.gz`;

  try {
    await r2.send(
      new PutObjectCommand({
        Bucket: R2_BACKUP_BUCKET,
        Key: objectKey,
        Body: compressed,
        ContentType: "application/gzip",
        ContentLength: compressed.byteLength,
        Metadata: {
          "generated-at": new Date().toISOString(),
          "table-count": String(TABLES.length),
        },
      }),
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown upload error";
    console.error("[cron/backup] R2 upload failed:", msg);
    return NextResponse.json({ error: `R2 upload failed: ${msg}` }, { status: 500 });
  }

  // ── 4. Prune backups older than RETENTION_DAYS ──────────────────────────
  // Parse the date from the object key ("daily/YYYY-MM-DD/backup.json.gz")
  // rather than relying on LastModified, so re-uploaded objects on the same
  // date are still pruned correctly when that date falls outside the window.
  let pruned = 0;
  try {
    const cutoffDate = new Date();
    cutoffDate.setUTCDate(cutoffDate.getUTCDate() - RETENTION_DAYS);
    // Cutoff as a comparable date string in the same "YYYY-MM-DD" UTC format.
    const cutoffStr = cutoffDate.toISOString().slice(0, 10);

    const list = await r2.send(
      new ListObjectsV2Command({ Bucket: R2_BACKUP_BUCKET, Prefix: "daily/" }),
    );

    const toDelete: ObjectIdentifier[] = (list.Contents ?? [])
      .filter((obj) => {
        if (!obj.Key) return false;
        // Key format: "daily/YYYY-MM-DD/backup.json.gz"
        const match = obj.Key.match(/^daily\/(\d{4}-\d{2}-\d{2})\//);
        if (!match) return false;
        return match[1] < cutoffStr; // lexicographic comparison works for ISO dates
      })
      .map((obj) => ({ Key: obj.Key as string }));

    if (toDelete.length > 0) {
      await r2.send(
        new DeleteObjectsCommand({
          Bucket: R2_BACKUP_BUCKET,
          Delete: { Objects: toDelete, Quiet: true },
        }),
      );
      pruned = toDelete.length;
    }
  } catch (err) {
    // Non-fatal — log and continue so the successful backup is still reported.
    console.warn("[cron/backup] Pruning old backups failed:", err);
  }

  console.log(`[cron/backup] Backup complete: key=${objectKey}, pruned=${pruned}`);

  return NextResponse.json({
    ok: true,
    key: objectKey,
    sizeBytes: compressed.byteLength,
    tablesSnapshotted: TABLES.length,
    prunedObjects: pruned,
  });
}
