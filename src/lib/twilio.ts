/**
 * Shared Twilio client utilities for DriveSync.
 *
 * Provides:
 *   - `getTwilioClient()` — singleton Twilio REST client
 *   - `sendSMS(to, body, from?)` — sends a real SMS with error handling
 *   - `validateTwilioWebhook(req)` — verifies incoming Twilio webhook signatures
 *
 * Environment variables required:
 *   TWILIO_ACCOUNT_SID   — Twilio account SID
 *   TWILIO_AUTH_TOKEN    — Twilio auth token
 *   TWILIO_FROM_NUMBER   — Default outbound number
 */

import twilio from "twilio";
import type { NextRequest } from "next/server";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Singleton client
// ---------------------------------------------------------------------------

let _client: ReturnType<typeof twilio> | null = null;

/**
 * Returns a lazily-initialized Twilio REST client.
 * Throws if the required env vars are missing.
 */
export function getTwilioClient(): ReturnType<typeof twilio> {
  if (_client) return _client;

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    throw new Error(
      "Twilio credentials not configured. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.",
    );
  }

  _client = twilio(accountSid, authToken);
  return _client;
}

// ---------------------------------------------------------------------------
// Outbound SMS
// ---------------------------------------------------------------------------

export interface SendSMSResult {
  success: true;
  sid: string;
}

export interface SendSMSError {
  success: false;
  error: string;
}

/**
 * Sends a real SMS via the Twilio REST API.
 *
 * @param to   - Recipient phone number in E.164 format
 * @param body - Message body
 * @param from - Sending number (defaults to TWILIO_FROM_NUMBER env var)
 */
export async function sendSMS(
  to: string,
  body: string,
  from?: string,
): Promise<SendSMSResult | SendSMSError> {
  const fromNumber = from ?? process.env.TWILIO_FROM_NUMBER;

  if (!fromNumber) {
    return {
      success: false,
      error: "TWILIO_FROM_NUMBER not configured.",
    };
  }

  if (!to) {
    return { success: false, error: "Recipient phone number is required." };
  }

  try {
    const client = getTwilioClient();
    const message = await client.messages.create({
      to,
      from: fromNumber,
      body,
    });
    return { success: true, sid: message.sid };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Twilio SMS delivery failed.";
    logger.error("SMS delivery failed", { service: "twilio", recipient: to }, err);
    return { success: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// Webhook signature verification
// ---------------------------------------------------------------------------

/**
 * Validates that an incoming request was genuinely sent by Twilio by
 * checking the `X-Twilio-Signature` header against the request URL and
 * form parameters using the TWILIO_AUTH_TOKEN.
 *
 * Returns `true` when the signature is valid, `false` otherwise.
 */
export async function validateTwilioWebhook(
  req: NextRequest,
  body: Record<string, string>,
): Promise<boolean> {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    logger.error("TWILIO_AUTH_TOKEN not set — cannot verify webhook", { service: "twilio" });
    return false;
  }

  const signature = req.headers.get("x-twilio-signature");
  if (!signature) {
    return false;
  }

  // Twilio validates against the full public URL of the webhook endpoint.
  const url = req.url;

  return twilio.validateRequest(authToken, signature, url, body);
}
