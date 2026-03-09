"use client";

import { useState, useEffect, useRef } from "react";
import { useToast } from "@/components/Toast";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface RepairManualHubProps {
  workOrderId: string;
  year?: number;
  make?: string;
  model?: string;
}

// ---------------------------------------------------------------------------
// LocalStorage keys
// ---------------------------------------------------------------------------

const LS_ALLDATA = "drivesync_alldata_url";
const LS_MITCHELL = "drivesync_mitchell_url";

// ---------------------------------------------------------------------------
// Settings modal
// ---------------------------------------------------------------------------

function SettingsModal({
  alldataUrl,
  mitchellUrl,
  onSave,
  onClose,
}: {
  alldataUrl: string;
  mitchellUrl: string;
  onSave: (alldata: string, mitchell: string) => void;
  onClose: () => void;
}) {
  const [alldata, setAlldata] = useState(alldataUrl);
  const [mitchell, setMitchell] = useState(mitchellUrl);
  const firstInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus the first field when the modal opens
  useEffect(() => {
    firstInputRef.current?.focus();
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 w-full max-w-md flex flex-col gap-5">
        <h2 className="text-white font-black text-lg">Configure Repair Manuals</h2>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold uppercase tracking-widest text-gray-400">
              ALLDATA SSO URL
            </label>
            <input
              ref={firstInputRef}
              type="url"
              placeholder="https://my.alldata.com/sso?token=..."
              value={alldata}
              onChange={(e) => setAlldata(e.target.value)}
              className="rounded-xl border border-gray-700 bg-gray-900 text-white placeholder-gray-600 focus:border-red-500 focus:ring-1 focus:ring-red-500 px-4 py-3 text-sm"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold uppercase tracking-widest text-gray-400">
              Mitchell ProDemand URL
            </label>
            <input
              type="url"
              placeholder="https://prodemand.mitchell1.com/sso?token=..."
              value={mitchell}
              onChange={(e) => setMitchell(e.target.value)}
              className="rounded-xl border border-gray-700 bg-gray-900 text-white placeholder-gray-600 focus:border-red-500 focus:ring-1 focus:ring-red-500 px-4 py-3 text-sm"
            />
          </div>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 border border-gray-700 text-gray-400 font-bold uppercase tracking-wide rounded-xl py-3 text-sm hover:bg-gray-800 active:scale-95 transition-transform"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSave(alldata, mitchell)}
            className="flex-1 bg-red-600 text-white font-black uppercase tracking-wide rounded-xl py-3 text-sm hover:bg-red-500 active:scale-95 transition-transform"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main export: RepairManualHub
// ---------------------------------------------------------------------------

export function RepairManualHub({
  workOrderId: _workOrderId,
  year,
  make,
  model,
}: RepairManualHubProps) {
  const [alldataUrl, setAlldataUrl] = useState("");
  const [mitchellUrl, setMitchellUrl] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { showToast, toastElement } = useToast();

  // Load from localStorage on mount
  useEffect(() => {
    setAlldataUrl(localStorage.getItem(LS_ALLDATA) ?? "");
    setMitchellUrl(localStorage.getItem(LS_MITCHELL) ?? "");
  }, []);

  const handleSave = (alldata: string, mitchell: string) => {
    localStorage.setItem(LS_ALLDATA, alldata);
    localStorage.setItem(LS_MITCHELL, mitchell);
    setAlldataUrl(alldata);
    setMitchellUrl(mitchell);
    setSettingsOpen(false);
    showToast("Settings saved ✓");
  };

  const vehicleLabel =
    year && make && model ? `${year} ${make} ${model}` : "Vehicle";

  const freeSearchUrl = `https://charm.li/search?q=${encodeURIComponent(
    `${year ?? ""} ${make ?? ""} ${model ?? ""} repair manual`.trim(),
  )}`;

  const hasProLinks = alldataUrl || mitchellUrl;

  return (
    <div className="flex flex-col gap-5">
      {/* Toast */}
      {toastElement}

      {/* Settings modal */}
      {settingsOpen && (
        <SettingsModal
          alldataUrl={alldataUrl}
          mitchellUrl={mitchellUrl}
          onSave={handleSave}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-0.5">
            Repair Manuals
          </p>
          <h2 className="text-white font-black text-lg">{vehicleLabel}</h2>
        </div>
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          title="Configure repair manual URLs"
          className="w-9 h-9 rounded-xl bg-gray-800 border border-gray-700 flex items-center justify-center text-gray-400 hover:bg-gray-700 hover:text-white transition-colors"
        >
          ⚙️
        </button>
      </div>

      {/* ── Free Tier ─────────────────────────────────────────────── */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">📖</span>
          <h3 className="text-white font-black text-sm">
            Free Tier — Open-Source Manuals
          </h3>
        </div>
        <p className="text-gray-400 text-sm">
          Search community-sourced repair guides and factory service manuals
          for the {vehicleLabel}.
        </p>
        <a
          href={freeSearchUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 bg-gray-800 border border-gray-700 text-white font-bold rounded-xl px-4 py-3 text-sm hover:bg-gray-700 active:scale-95 transition-transform"
        >
          🔗 Search Free Manuals
          <span className="text-gray-500 text-xs">↗</span>
        </a>
      </div>

      {/* ── Pro Tier ──────────────────────────────────────────────── */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <span className="text-lg">⚡</span>
          <h3 className="text-white font-black text-sm">
            Pro Tier — Paid Diagram Integrations
          </h3>
        </div>

        {!hasProLinks ? (
          <div className="flex flex-col gap-3">
            <p className="text-gray-500 text-sm">
              Connect your ALLDATA or Mitchell ProDemand account for
              factory-level wiring diagrams, TSBs, and repair procedures.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className="flex-1 border border-dashed border-gray-700 text-gray-400 font-bold rounded-xl px-4 py-3 text-sm hover:border-gray-500 hover:text-white transition-colors"
              >
                ⚙️ Configure in Settings
              </button>
              <a
                href="/settings"
                className="flex-1 text-center border border-gray-700 text-gray-400 font-bold rounded-xl px-4 py-3 text-sm hover:border-gray-500 hover:text-white transition-colors"
              >
                Go to Settings →
              </a>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {alldataUrl && (
              <a
                href={alldataUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 bg-blue-950 border border-blue-800 rounded-2xl px-5 py-4 hover:bg-blue-900 active:scale-95 transition-transform"
              >
                <span className="text-2xl">🔵</span>
                <div>
                  <p className="text-white font-black text-sm">
                    Open ALLDATA
                  </p>
                  <p className="text-blue-400 text-xs">
                    Factory diagrams, TSBs & repair procedures
                  </p>
                </div>
                <span className="ml-auto text-blue-400 text-xs">↗</span>
              </a>
            )}

            {mitchellUrl && (
              <a
                href={mitchellUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 bg-green-950 border border-green-800 rounded-2xl px-5 py-4 hover:bg-green-900 active:scale-95 transition-transform"
              >
                <span className="text-2xl">🟢</span>
                <div>
                  <p className="text-white font-black text-sm">
                    Open Mitchell ProDemand
                  </p>
                  <p className="text-green-400 text-xs">
                    OEM specs, labor times & wiring diagrams
                  </p>
                </div>
                <span className="ml-auto text-green-400 text-xs">↗</span>
              </a>
            )}

            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="text-xs text-gray-600 hover:text-gray-400 transition-colors text-left"
            >
              ⚙️ Edit configured URLs
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
