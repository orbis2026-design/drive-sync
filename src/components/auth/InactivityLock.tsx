"use client";

/**
 * InactivityLock (Issue #101)
 *
 * Wraps the mechanic app with an automatic security lock screen that activates
 * when the app has been idle for 45 minutes, or after the tab/PWA has been
 * in the background for 5 minutes (quick tab switches do not lock immediately).
 *
 * Once locked, the overlay is un-dismissible by touch alone — the user must
 * verify physical presence via the WebAuthn (FaceID / TouchID) API before the
 * app content becomes visible again.
 *
 * Usage:
 *   Render <InactivityLock> as a wrapper inside the authenticated (app) layout.
 *   All mechanic-facing children are rendered as `children` beneath the overlay
 *   so the blur effect actually covers real content.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { getBrowserClient } from "@/lib/supabase/browser";
import { useLockSettings } from "@/contexts/LockSettingsContext";

/** Activity events that reset the idle timer. */
const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = [
  "mousemove",
  "mousedown",
  "keydown",
  "touchstart",
  "scroll",
  "pointerdown",
];

// ---------------------------------------------------------------------------
// WebAuthn helper — triggers a platform authenticator assertion (biometric)
// ---------------------------------------------------------------------------

/**
 * Requests a fresh cryptographic challenge from the server, invokes the
 * device's biometric authenticator, and cryptographically verifies the
 * resulting assertion server-side.
 *
 * Returns `true` when the assertion is verified, `false` when the user
 * cancels, biometrics fail, or no passkey is registered on this device.
 */
async function verifyWithBiometrics(): Promise<boolean> {
  if (!window.PublicKeyCredential) {
    // WebAuthn not supported in this browser/context — fall back to unlocked.
    return true;
  }

  // Step 1: Fetch a server-issued challenge.
  let challengeId: string;
  let challengeB64: string;
  try {
    const challengeRes = await fetch("/api/auth/webauthn", { method: "GET" });
    if (!challengeRes.ok) {
      console.warn("[InactivityLock] Challenge fetch failed, using local fallback.");
      // Graceful degradation: fall back to a client-side-only challenge.
      return await verifyLocalBiometrics();
    }
    const json = await challengeRes.json() as { challengeId: string; challenge: string };
    challengeId = json.challengeId;
    challengeB64 = json.challenge;
  } catch {
    // Network error — degrade gracefully.
    return await verifyLocalBiometrics();
  }

  // Decode base64url challenge to Uint8Array for the browser API.
  function base64urlToBuffer(b64: string): ArrayBuffer {
    const padded = b64.replace(/-/g, "+").replace(/_/g, "/").padEnd(
      b64.length + ((4 - (b64.length % 4)) % 4),
      "=",
    );
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  }

  function bufferToBase64url(buf: ArrayBuffer): string {
    return btoa(String.fromCharCode(...new Uint8Array(buf)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  }

  // Step 2: Invoke the device biometric/PIN authenticator.
  let assertion: PublicKeyCredential;
  try {
    assertion = (await navigator.credentials.get({
      publicKey: {
        challenge: base64urlToBuffer(challengeB64),
        timeout: 60_000,
        userVerification: "required",
        rpId:
          process.env.NEXT_PUBLIC_WEBAUTHN_RP_ID ?? window.location.hostname,
      },
    })) as PublicKeyCredential;
  } catch {
    // User cancelled or no passkey registered on this device.
    return false;
  }

  if (!assertion) return false;

  const assertionResponse = assertion.response as AuthenticatorAssertionResponse;

  // Step 3: Send the assertion to the server for cryptographic verification.
  try {
    const verifyRes = await fetch("/api/auth/webauthn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        challengeId,
        credentialId: bufferToBase64url(assertion.rawId),
        authenticatorData: bufferToBase64url(assertionResponse.authenticatorData),
        clientDataJSON: bufferToBase64url(assertionResponse.clientDataJSON),
        signature: bufferToBase64url(assertionResponse.signature),
        userHandle: assertionResponse.userHandle
          ? bufferToBase64url(assertionResponse.userHandle)
          : null,
      }),
    });

    if (!verifyRes.ok) return false;
    const { verified } = await verifyRes.json() as { verified: boolean };
    return verified === true;
  } catch {
    return false;
  }
}

/**
 * Local-only biometric fallback used when the server challenge endpoint is
 * unreachable. Verifies physical presence without a server round-trip; does
 * NOT perform cryptographic signature verification.
 */
