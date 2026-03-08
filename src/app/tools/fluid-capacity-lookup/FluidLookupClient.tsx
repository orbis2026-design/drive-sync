"use client";

import { useState } from "react";
import Link from "next/link";

type LookupResult =
  | {
      found: true;
      make: string;
      model: string;
      year: number;
      oilCapacityQts: number | null;
      oilWeightOem: string | null;
      oilFilterPartNote: string;
    }
  | { found: false };

const BLUR_ROWS = [
  "Transmission Fluid",
  "Engine Coolant",
  "Brake Fluid",
  "Power Steering Fluid",
];

export function FluidLookupClient() {
  const [year, setYear] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LookupResult | null>(null);

  async function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    if (!year || !make || !model) return;
    setLoading(true);
    setResult(null);
    try {
      const params = new URLSearchParams({ make, model, year });
      const res = await fetch(`/api/lexicon/public-lookup?${params}`);
      const data = (await res.json()) as LookupResult;
      setResult(data);
    } catch {
      setResult({ found: false });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl px-4 pb-12">
      {/* Lookup form */}
      <form
        onSubmit={handleLookup}
        className="rounded-2xl border border-gray-800 bg-gray-900 p-6"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label
              htmlFor="year"
              className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-gray-400"
            >
              Year
            </label>
            <input
              id="year"
              type="number"
              min={1980}
              max={2030}
              placeholder="2019"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              required
              className="w-full rounded-xl border border-gray-700 bg-gray-800 px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:border-red-500 focus:outline-none"
            />
          </div>
          <div>
            <label
              htmlFor="make"
              className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-gray-400"
            >
              Make
            </label>
            <input
              id="make"
              type="text"
              placeholder="Toyota"
              value={make}
              onChange={(e) => setMake(e.target.value)}
              required
              className="w-full rounded-xl border border-gray-700 bg-gray-800 px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:border-red-500 focus:outline-none"
            />
          </div>
          <div>
            <label
              htmlFor="model"
              className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-gray-400"
            >
              Model
            </label>
            <input
              id="model"
              type="text"
              placeholder="Camry"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              required
              className="w-full rounded-xl border border-gray-700 bg-gray-800 px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:border-red-500 focus:outline-none"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="mt-5 w-full rounded-xl bg-red-600 py-3 text-sm font-black text-white transition-colors hover:bg-red-500 disabled:opacity-60"
        >
          {loading ? (
            <span className="inline-flex items-center gap-2">
              <svg
                className="h-4 w-4 animate-spin"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
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
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              Looking up…
            </span>
          ) : (
            "Look Up"
          )}
        </button>
      </form>

      {/* Results */}
      {result !== null && (
        <div className="mt-6">
          {result.found ? (
            <div className="rounded-2xl border border-gray-800 bg-gray-900 p-6">
              <p className="mb-4 text-sm font-bold uppercase tracking-wide text-gray-500">
                {result.year} {result.make} {result.model}
              </p>

              <div className="space-y-3">
                <div className="flex items-center gap-3 rounded-xl bg-gray-800 px-4 py-3">
                  <span className="text-green-400" aria-hidden="true">
                    ✅
                  </span>
                  <div>
                    <p className="text-xs text-gray-500">Engine Oil Capacity</p>
                    <p className="text-base font-bold text-white">
                      {result.oilCapacityQts != null
                        ? `${result.oilCapacityQts} quarts`
                        : "N/A"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 rounded-xl bg-gray-800 px-4 py-3">
                  <span className="text-green-400" aria-hidden="true">
                    ✅
                  </span>
                  <div>
                    <p className="text-xs text-gray-500">OEM Oil Weight</p>
                    <p className="text-base font-bold text-white">
                      {result.oilWeightOem ?? "N/A"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Blurred upsell section */}
              <div className="relative mt-4">
                {/* Blurred fake rows */}
                <div
                  className="space-y-3 rounded-xl"
                  style={{ filter: "blur(4px)", pointerEvents: "none" }}
                  aria-hidden="true"
                >
                  {BLUR_ROWS.map((label) => (
                    <div
                      key={label}
                      className="flex items-center gap-3 rounded-xl bg-gray-800 px-4 py-3"
                    >
                      <span className="text-gray-400">🔒</span>
                      <div>
                        <p className="text-xs text-gray-500">{label}</p>
                        <p className="text-base font-bold text-gray-400">
                          ████████
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* CTA overlay */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-full rounded-2xl border border-red-800/60 bg-gray-950/95 p-5 text-center shadow-xl">
                    <p className="text-lg font-black text-white">
                      🔒 Unlock All Specs
                    </p>
                    <p className="mt-1 text-sm text-gray-400">
                      Transmission fluid, coolant intervals, torque specs, and
                      TSBs — all inside DriveSync.
                    </p>
                    <Link
                      href="/auth/register"
                      className="mt-4 inline-flex items-center justify-center rounded-xl bg-red-600 px-6 py-2.5 text-sm font-black text-white hover:bg-red-500"
                    >
                      Start Free Trial — Unlock Everything
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-gray-800 bg-gray-900 p-6 text-center">
              <p className="text-base font-semibold text-gray-300">
                Vehicle not found in our database yet.
              </p>
              <p className="mt-1 text-sm text-gray-500">
                We add new vehicles weekly. Check back soon.
              </p>
              <Link
                href="/auth/register"
                className="mt-5 inline-flex items-center justify-center rounded-xl border border-gray-700 bg-gray-800 px-6 py-2.5 text-sm font-semibold text-gray-300 hover:border-red-700 hover:text-white"
              >
                Get notified when we add your vehicle →
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
