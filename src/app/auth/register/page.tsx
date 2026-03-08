"use client";

import { useState } from "react";
import { getBrowserClient } from "@/lib/supabase/browser";
import { provisionTenant } from "./actions";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);

    if (password.length < 6) {
      setErrorMsg("Password must be at least 6 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setErrorMsg("Passwords do not match.");
      return;
    }

    setStatus("loading");

    const supabase = getBrowserClient();
    const { data, error } = await supabase.auth.signUp({ email, password });

    if (error || !data.user) {
      setStatus("error");
      setErrorMsg(error?.message ?? "Sign-up failed. Please try again.");
      return;
    }

    const result = await provisionTenant(data.user.id, email);
    if ("error" in result) {
      setStatus("error");
      setErrorMsg(result.error);
      return;
    }

    window.location.href = "/checkout";
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-950 px-5 py-10">
      <div className="mb-8 text-center">
        <div className="text-6xl mb-3">🔧</div>
        <h1 className="text-3xl font-black text-white tracking-tight">
          DriveSync
        </h1>
        <p className="mt-1 text-sm text-gray-400">
          Create your account to get started
        </p>
      </div>

      <div className="w-full max-w-sm">
        <form onSubmit={handleRegister} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-gray-400">
              Email
            </label>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@garage.com"
              className="w-full rounded-xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-white placeholder-gray-600 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-gray-400">
              Password
            </label>
            <input
              type="password"
              required
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min. 6 characters"
              className="w-full rounded-xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-white placeholder-gray-600 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-gray-400">
              Confirm Password
            </label>
            <input
              type="password"
              required
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter your password"
              className="w-full rounded-xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-white placeholder-gray-600 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
            />
          </div>

          {errorMsg && (
            <div className="rounded-xl border border-red-700 bg-red-900/50 px-4 py-3 text-sm text-red-300">
              {errorMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={status === "loading"}
            className="flex min-h-[52px] w-full items-center justify-center rounded-xl bg-red-600 text-sm font-black uppercase tracking-wide text-white transition-all hover:bg-red-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950"
          >
            {status === "loading" ? (
              <svg
                className="h-5 w-5 animate-spin"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v8H4z"
                />
              </svg>
            ) : (
              "Create Account →"
            )}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-gray-500">
          Already have an account?{" "}
          <a
            href="/auth/login"
            className="text-red-400 hover:text-red-300 transition-colors"
          >
            Sign in
          </a>
        </p>
      </div>
    </div>
  );
}
