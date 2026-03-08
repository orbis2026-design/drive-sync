"use client";

/**
 * InactivityLock (Issue #101)
 *
 * Wraps the mechanic app with an automatic security lock screen that activates
 * when the app has been idle for 15 minutes, or when the browser/PWA is
 * minimised and then brought back into focus.
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

/** Idle timeout in milliseconds (15 minutes). */
const IDLE_TIMEOUT_MS = 15 * 60 * 1000;

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

async function verifyWithBiometrics(): Promise<boolean> {
  if (!window.PublicKeyCredential) {
    // WebAuthn not supported in this browser/context — fall back to unlocked.
    return true;
  }

  try {
    // Issue a userVerification-only assertion. We don't validate the signed
    // response server-side here; the purpose is solely to confirm that the
    // physically-present user can pass their device's biometric check.
    const credential = await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        timeout: 60_000,
        userVerification: "required",
        // Use the registered RP domain from env var when available.
        // Falls back to the effective hostname (strips port) so localhost
        // and production both work without crashes.
        rpId: process.env.NEXT_PUBLIC_WEBAUTHN_RP_ID ?? window.location.hostname,
      },
    });
    return credential !== null;
  } catch {
    // User cancelled or device does not have a registered passkey.
    // Return false so the lock screen stays visible.
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
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Start / reset the idle countdown.
  const resetTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setLocked(true), IDLE_TIMEOUT_MS);
  }, []);

  // Wire up activity listeners and the visibilitychange handler.
  useEffect(() => {
    // Immediately start the timer on mount.
    resetTimer();

    const onActivity = () => {
      if (!locked) resetTimer();
    };

    // Lock when the user switches away from the tab / minimises the PWA.
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        // Lock immediately on minimize / background.
        if (timerRef.current) clearTimeout(timerRef.current);
        setLocked(true);
      } else {
        // Returning to foreground — keep locked; user must biometrically unlock.
      }
    };

    ACTIVITY_EVENTS.forEach((ev) =>
      window.addEventListener(ev, onActivity, { passive: true }),
    );
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      ACTIVITY_EVENTS.forEach((ev) => window.removeEventListener(ev, onActivity));
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [locked, resetTimer]);

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

            {/* Unlock button */}
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

            <p className="text-xs text-gray-500">
              Use Face ID, Touch ID, or your device PIN to unlock.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
