"use client";

/**
 * /auth/callback
 *
 * Landing page for Supabase email-verification (and magic-link / recovery) flows.
 *
 * After a user clicks the confirmation link in their inbox, Supabase redirects
 * them here with a URL fragment that contains the session tokens:
 *   https://<app>/auth/callback#access_token=…&refresh_token=…&type=signup
 *
 * This page:
 *  1. Creates the Supabase browser client with `detectSessionInUrl: true` so
 *     the client automatically reads and persists the session from the hash.
 *  2. Subscribes to `onAuthStateChange` to be notified when the session is ready.
 *  3. Also calls `getSession()` in case the session was processed synchronously
 *     during client initialisation (before the subscription was attached).
 *  4. Redirects to /jobs on success, or shows an actionable error on failure.
 *
 * Configure Supabase → Authentication → URL Configuration →
 *   "Redirect URLs" to include: https://<your-domain>/auth/callback
 */

import { useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase/browser";

// ---------------------------------------------------------------------------
// getBrowserClient() uses @supabase/ssr's createBrowserClient, which
// automatically detects and exchanges session tokens from the URL hash
// (#access_token=…&refresh_token=…) and persists them as cookies so the
// server can read the session on subsequent requests.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type Status = "loading" | "success" | "error";

export default function AuthCallbackPage() {
  const [status, setStatus] = useState<Status>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getBrowserClient();
    let redirected = false;

    function navigateToApp() {
      if (redirected) return;
      redirected = true;
      setStatus("success");
      // Small delay so the session storage write finishes before the page
      // changes — keeps the cookie/localStorage in sync with the new route.
      setTimeout(() => {
        window.location.href = "/jobs";
      }, 600);
    }

    function handleError(msg: string) {
      if (redirected) return;
      setStatus("error");
      setErrorMessage(msg);
    }

    // 1. Subscribe to future auth state changes.
    //    `detectSessionInUrl: true` causes Supabase to fire SIGNED_IN (or
    //    PASSWORD_RECOVERY) as soon as the hash tokens are exchanged.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) {
        navigateToApp();
      } else if (event === "PASSWORD_RECOVERY") {
        // Password-reset flow: the session is established but the user should
        // set a new password. For now redirect to /jobs; a dedicated reset page
        // can be added later.
        navigateToApp();
      } else if (event === "TOKEN_REFRESHED" && session) {
        navigateToApp();
      }
    });

    // 2. Trigger `getSession()` — this is what causes Supabase to actually
    //    parse the URL hash and call setSession() internally.  If the client
    //    already processed the hash synchronously during initialisation (which
    //    can happen depending on the SDK version), this resolves the existing
    //    session so we don't miss the redirect.
    supabase.auth
      .getSession()
      .then(({ data: { session }, error }) => {
        if (error) {
          handleError(error.message);
        } else if (session) {
          navigateToApp();
        }
        // If no session yet, onAuthStateChange will fire when the exchange
        // completes asynchronously.
      })
      .catch((err: unknown) => {
        handleError(
          err instanceof Error ? err.message : "Unexpected error during sign-in.",
        );
      });

    // 3. Fallback: if nothing resolves within 15 s the hash is likely stale or
    //    invalid. Redirect to login so the user isn't left on a blank spinner.
    const timeout = setTimeout(() => {
      if (!redirected) {
        handleError(
          "The confirmation link has expired or was already used. Please sign in or request a new link.",
        );
      }
    }, 15_000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  // --------------------------------------------------------------------------
  // Render — matches the dark design system used by /auth/login
  // --------------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-5 py-10">
      {/* Branding */}
      <div className="mb-10 text-center">
        <div className="text-6xl mb-3">🔧</div>
        <h1 className="text-3xl font-extrabold text-white tracking-tight">
          DriveSync
        </h1>
        <p className="text-gray-400 text-sm mt-1">
          Shop management — built for the driveway
        </p>
      </div>

      <div className="w-full max-w-sm">
        {/* Loading */}
        {status === "loading" && (
          <div className="flex flex-col items-center gap-5">
            <div className="w-14 h-14 rounded-full border-4 border-amber-500 border-t-transparent animate-spin" />
            <div className="text-center">
              <p className="text-white font-bold text-lg">
                Verifying your email…
              </p>
              <p className="text-gray-400 text-sm mt-1">
                Hang tight, establishing your session.
              </p>
            </div>
          </div>
        )}

        {/* Success */}
        {status === "success" && (
          <div className="flex flex-col items-center gap-4">
            <div className="text-6xl">✅</div>
            <div className="text-center">
              <p className="text-white font-bold text-lg">
                Email confirmed!
              </p>
              <p className="text-gray-400 text-sm mt-1">
                Redirecting you to the app…
              </p>
            </div>
            <div className="w-full bg-green-900/50 border border-green-700 rounded-xl px-4 py-3 text-green-300 text-sm text-center">
              Session established. Taking you to your jobs board.
            </div>
          </div>
        )}

        {/* Error */}
        {status === "error" && (
          <div className="flex flex-col gap-5">
            <div className="text-center">
              <div className="text-5xl mb-3">⚠️</div>
              <p className="text-white font-bold text-lg">
                Verification failed
              </p>
            </div>

            <div className="bg-red-900/50 border border-red-700 rounded-xl px-4 py-3 text-red-300 text-sm leading-relaxed">
              {errorMessage}
            </div>

            <a
              href="/auth/login"
              className="w-full py-3 text-sm font-semibold rounded-xl bg-gray-800 hover:bg-gray-700 active:scale-95 transition-all text-white border border-gray-700 text-center block"
            >
              ← Back to Sign In
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
