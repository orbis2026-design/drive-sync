"use client";

/**
 * /settings/preferences — Feature Toggles (Issue #49)
 *
 * Lets mechanics enable/disable optional product modules to reduce cognitive
 * load on the dashboard.  Toggled features are hidden from the nav and
 * dashboard layouts.
 *
 * Features are persisted in localStorage for fast reads on the client side
 * (the Supabase tenants.features_json column is the source of truth; a future
 * server action can sync these values).
 */

import { useState } from "react";

// ---------------------------------------------------------------------------
// Feature definitions
// ---------------------------------------------------------------------------

interface FeatureDefinition {
  key: string;
  label: string;
  description: string;
  icon: string;
}

const FEATURES: FeatureDefinition[] = [
  {
    key: "inventory",
    label: "Inventory Management",
    description:
      "Track parts and consumables stock levels. Hides the Inventory tab when off.",
    icon: "📦",
  },
  {
    key: "marketing",
    label: "Automated Marketing",
    description:
      "AI-generated SMS campaigns and Google review prompts. Hides Marketing when off.",
    icon: "📣",
  },
  {
    key: "fleet",
    label: "Fleet Clients",
    description:
      "Commercial fleet accounts with bulk billing. Hides Fleet dashboard when off.",
    icon: "🚛",
  },
];

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

const LS_KEY = "ds_features";

export type FeaturesMap = Record<string, boolean>;

function loadFeatures(): FeaturesMap {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw) as FeaturesMap;
  } catch {
    // ignore
  }
  // Default: all features enabled
  return Object.fromEntries(FEATURES.map((f) => [f.key, true]));
}

function saveFeatures(features: FeaturesMap): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(features));
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Toggle switch
// ---------------------------------------------------------------------------

function ToggleSwitch({
  id,
  checked,
  onChange,
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      id={id}
      onClick={() => onChange(!checked)}
      className={[
        "relative inline-flex h-10 w-20 flex-shrink-0 cursor-pointer rounded-full",
        "border-2 transition-colors duration-300 focus-visible:outline-none",
        "focus-visible:ring-4 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900",
        checked
          ? "bg-brand-400 border-brand-400"
          : "bg-gray-700 border-gray-600",
      ].join(" ")}
    >
      <span
        className={[
          "pointer-events-none inline-block h-8 w-8 transform rounded-full",
          "bg-white shadow-lg ring-0 transition-transform duration-300",
          "mt-[2px]",
          checked ? "translate-x-10" : "translate-x-0.5",
        ].join(" ")}
      />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function PreferencesPage() {
  const [features, setFeatures] = useState<FeaturesMap>(() =>
    typeof window !== "undefined" ? loadFeatures() : {}
  );
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  function handleToggle(key: string, value: boolean) {
    const updated = { ...features, [key]: value };
    setFeatures(updated);
    saveFeatures(updated);
    setSavedAt(new Date());
  }

  return (
    <div className="max-w-xl mx-auto px-4 pt-6 pb-20 space-y-6">
      <div>
        <h1 className="text-2xl font-black text-white tracking-tight mb-1">
          Feature Preferences
        </h1>
        <p className="text-sm text-gray-500">
          Toggle features on or off to customise your DriveSync workspace.
          Disabled features are hidden from the nav and dashboard.
        </p>
      </div>

      <div className="space-y-4">
        {FEATURES.map((feature) => {
          const isOn = features[feature.key] ?? true;
          const switchId = `feature-${feature.key}`;
          return (
            <div
              key={feature.key}
              className={[
                "flex items-center gap-5 rounded-2xl border px-5 py-5",
                "bg-gray-900 transition-colors duration-200",
                isOn ? "border-gray-700" : "border-gray-800 opacity-70",
              ].join(" ")}
            >
              <span
                className="text-4xl flex-shrink-0"
                aria-hidden="true"
              >
                {feature.icon}
              </span>
              <label
                htmlFor={switchId}
                className="flex-1 cursor-pointer space-y-0.5"
              >
                <p className="font-semibold text-white text-base">
                  {feature.label}
                </p>
                <p className="text-xs text-gray-500">{feature.description}</p>
              </label>
              <ToggleSwitch
                id={switchId}
                checked={isOn}
                onChange={(value) => handleToggle(feature.key, value)}
              />
            </div>
          );
        })}
      </div>

      {savedAt && (
        <p className="text-[10px] text-gray-600 text-center">
          Saved at {savedAt.toLocaleTimeString()}
        </p>
      )}

      <div className="rounded-xl bg-gray-900 border border-gray-800 px-4 py-3">
        <p className="text-xs text-gray-500 leading-relaxed">
          <span className="font-bold text-gray-400">Note:</span> Feature
          preferences are stored locally on this device. A future release will
          sync them across all your devices via your shop profile.
        </p>
      </div>
    </div>
  );
}
