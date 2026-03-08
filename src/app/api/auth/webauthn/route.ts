/**
 * /api/auth/webauthn
 *
 * Cryptographic WebAuthn challenge/assertion endpoints (Issue #105).
 *
 * GET  /api/auth/webauthn  — Generate a server-side challenge.
 *   Returns: { challengeId: string; challenge: string (base64url) }
 *
 * POST /api/auth/webauthn  — Verify a WebAuthn assertion against the stored
 *   public key for the credential ID supplied in the request body.
 *   Body: { challengeId, credentialId, authenticatorData, clientDataJSON,
 *            signature, userHandle? }
 *   Returns: { verified: boolean }
 *
 * Security notes:
 *   • Challenges expire after 90 seconds.
 *   • Each challenge is single-use; it is deleted from the in-memory store
 *     immediately after a verification attempt (pass or fail).
 *   • Verification uses @simplewebauthn/server for full cryptographic check.
 *
 * Environment variables:
 *   NEXT_PUBLIC_WEBAUTHN_RP_ID  — relying-party domain (default: localhost)
 *   NEXT_PUBLIC_SITE_URL        — base URL used to derive the expected origin
 *   NEXT_PUBLIC_SUPABASE_URL    — needed by createAdminClient for credential lookup
 *   SUPABASE_SERVICE_ROLE_KEY   — service-role key (bypasses RLS for passkey lookup)
 */

import { NextRequest, NextResponse } from "next/server";
import {
  verifyAuthenticationResponse,
  type VerifyAuthenticationResponseOpts,
} from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// In-memory challenge store
// ---------------------------------------------------------------------------

interface ChallengeEntry {
  challenge: Uint8Array<ArrayBuffer>;
  expiresAt: number;
}

const _challenges = new Map<string, ChallengeEntry>();

/** Challenge lifetime in milliseconds. */
const CHALLENGE_TTL_MS = 90_000;

/** Remove expired challenges to prevent unbounded growth. */
function pruneExpiredChallenges() {
  const now = Date.now();
  for (const [id, entry] of _challenges) {
    if (entry.expiresAt < now) _challenges.delete(id);
  }
}

// ---------------------------------------------------------------------------
// GET — generate challenge
// ---------------------------------------------------------------------------

export async function GET(): Promise<NextResponse> {
  pruneExpiredChallenges();

  // Generate a cryptographically random 32-byte challenge.
  const challengeBytes = new Uint8Array(
    crypto.getRandomValues(new Uint8Array(32)).buffer as ArrayBuffer,
  );

  // Unique opaque ID the client echoes back in the POST body.
  const challengeId = isoBase64URL.fromBuffer(
    new Uint8Array(crypto.getRandomValues(new Uint8Array(16)).buffer as ArrayBuffer),
  );

  _challenges.set(challengeId, {
    challenge: challengeBytes,
    expiresAt: Date.now() + CHALLENGE_TTL_MS,
  });

  return NextResponse.json({
    challengeId,
    challenge: isoBase64URL.fromBuffer(challengeBytes),
  });
}

// ---------------------------------------------------------------------------
// POST — verify assertion
// ---------------------------------------------------------------------------

interface AssertionBody {
  challengeId?: string;
  credentialId?: string;
  authenticatorData?: string;
  clientDataJSON?: string;
  signature?: string;
  userHandle?: string | null;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: AssertionBody;
  try {
    body = await req.json() as AssertionBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const {
    challengeId,
    credentialId,
    authenticatorData,
    clientDataJSON,
    signature,
    userHandle,
  } = body;

  if (!challengeId || !credentialId || !authenticatorData || !clientDataJSON || !signature) {
    return NextResponse.json(
      { error: "Missing required assertion fields." },
      { status: 400 },
    );
  }

  // --- Retrieve and consume the challenge -----------------------------------
  const entry = _challenges.get(challengeId);
  _challenges.delete(challengeId); // single-use

  if (!entry) {
    return NextResponse.json(
      { error: "Challenge not found or already used." },
      { status: 400 },
    );
  }

  if (entry.expiresAt < Date.now()) {
    return NextResponse.json(
      { error: "Challenge has expired. Please request a new one." },
      { status: 400 },
    );
  }

  // --- Look up the stored public key for this credential -------------------
  const admin = createAdminClient();
  const { data: passkey, error: dbError } = await admin
    .from("user_passkeys")
    .select("public_key_der, credential_id")
    .eq("credential_id", credentialId)
    .maybeSingle();

  if (dbError) {
    console.error("[webauthn] DB error looking up passkey:", dbError.message);
    return NextResponse.json({ error: "Database error." }, { status: 500 });
  }

  if (!passkey) {
    return NextResponse.json(
      { error: "Passkey not found. Register a passkey first." },
      { status: 404 },
    );
  }

  // --- Cryptographically verify the assertion -------------------------------
  const rpId =
    process.env.NEXT_PUBLIC_WEBAUTHN_RP_ID ?? "localhost";

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.NEXTAUTH_URL ??
    "http://localhost:3000";

  const expectedOrigin = new URL(siteUrl).origin;

  const opts: VerifyAuthenticationResponseOpts = {
    response: {
      id: credentialId,
      rawId: credentialId,
      response: {
        authenticatorData,
        clientDataJSON,
        signature,
        userHandle: userHandle ?? undefined,
      },
      type: "public-key",
      clientExtensionResults: {},
    },
    expectedChallenge: isoBase64URL.fromBuffer(entry.challenge),
    expectedOrigin,
    expectedRPID: rpId,
    credential: {
      id: passkey.credential_id as string,
      publicKey: isoBase64URL.toBuffer(passkey.public_key_der as string),
      counter: 0,
    },
  };

  let verified = false;
  try {
    const result = await verifyAuthenticationResponse(opts);
    verified = result.verified;
  } catch (err) {
    console.error("[webauthn] Assertion verification failed:", err);
    return NextResponse.json({ verified: false }, { status: 200 });
  }

  return NextResponse.json({ verified });
}