async function verifyLocalBiometrics(): Promise<boolean> {
  try {
    const credential = await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        timeout: 60_000,
        userVerification: "required",
        rpId: process.env.NEXT_PUBLIC_WEBAUTHN_RP_ID ?? window.location.hostname,
      },
    });
    return credential !== null;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function InactivityLock({
  children,
}: {
  children: React.ReactNode;
}) {
  const [locked, setLocked] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [webAuthnSupported, setWebAuthnSupported] = useState(true);
  const [sessionEmail, setSessionEmail] = useState("");
  const [passwordValue, setPasswordValue] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordUnlocking, setPasswordUnlocking] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hiddenLockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { idleTimeoutMs, hiddenLockDelayMs } = useLockSettings();

  // Detect WebAuthn support and fetch the current user's email on mount.
  useEffect(() => {
    setWebAuthnSupported(typeof window !== "undefined" && !!window.PublicKeyCredential);
    const supabase = getBrowserClient();
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user?.email) setSessionEmail(data.user.email);
    });
  }, []);

  // Start / reset the idle countdown (uses current configurable timeout).
  const resetTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setLocked(true), idleTimeoutMs);
  }, [idleTimeoutMs]);

  // Wire up activity listeners and the visibilitychange handler.
  useEffect(() => {
    // Immediately start the timer on mount.
    resetTimer();

    const onActivity = () => {
      if (!locked) resetTimer();
    };

    // When tab/window goes to background: start a delay before locking (generous for quick tab switches).
    // When tab/window comes back: cancel that delay so we only lock if they were away long enough.
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        if (timerRef.current) clearTimeout(timerRef.current);
        if (hiddenLockTimerRef.current) clearTimeout(hiddenLockTimerRef.current);
        hiddenLockTimerRef.current = setTimeout(() => setLocked(true), hiddenLockDelayMs);
      } else {
        if (hiddenLockTimerRef.current) {
          clearTimeout(hiddenLockTimerRef.current);
          hiddenLockTimerRef.current = null;
        }
        // Idle timer is reset on next activity; if already locked, user must unlock.
      }
    };

    ACTIVITY_EVENTS.forEach((ev) =>
      window.addEventListener(ev, onActivity, { passive: true }),
    );
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (hiddenLockTimerRef.current) clearTimeout(hiddenLockTimerRef.current);
      ACTIVITY_EVENTS.forEach((ev) => window.removeEventListener(ev, onActivity));
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [locked, resetTimer, idleTimeoutMs, hiddenLockDelayMs]);

  // Biometric unlock flow.
  const handleUnlock = useCallback(async () => {
    if (unlocking) return;
    setUnlocking(true);
    try {
      const verified = await verifyWithBiometrics();
      if (verified) {
        setLocked(false);
        resetTimer();
      }
    } finally {
      setUnlocking(false);
    }
  }, [unlocking, resetTimer]);

  // Password unlock flow — only verifies the current session user's credentials.
  const handlePasswordUnlock = useCallback(async () => {
    if (passwordUnlocking) return;
    setPasswordError("");
    setPasswordUnlocking(true);
    try {
      const supabase = getBrowserClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: sessionEmail,
        password: passwordValue,
      });
      if (error) {
        setPasswordError(error.message || "Incorrect password.");
      } else {
        setLocked(false);
        setPasswordValue("");
        setPasswordError("");
        resetTimer();
      }
    } catch {
      setPasswordError("An unexpected error occurred. Please try again.");
    } finally {
      setPasswordUnlocking(false);
    }
  }, [passwordUnlocking, sessionEmail, passwordValue, resetTimer]);

  return (
    <>
      {/* Render children beneath the overlay so the blur works over real content. */}
      <div className={locked ? "pointer-events-none select-none" : undefined}>
        {children}
      </div>

      {/* Lock overlay — only rendered when locked */}
      {locked && (
        <div
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center"
          aria-modal="true"
          role="dialog"
          aria-label="Screen locked"
        >
          {/* Blurred backdrop */}
          <div className="absolute inset-0 bg-gray-950/80 backdrop-blur-xl" />

          {/* Lock card */}
          <div className="relative z-10 flex flex-col items-center gap-6 rounded-2xl border border-gray-700 bg-gray-900 px-10 py-12 shadow-2xl">
            {/* Lock icon */}
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-800 text-4xl">
              🔒
            </div>

            <div className="text-center">
              <p className="text-xl font-bold text-white">Screen Locked</p>
              <p className="mt-1 text-sm text-gray-400">
                Verify your identity to continue.
              </p>
            </div>

            {/* Biometric unlock button — only shown when WebAuthn is supported */}
            {webAuthnSupported && (
              <button
                onClick={handleUnlock}
                disabled={unlocking}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {unlocking ? (
                  <>
                    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Verifying…
                  </>
                ) : (
                  <>
                    <span aria-hidden>👆</span>
                    Tap to Unlock
                  </>
                )}
              </button>
            )}

            {/* Divider between biometric and password options */}
            {webAuthnSupported && (
              <div className="flex w-full items-center gap-3">
                <div className="h-px flex-1 bg-gray-700" />
                <span className="text-xs text-gray-500">or</span>
                <div className="h-px flex-1 bg-gray-700" />
              </div>
            )}

            {/* Password unlock section */}
            <div className="flex w-full flex-col gap-3">
              <p className="text-center text-xs font-medium text-gray-400">
                Unlock with Password
              </p>
              <label htmlFor="lock-email" className="sr-only">Email</label>
              <input
                id="lock-email"
                type="email"
                value={sessionEmail}
                readOnly
                className="w-full rounded-xl border border-gray-700 bg-gray-800 px-4 py-2.5 text-sm text-gray-400 outline-none cursor-not-allowed"
                autoComplete="email"
              />
              <label htmlFor="lock-password" className="sr-only">Password</label>
              <input
                id="lock-password"
                type="password"
                placeholder="Password"
                value={passwordValue}
                onChange={(e) => setPasswordValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); handlePasswordUnlock(); }
                }}
                className="w-full rounded-xl border border-gray-700 bg-gray-900 px-4 py-2.5 text-sm text-white placeholder-gray-500 outline-none ring-inset focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                autoComplete="current-password"
              />
              {passwordError && (
                <p className="text-xs text-red-400">{passwordError}</p>
              )}
              <button
                onClick={handlePasswordUnlock}
                disabled={passwordUnlocking || !sessionEmail || !passwordValue}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gray-700 px-6 py-3 text-sm font-semibold text-white transition hover:bg-gray-600 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {passwordUnlocking ? (
                  <>
                    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Verifying…
                  </>
                ) : (
                  "Unlock"
                )}
              </button>
            </div>

            {webAuthnSupported && (
              <p className="text-xs text-gray-500">
                Use Face ID, Touch ID, or your device PIN to unlock.
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
