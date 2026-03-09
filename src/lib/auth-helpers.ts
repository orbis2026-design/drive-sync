/**
 * auth-helpers.ts
 *
 * WebAuthn / Passkey registration and authentication helpers built on top of
 * the native browser WebAuthn API (@see https://developer.mozilla.org/en-US/docs/Web/API/Web_Authentication_API).
 *
 * Supabase does not yet expose first-party passkey helpers in the JS SDK for
 * all targets, so we implement the full WebAuthn ceremony here:
 *   1. Registration — navigator.credentials.create() stores a passkey on the
 *      device and the public key is persisted in Supabase (`user_passkeys` table).
 *   2. Authentication — navigator.credentials.get() produces an assertion that
 *      is verified server-side via the stored public key.
 *
 * This module is CLIENT-SIDE ONLY — all WebAuthn calls require a browser.
 */

import { getBrowserClient } from "@/lib/supabase/browser";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Maximum length of the device label stored alongside a passkey credential.
 *  Truncated from navigator.userAgent to keep the column size reasonable. */
const DEVICE_LABEL_MAX_LENGTH = 120;

// ─── Supabase browser client ──────────────────────────────────────────────────

// ─── Constants ────────────────────────────────────────────────────────────────

// ─── Encoding helpers ─────────────────────────────────────────────────────────

function bufferToBase64(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

function base64ToBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/** Convert a base64url string (used by @simplewebauthn/server) to an ArrayBuffer. */
function base64urlToBuffer(base64url: string): ArrayBuffer {
  // Replace base64url chars with standard base64 chars and add padding.
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(
    base64.length + ((4 - (base64.length % 4)) % 4),
    "=",
  );
  return base64ToBuffer(padded);
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type AuthResult =
  | { success: true; userId: string }
  | { success: false; error: string };

// ─── Email / Password login (fallback) ───────────────────────────────────────

export async function signInWithEmailPassword(
  email: string,
  password: string
): Promise<AuthResult> {
  const supabase = getBrowserClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    return { success: false, error: error?.message ?? "Sign-in failed" };
  }

  return { success: true, userId: data.user.id };
}

// ─── Passkey Registration ─────────────────────────────────────────────────────

/**
 * Registers the current device's biometric authenticator for the signed-in user.
 * Stores the public key credential in Supabase so future logins can use it.
 */
export async function registerPasskey(): Promise<AuthResult> {
  if (!window.PublicKeyCredential) {
    return {
      success: false,
      error: "WebAuthn is not supported in this browser.",
    };
  }

  const supabase = getBrowserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      success: false,
      error: "You must be signed in before registering a passkey.",
    };
  }

  const challenge = crypto.getRandomValues(new Uint8Array(32));

  let credential: PublicKeyCredential;
  try {
    credential = (await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: {
          name: "DriveSync",
          id: window.location.hostname,
        },
        user: {
          id: new TextEncoder().encode(user.id),
          name: user.email ?? user.id,
          displayName: user.email ?? "DriveSync Mechanic",
        },
        pubKeyCredParams: [
          { alg: -7, type: "public-key" },   // ES256
          { alg: -257, type: "public-key" },  // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          requireResidentKey: true,
          userVerification: "required",
        },
        timeout: 60_000,
        attestation: "none",
      },
    })) as PublicKeyCredential;
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Passkey registration cancelled.",
    };
  }

  const response = credential.response as AuthenticatorAttestationResponse;
  const credentialId = bufferToBase64(credential.rawId);
  const publicKeyDer = bufferToBase64(response.getPublicKey()!);

  // Persist the credential in Supabase so future logins can verify the assertion
  const { error: insertError } = await supabase.from("user_passkeys").insert({
    user_id: user.id,
    credential_id: credentialId,
    public_key_der: publicKeyDer,
    device_label: navigator.userAgent.slice(0, DEVICE_LABEL_MAX_LENGTH),
    created_at: new Date().toISOString(),
  });

  if (insertError) {
    return { success: false, error: insertError.message };
  }

  return { success: true, userId: user.id };
}

