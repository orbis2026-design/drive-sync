/**
 * Server-side encryption for QuickBooks OAuth tokens at rest.
 *
 * Uses AES-256-GCM. Key from QBO_TOKEN_ENCRYPTION_KEY (32 bytes hex or 44 chars base64).
 * If the key is not set, tokens are stored in plaintext (backward compatible; not recommended for production).
 */

import crypto from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const KEY_LEN = 32;
const SEP = ".";

function getKey(): Buffer | null {
  const raw = process.env.QBO_TOKEN_ENCRYPTION_KEY;
  if (!raw || raw.length < 32) return null;
  if (raw.length === 64 && /^[0-9a-fA-F]+$/.test(raw)) {
    return Buffer.from(raw, "hex");
  }
  try {
    const buf = Buffer.from(raw, "base64");
    return buf.length === KEY_LEN ? buf : null;
  } catch {
    return null;
  }
}

/**
 * Encrypts a token for storage. Returns plaintext if no key is configured (backward compatible).
 */
export function encryptToken(plaintext: string): string {
  const key = getKey();
  if (!key) return plaintext;

  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    iv.toString("base64url"),
    authTag.toString("base64url"),
    enc.toString("base64url"),
  ].join(SEP);
}

/**
 * Decrypts a stored token. If decryption fails (wrong key, legacy plaintext), returns the value as-is.
 */
export function decryptToken(stored: string | null): string | null {
  if (stored == null || stored === "") return null;

  const key = getKey();
  if (!key) return stored;

  const parts = stored.split(SEP);
  if (parts.length !== 3) return stored;

  try {
    const iv = Buffer.from(parts[0], "base64url");
    const authTag = Buffer.from(parts[1], "base64url");
    const enc = Buffer.from(parts[2], "base64url");
    const decipher = crypto.createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(authTag);
    return decipher.update(enc).toString("utf8") + decipher.final("utf8");
  } catch {
    return stored;
  }
}
