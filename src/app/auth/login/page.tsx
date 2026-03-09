"use client";

import { useState } from "react";
import {
  signInWithPasskey,
  signInWithEmailPassword,
  registerPasskey,
  type AuthResult,
} from "@/lib/auth-helpers";

// ─── Types ────────────────────────────────────────────────────────────────────

type Mode = "login" | "register-passkey";

/**
 * Brief pause (ms) after a successful sign-in before triggering a hard
 * navigation.  @supabase/ssr writes session cookies synchronously in the
 * SDK callback, but the browser may flush cookie storage slightly after the
 * Promise resolves.  This small delay ensures the middleware's cookie check
 * on the next request finds a valid session.
 */
const SESSION_COOKIE_WRITE_DELAY_MS = 300;

// ─── Main component ───────────────────────────────────────────────────────────

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [message, setMessage] = useState("");

  // ── Handlers ───────────────────────────────────────────────────────────────

  async function handlePasskeyLogin() {
    setStatus("loading");
    setMessage("");
    const result: AuthResult = await signInWithPasskey();
    if (result.success) {
      setStatus("success");
      setMessage("Authenticated! Redirecting…");
      // Brief pause to ensure @supabase/ssr has fully written the session
      // cookies before the hard navigation triggers the middleware check.
      await new Promise((resolve) => setTimeout(resolve, SESSION_COOKIE_WRITE_DELAY_MS));
      window.location.href = "/jobs";
    } else {
      setStatus("error");
      setMessage(result.error);
    }
  }

  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setMessage("");
    const result: AuthResult = await signInWithEmailPassword(email, password);
    if (result.success) {
      setStatus("success");
      setMessage("Authenticated! Redirecting…");
      // Brief pause to ensure @supabase/ssr has fully written the session
      // cookies before the hard navigation triggers the middleware check.
      await new Promise((resolve) => setTimeout(resolve, SESSION_COOKIE_WRITE_DELAY_MS));
      window.location.href = "/jobs";
    } else {
      setStatus("error");
      setMessage(result.error);
    }
  }

  async function handleRegisterPasskey() {
    setStatus("loading");
    setMessage("");
    const result: AuthResult = await registerPasskey();
    if (result.success) {
      setStatus("success");
      setMessage("✅ Passkey registered! You can now use Face ID / Touch ID.");
    } else {
      setStatus("error");
      setMessage(result.error);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-5 py-10">
      {/* Logo / branding */}
      <div className="mb-8 text-center">
        <div className="text-6xl mb-3">🔧</div>
        <h1 className="text-3xl font-extrabold text-white tracking-tight">
          DriveSync
        </h1>
        <p className="text-gray-400 text-sm mt-1">
          Shop management — built for the driveway
        </p>
      </div>

      {mode === "login" ? (
        <div className="w-full max-w-sm space-y-5">
          {/* ── Primary CTA: Passkey / Biometric ── */}
          <button
            onClick={handlePasskeyLogin}
            disabled={status === "loading"}
            className="w-full py-6 text-xl font-extrabold rounded-2xl bg-amber-500 hover:bg-amber-400 active:scale-95 transition-all text-gray-950 shadow-xl shadow-amber-500/30 disabled:opacity-50 flex items-center justify-center gap-3"
          >
            {status === "loading" ? (
              <span className="animate-spin text-2xl">⚙️</span>
            ) : (
              <span className="text-3xl">🪪</span>
            )}
            Sign in with Passkey / Face ID
          </button>

          <p className="text-center text-xs text-gray-600">
            Uses your device biometrics — no password needed
          </p>

          {/* ── Divider ── */}
          <div className="flex items-center gap-3 my-2">
            <div className="flex-1 h-px bg-gray-800" />
            <span className="text-xs text-gray-600">or</span>
            <div className="flex-1 h-px bg-gray-800" />
          </div>

          {/* ── Fallback: email / password ── */}
          <form onSubmit={handleEmailLogin} className="space-y-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Email</label>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@garage.com"
                className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                Password
              </label>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
            <button
              type="submit"
              disabled={status === "loading"}
              className="w-full py-3 text-sm font-semibold rounded-xl bg-gray-800 hover:bg-gray-700 active:scale-95 transition-all text-white border border-gray-700 disabled:opacity-50"
            >
              Sign in with Email &amp; Password
            </button>
          </form>

          {/* Passkey registration link */}
          <button
            onClick={() => setMode("register-passkey")}
            className="w-full text-center text-xs text-gray-500 hover:text-amber-400 transition-colors mt-2"
          >
            Set up Face ID / Touch ID for this device →
          </button>

          {/* Status message */}
          {message && (
            <div
              className={`rounded-xl px-4 py-3 text-sm font-medium ${
                status === "error"
                  ? "bg-red-900/50 border border-red-700 text-red-300"
                  : "bg-green-900/50 border border-green-700 text-green-300"
              }`}
            >
              {message}
            </div>
          )}
        </div>
      ) : (
        // ── Register passkey screen ──────────────────────────────────────────
        <div className="w-full max-w-sm space-y-5">
          <div className="text-center">
            <div className="text-5xl mb-3">🪪</div>
            <h2 className="text-xl font-bold text-white">
              Register this Device
            </h2>
            <p className="text-gray-400 text-sm mt-2">
              Link your Face ID, Touch ID, or Android Biometrics to your
              DriveSync account. You&apos;ll never type a password in a driveway
              again.
            </p>
          </div>

          <button
            onClick={handleRegisterPasskey}
            disabled={status === "loading"}
            className="w-full py-6 text-xl font-extrabold rounded-2xl bg-amber-500 hover:bg-amber-400 active:scale-95 transition-all text-gray-950 shadow-xl shadow-amber-500/30 disabled:opacity-50 flex items-center justify-center gap-3"
          >
            {status === "loading" ? (
              <span className="animate-spin text-2xl">⚙️</span>
            ) : (
              <span className="text-3xl">✋</span>
            )}
            Register Biometric Authenticator
          </button>

          {message && (
            <div
              className={`rounded-xl px-4 py-3 text-sm font-medium ${
                status === "error"
                  ? "bg-red-900/50 border border-red-700 text-red-300"
                  : "bg-green-900/50 border border-green-700 text-green-300"
              }`}
            >
              {message}
            </div>
          )}

          <button
            onClick={() => {
              setMode("login");
              setStatus("idle");
              setMessage("");
            }}
            className="w-full text-center text-xs text-gray-500 hover:text-amber-400 transition-colors"
          >
            ← Back to sign-in
          </button>
        </div>
      )}
    </div>
  );
}
