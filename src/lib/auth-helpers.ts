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
 * On success, exchanges the verified assertion for a Supabase session via a
 * custom endpoint (`/api/auth/passkey-verify`), which issues a JWT.
 */
export async function signInWithPasskey(): Promise<AuthResult> {
  if (!window.PublicKeyCredential) {
    return {
      success: false,
      error: "WebAuthn is not supported in this browser.",
    };
  }

  const challenge = crypto.getRandomValues(new Uint8Array(32));

  let assertion: PublicKeyCredential;
  try {
    assertion = (await navigator.credentials.get({
      publicKey: {
        challenge,
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

  // Send the assertion to our verification endpoint
  const res = await fetch("/api/auth/passkey-verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
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

  const { userId } = (await res.json()) as { userId: string };
  return { success: true, userId };
}

// ─── Sign out ─────────────────────────────────────────────────────────────────

export async function signOut(): Promise<void> {
  const supabase = getBrowserClient();
  await supabase.auth.signOut();
}

// Re-export so consumers only need to import from auth-helpers
export { base64ToBuffer, bufferToBase64, getBrowserClient as getSupabaseBrowserClient };
