"use client";

/**
 * /settings/security — Screen lock timeouts (Issue #101)
 *
 * Configurable idle timeout and background lock delay. Stored in localStorage
 * and synced across tabs; no server round-trip.
 */

import { useLockSettings, IDLE_MIN, IDLE_MAX, HIDDEN_MIN, HIDDEN_MAX } from "@/contexts/LockSettingsContext";
import { useToast } from "@/components/Toast";

export default function SecuritySettingsPage() {
  const { settings, updateSettings } = useLockSettings();
  const { showToast, toastElement } = useToast();

  function handleIdleChange(value: number) {
    const clamped = Math.max(IDLE_MIN, Math.min(IDLE_MAX, value));
    updateSettings({ idleTimeoutMinutes: clamped });
  }

  function handleIdleBlur() {
    showToast("Saved");
  }

  function handleHiddenChange(value: number) {
    const clamped = Math.max(HIDDEN_MIN, Math.min(HIDDEN_MAX, value));
    updateSettings({ hiddenLockDelayMinutes: clamped });
  }

  function handleHiddenBlur() {
    showToast("Saved");
  }

  return (
    <div className="max-w-xl mx-auto px-4 pt-6 pb-20 space-y-6">
      {toastElement}
      <div>
        <h1 className="text-2xl font-black text-white tracking-tight mb-1">
          Security &amp; Screen Lock
        </h1>
        <p className="text-sm text-gray-500">
          When to lock the app when you step away or switch tabs. Stored on this device only.
        </p>
      </div>

      <div className="space-y-6 rounded-2xl border border-gray-800 bg-gray-900 p-5">
        <div>
          <label htmlFor="idle-timeout" className="block font-semibold text-white mb-1">
            Idle timeout (minutes)
          </label>
          <p className="text-xs text-gray-500 mb-2">
            Lock after this many minutes with no mouse, keyboard, or touch. ({IDLE_MIN}–{IDLE_MAX})
          </p>
          <input
            id="idle-timeout"
            type="number"
            min={IDLE_MIN}
            max={IDLE_MAX}
            value={settings.idleTimeoutMinutes}
            onChange={(e) => handleIdleChange(Number(e.target.value))}
            onBlur={(e) => {
              const v = Number(e.target.value);
              if (!Number.isFinite(v)) handleIdleChange(settings.idleTimeoutMinutes);
              handleIdleBlur();
            }}
            className="w-full rounded-xl border border-gray-700 bg-gray-800 px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent"
          />
        </div>

        <div>
          <label htmlFor="hidden-delay" className="block font-semibold text-white mb-1">
            Background lock delay (minutes)
          </label>
          <p className="text-xs text-gray-500 mb-2">
            Lock after the tab has been in the background for this long. Quick tab switches stay unlocked. ({HIDDEN_MIN}–{HIDDEN_MAX})
          </p>
          <input
            id="hidden-delay"
            type="number"
            min={HIDDEN_MIN}
            max={HIDDEN_MAX}
            value={settings.hiddenLockDelayMinutes}
            onChange={(e) => handleHiddenChange(Number(e.target.value))}
            onBlur={(e) => {
              const v = Number(e.target.value);
              if (!Number.isFinite(v)) handleHiddenChange(settings.hiddenLockDelayMinutes);
              handleHiddenBlur();
            }}
            className="w-full rounded-xl border border-gray-700 bg-gray-800 px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent"
          />
        </div>
      </div>

      <div className="rounded-xl bg-gray-900 border border-gray-800 px-4 py-3">
        <p className="text-xs text-gray-500 leading-relaxed">
          <span className="font-bold text-gray-400">Note:</span> These values are saved locally on this device and apply immediately. Other tabs will pick up changes automatically.
        </p>
      </div>
    </div>
  );
}
