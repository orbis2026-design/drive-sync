"use client";

import { useState } from "react";
import type { OpsContext, TenantSummary } from "./actions";
import { switchTenantForCurrentUser } from "./actions";

const OPERATOR_CODE = "577904";

export function OpsClient({
  context,
  tenants,
}: {
  context: OpsContext;
  tenants: TenantSummary[];
}) {
  const [code, setCode] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    if (code.trim() === OPERATOR_CODE) {
      setUnlocked(true);
      setMessage(null);
    } else {
      setMessage("Invalid operator code.");
    }
  }

  async function handleSwitchTenant(id: string) {
    setIsPending(true);
    setMessage(null);
    const result = await switchTenantForCurrentUser(id);
    if ("error" in result) {
      setMessage(result.error);
    } else {
      setMessage("Tenant switched. Reloading…");
      window.location.reload();
    }
    setIsPending(false);
  }

  if (!unlocked) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
        <div className="w-full max-w-sm rounded-2xl border border-gray-800 bg-gray-900 px-6 py-6 space-y-4">
          <h1 className="text-xl font-black text-white">
            Operator Panel Lock
          </h1>
          <p className="text-sm text-gray-400">
            Enter the 6‑digit operator code to access debug tools.
          </p>
          <form onSubmit={handleUnlock} className="space-y-3">
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-center text-lg tracking-[0.4em] text-white placeholder:text-gray-600 focus:outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-400"
              placeholder="••••••"
            />
            <button
              type="submit"
              className="w-full rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-bold text-gray-950 hover:bg-brand-400"
            >
              Unlock
            </button>
          </form>
          {message && (
            <p className="text-xs text-danger-400 font-medium">{message}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white px-4 py-6">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <header className="flex flex-col gap-1">
          <h1 className="text-3xl font-black">Operator Panel</h1>
          <p className="text-sm text-gray-400">
            Debug and development tools. Use with care.
          </p>
        </header>

        <section className="rounded-xl border border-gray-800 bg-gray-900 p-4 space-y-2">
          <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500">
            Session Context
          </h2>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-y-1 text-sm text-gray-300">
            <div>
              <dt className="text-gray-500 text-xs uppercase tracking-wide">
                User ID
              </dt>
              <dd className="font-mono break-all">{context.userId}</dd>
            </div>
            <div>
              <dt className="text-gray-500 text-xs uppercase tracking-wide">
                Role
              </dt>
              <dd>{context.role}</dd>
            </div>
            <div>
              <dt className="text-gray-500 text-xs uppercase tracking-wide">
                Current Tenant
              </dt>
              <dd className="font-mono break-all">
                {context.tenantId ?? "null"}
              </dd>
            </div>
          </dl>
        </section>

        <section className="rounded-xl border border-gray-800 bg-gray-900 p-4 space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500">
            Tenant Switcher
          </h2>
          <p className="text-xs text-gray-400">
            Switch the current user&apos;s tenant assignment in{" "}
            <span className="font-mono">user_roles</span>. This affects which
            clients, jobs, and work orders you see.
          </p>
          <div className="border border-gray-800 rounded-lg divide-y divide-gray-800">
            {tenants.map((t) => {
              const isCurrent = t.id === context.tenantId;
              return (
                <div
                  key={t.id}
                  className="flex items-center justify-between gap-3 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{t.name}</p>
                    <p className="text-xs text-gray-500 font-mono truncate">
                      {t.id}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={isCurrent || isPending}
                    onClick={() => handleSwitchTenant(t.id)}
                    className={[
                      "px-3 py-1.5 rounded-lg text-xs font-bold",
                      isCurrent
                        ? "bg-gray-800 text-gray-400 cursor-default"
                        : "bg-brand-500 text-gray-950 hover:bg-brand-400 disabled:opacity-50",
                    ].join(" ")}
                  >
                    {isCurrent ? "Current" : "Switch"}
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        {message && (
          <p className="text-xs text-gray-300 font-mono">{message}</p>
        )}
      </div>
    </div>
  );
}

