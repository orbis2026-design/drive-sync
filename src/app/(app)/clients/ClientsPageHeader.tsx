"use client";

/**
 * Clients page header with Add client and Import buttons + modals.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/app/(app)/intake/client-search-actions";

export function ClientsPageHeader() {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [isCommercialFleet, setIsCommercialFleet] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function openAdd() {
    setError(null);
    setFirstName("");
    setLastName("");
    setPhone("");
    setEmail("");
    setIsCommercialFleet(false);
    setAddOpen(true);
  }

  function handleAddSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createClient({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
        isCommercialFleet,
      });
      if ("error" in result) {
        setError(result.error);
      } else {
        setAddOpen(false);
        router.refresh();
      }
    });
  }

  return (
    <>
      <header className="px-4 pt-6 pb-2 flex flex-col gap-4">
        <div>
          <h1 className="text-4xl font-black text-white tracking-tight">
            Clients
          </h1>
          <p className="text-base text-gray-400 mt-1">
            Tap a card to see vehicles &amp; maintenance alerts.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={openAdd}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-400 px-4 py-2.5 text-sm font-bold text-gray-950 hover:bg-brand-300 active:scale-[0.98] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950"
          >
            <span aria-hidden>＋</span>
            Add client
          </button>
          <button
            type="button"
            onClick={() => setImportOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-600 bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 active:scale-[0.98] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950"
          >
            <span aria-hidden>📥</span>
            Import
          </button>
        </div>
      </header>

      {/* Add client modal */}
      {addOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          aria-modal="true"
          role="dialog"
          aria-labelledby="add-client-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-gray-700 bg-gray-900 p-6 shadow-xl">
            <h2 id="add-client-title" className="text-xl font-bold text-white mb-4">
              Add client
            </h2>
            <form onSubmit={handleAddSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1">
                    First name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Jane"
                    className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1">
                    Last name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Smith"
                    className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-400"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1">
                  Phone <span className="text-red-500">*</span>
                </label>
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+1 (555) 000-0000"
                  className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-400"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1">
                  Email (optional)
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="jane@example.com"
                  className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-400"
                />
              </div>
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isCommercialFleet}
                  onChange={(e) => setIsCommercialFleet(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-600 bg-gray-800 accent-brand-400"
                />
                <span className="text-sm text-gray-300">Commercial fleet account</span>
              </label>
              {error && (
                <p role="alert" className="text-sm text-red-400 font-medium">
                  {error}
                </p>
              )}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAddOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border border-gray-600 text-sm font-semibold text-gray-300 hover:bg-gray-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="flex-1 py-2.5 rounded-xl bg-brand-400 text-gray-950 text-sm font-bold hover:bg-brand-300 active:scale-[0.98] disabled:opacity-50 transition-all"
                >
                  {isPending ? "Creating…" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Import placeholder modal — future: CSV and legacy shop system formats */}
      {importOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          aria-modal="true"
          role="dialog"
          aria-labelledby="import-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-gray-700 bg-gray-900 p-6 shadow-xl">
            <h2 id="import-title" className="text-xl font-bold text-white mb-2">
              Import clients
            </h2>
            <p className="text-sm text-gray-400 mb-4">
              Coming soon. We&apos;ll support CSV and other formats from legacy shop systems and integrations.
            </p>
            <button
              type="button"
              onClick={() => setImportOpen(false)}
              className="w-full py-2.5 rounded-xl border border-gray-600 text-sm font-semibold text-gray-300 hover:bg-gray-800 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}
