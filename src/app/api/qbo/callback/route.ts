/**
 * /api/qbo/callback/route.ts
 *
 * QuickBooks Online OAuth 2.0 callback handler.
 *
 * Flow:
 *   1. Intuit redirects the user back here with ?code=<auth_code>&realmId=<realm>
 *   2. We exchange the code for access + refresh tokens via Intuit's token endpoint
 *   3. Tokens are stored in the tenants table (Supabase, bypassing RLS)
 *   4. User is redirected to the QBO integration settings page
 *
 * Security notes:
 *   • State is stored in qbo_oauth_state (tenant-bound) before redirect and validated
 *     in the callback; consumed once to prevent CSRF and replay.
 *   • Tokens are encrypted at rest when QBO_TOKEN_ENCRYPTION_KEY is set (32-byte hex or base64).
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { encryptToken } from "@/lib/qbo-token-cipher";

const QBO_CLIENT_ID = process.env.QBO_CLIENT_ID ?? "";
const QBO_CLIENT_SECRET = process.env.QBO_CLIENT_SECRET ?? "";
const QBO_REDIRECT_URI =
  process.env.QBO_REDIRECT_URI ??
  `${process.env.NEXT_PUBLIC_PORTAL_BASE_URL ?? ""}/api/qbo/callback`;
const QBO_TOKEN_ENDPOINT = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";

// ---------------------------------------------------------------------------
// Token exchange with Intuit
// ---------------------------------------------------------------------------

interface IntuitTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

async function exchangeCodeForTokens(
  code: string,
): Promise<IntuitTokenResponse> {
  const credentials = Buffer.from(
    `${QBO_CLIENT_ID}:${QBO_CLIENT_SECRET}`,
  ).toString("base64");

  const res = await fetch(QBO_TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: QBO_REDIRECT_URI,
    }).toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed (${res.status}): ${text}`);
  }

  return res.json() as Promise<IntuitTokenResponse>;
}

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);

  const code = searchParams.get("code");
  const realmId = searchParams.get("realmId");
  const error = searchParams.get("error");

  // Handle user-denied or error cases
  if (error) {
    logger.error("OAuth error", { service: "quickbooks" }, error);
    return NextResponse.redirect(
      new URL(
        `/accounting/qbo?error=${encodeURIComponent(error)}`,
        req.url,
      ),
    );
  }

  const state = searchParams.get("state");
  if (!code || !realmId || !state) {
    return NextResponse.redirect(
      new URL("/accounting/qbo?error=missing_params", req.url),
    );
  }

  // CSRF: validate state was issued by us for this session and consume once
  const tenantId = await getTenantId();
  if (!tenantId) {
    return NextResponse.redirect(
      new URL("/accounting/qbo?error=authentication_required", req.url),
    );
  }

  const admin = createAdminClient();
  const { data: stateRow, error: stateError } = await admin
    .from("qbo_oauth_state")
    .select("tenant_id, created_at")
    .eq("state", state)
    .single();

  if (stateError || !stateRow) {
    logger.warn("QBO callback: invalid or reused state", { service: "quickbooks" });
    return NextResponse.redirect(
      new URL("/accounting/qbo?error=invalid_state", req.url),
    );
  }

  if (stateRow.tenant_id !== tenantId) {
    logger.warn("QBO callback: state tenant mismatch", { service: "quickbooks" });
    return NextResponse.redirect(
      new URL("/accounting/qbo?error=invalid_state", req.url),
    );
  }

  const createdAt = new Date(stateRow.created_at as string).getTime();
  const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
  if (createdAt < tenMinutesAgo) {
    return NextResponse.redirect(
      new URL("/accounting/qbo?error=state_expired", req.url),
    );
  }

  await admin.from("qbo_oauth_state").delete().eq("state", state);

  try {
    if (!QBO_CLIENT_ID || !QBO_CLIENT_SECRET) {
      return NextResponse.redirect(
        new URL("/accounting/qbo?error=qbo_not_configured", req.url),
      );
    }

    const tokens = await exchangeCodeForTokens(code);
    const accessToken = tokens.access_token;
    const refreshToken = tokens.refresh_token;

    // tenantId already resolved above during state validation

    // Persist tokens (encrypted at rest when QBO_TOKEN_ENCRYPTION_KEY is set)
    const { error: dbError } = await admin
      .from("tenants")
      .update({
        qbo_realm_id: realmId,
        qbo_access_token: encryptToken(accessToken),
        qbo_refresh_token: encryptToken(refreshToken),
      })
      .eq("id", tenantId);

    if (dbError) {
      logger.error("Failed to store OAuth tokens", { service: "quickbooks", tenantId }, dbError);
      return NextResponse.redirect(
        new URL("/accounting/qbo?error=db_write_failed", req.url),
      );
    }

    // Redirect to the QBO settings page with success indicator
    return NextResponse.redirect(
      new URL("/accounting/qbo?connected=1", req.url),
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    logger.error("OAuth callback failed", { service: "quickbooks" }, err);
    return NextResponse.redirect(
      new URL(
        `/accounting/qbo?error=${encodeURIComponent(msg)}`,
        req.url,
      ),
    );
  }
}
