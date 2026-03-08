/**
 * Cloudflare R2 Storage Utility (Issue #46)
 *
 * R2 is S3-compatible, so we use the AWS SDK configured against
 * the Cloudflare R2 endpoint.  Egress (downloads) to the public
 * internet from R2 is free, eliminating bandwidth costs.
 *
 * Required environment variables:
 *   R2_ACCOUNT_ID   — Cloudflare account ID (used to build the endpoint URL)
 *   R2_ACCESS_KEY   — R2 API token Access Key ID
 *   R2_SECRET_KEY   — R2 API token Secret Access Key
 *   R2_BUCKET_NAME  — Name of the R2 bucket (defaults to "drive-sync-media")
 *   R2_PUBLIC_URL   — Public base URL for the bucket (optional; used for final URLs)
 *
 * Issue #100 adds a second, private backup bucket:
 *   R2_BACKUP_BUCKET_NAME — Name of the backup R2 bucket (defaults to "drive-sync-backups")
 */

import { S3Client } from "@aws-sdk/client-s3";

const accountId = process.env.R2_ACCOUNT_ID ?? "";
const accessKeyId = process.env.R2_ACCESS_KEY ?? "";
const secretAccessKey = process.env.R2_SECRET_KEY ?? "";

export const R2_BUCKET = process.env.R2_BUCKET_NAME ?? "drive-sync-media";

/** Dedicated private bucket for automated database backups (Issue #100). */
export const R2_BACKUP_BUCKET =
  process.env.R2_BACKUP_BUCKET_NAME ?? "drive-sync-backups";

/**
 * Public base URL for the R2 bucket.
 * If R2_PUBLIC_URL is not set we fall back to the R2.dev preview URL pattern.
 */
export const R2_PUBLIC_BASE =
  process.env.R2_PUBLIC_URL ??
  `https://pub-${accountId}.r2.dev`;

/**
 * Pre-configured S3Client that points at the Cloudflare R2 endpoint.
 * Lazily created so that Next.js build/lint passes even without env vars.
 */
let _r2Client: S3Client | null = null;

export function getR2Client(): S3Client {
  if (!_r2Client) {
    _r2Client = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }
  return _r2Client;
}

/**
 * Returns the public URL for a given object key in the R2 bucket.
 */
export function r2PublicUrl(key: string): string {
  return `${R2_PUBLIC_BASE}/${key}`;
}