// ─── Passkey Authentication ───────────────────────────────────────────────────

/**
 * Authenticates using a stored passkey.
 *
 * Flow:
 *  1. Fetches a server-issued challenge from GET /api/auth/webauthn.
 *  2. Invokes navigator.credentials.get() with the server challenge.
 *  3. Posts the assertion to POST /api/auth/webauthn, which verifies it and
 *     returns a one-time token_hash tied to the user's email.
 *  4. Exchanges the token_hash for a Supabase session via verifyOtp(), which
 *     causes @supabase/ssr to write the session cookies that the middleware
 *     requires on every subsequent request.
 */
export async function signInWithPasskey(): Promise<AuthResult> {
  if (!window.PublicKeyCredential) {
    return {
      success: false,
      error: "WebAuthn is not supported in this browser.",
    };
  }

  // --- Step 1: Fetch a server-issued challenge ----------------------------
  let challengeId: string;
  let challengeBuffer: ArrayBuffer;
  try {
    const challengeRes = await fetch("/api/auth/webauthn");
    if (!challengeRes.ok) {
      return { success: false, error: "Failed to fetch WebAuthn challenge." };
    }
    const { challengeId: id, challenge } = (await challengeRes.json()) as {
      challengeId: string;
      challenge: string;
    };
    challengeId = id;
    challengeBuffer = base64urlToBuffer(challenge);
  } catch (err) {
    return {
      success: false,
      error:
        err instanceof Error ? err.message : "Failed to fetch WebAuthn challenge.",
    };
  }

  // --- Step 2: Prompt the user to authenticate with their passkey ----------
  let assertion: PublicKeyCredential;
  try {
    assertion = (await navigator.credentials.get({
      publicKey: {
        challenge: challengeBuffer,
        rpId: window.location.hostname,
        userVerification: "required",
        timeout: 60_000,
      },
    })) as PublicKeyCredential;
  } catch (err) {
    return {
      success: false,
      error:
        err instanceof Error ? err.message : "Passkey authentication cancelled.",
    };
  }

  const assertionResponse = assertion.response as AuthenticatorAssertionResponse;

  // --- Step 3: Verify the assertion server-side and receive a session token -
  const res = await fetch("/api/auth/webauthn", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      challengeId,
      credentialId: bufferToBase64(assertion.rawId),
      authenticatorData: bufferToBase64(assertionResponse.authenticatorData),
      clientDataJSON: bufferToBase64(assertionResponse.clientDataJSON),
      signature: bufferToBase64(assertionResponse.signature),
      userHandle: assertionResponse.userHandle
        ? bufferToBase64(assertionResponse.userHandle)
        : null,
    }),
  });

  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    return {
      success: false,
      error: (json as { error?: string }).error ?? "Passkey verification failed.",
    };
  }

  const data = (await res.json()) as {
    verified: boolean;
    session?: { token_hash: string; email: string };
    error?: string;
  };

  if (!data.verified || !data.session) {
    return {
      success: false,
      error: data.error ?? "Passkey verification failed.",
    };
  }

  // --- Step 4: Exchange token for a Supabase session ----------------------
  // verifyOtp() causes @supabase/ssr to write session cookies, making the
  // session visible to the middleware and all server-side code.
  const supabase = getBrowserClient();
  const { data: otpData, error: otpError } = await supabase.auth.verifyOtp({
    token_hash: data.session.token_hash,
    type: "magiclink",
  });

  if (otpError || !otpData.user) {
    return {
      success: false,
      error: otpError?.message ?? "Failed to establish session.",
    };
  }

  return { success: true, userId: otpData.user.id };
}

// ─── Sign out ─────────────────────────────────────────────────────────────────

export async function signOut(): Promise<void> {
  const supabase = getBrowserClient();
  await supabase.auth.signOut();
}

// Re-export so consumers only need to import from auth-helpers
export { base64ToBuffer, bufferToBase64, getBrowserClient as getSupabaseBrowserClient };
