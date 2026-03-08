"use client";

import { useState, useCallback, useRef } from "react";
import { saveChecklist } from "./actions";
import type { ChecklistItemData } from "./actions";

// ---------------------------------------------------------------------------
// Checklist Template
// ---------------------------------------------------------------------------

interface ChecklistTemplateItem {
  id: string;
  label: string;
}

interface ChecklistCategory {
  category: string;
  items: ChecklistTemplateItem[];
}

const CHECKLIST_TEMPLATE: ChecklistCategory[] = [
  {
    category: "Tires",
    items: [
      { id: "tires_lf", label: "Left Front Tire" },
      { id: "tires_rf", label: "Right Front Tire" },
      { id: "tires_lr", label: "Left Rear Tire" },
      { id: "tires_rr", label: "Right Rear Tire" },
      { id: "tires_spare", label: "Spare Tire" },
    ],
  },
  {
    category: "Brakes",
    items: [
      { id: "brakes_front_pads", label: "Front Brake Pads" },
      { id: "brakes_rear_pads", label: "Rear Brake Pads" },
      { id: "brakes_rotors", label: "Rotors / Drums" },
      { id: "brakes_lines", label: "Brake Lines & Hoses" },
      { id: "brakes_fluid", label: "Brake Fluid Level" },
    ],
  },
  {
    category: "Fluids",
    items: [
      { id: "fluids_oil", label: "Engine Oil" },
      { id: "fluids_coolant", label: "Coolant" },
      { id: "fluids_trans", label: "Transmission Fluid" },
      { id: "fluids_power_steering", label: "Power Steering Fluid" },
      { id: "fluids_windshield", label: "Windshield Washer" },
    ],
  },
  {
    category: "Belts & Hoses",
    items: [
      { id: "belts_serpentine", label: "Serpentine Belt" },
      { id: "belts_timing", label: "Timing Belt / Chain" },
      { id: "belts_radiator_hoses", label: "Radiator Hoses" },
      { id: "belts_heater_hoses", label: "Heater Hoses" },
      { id: "belts_cv_boots", label: "CV Boots" },
    ],
  },
  {
    category: "Electrical",
    items: [
      { id: "elec_battery", label: "Battery & Terminals" },
      { id: "elec_alternator", label: "Alternator Output" },
      { id: "elec_starter", label: "Starter Motor" },
      { id: "elec_headlights", label: "Headlights" },
      { id: "elec_taillights", label: "Tail / Brake Lights" },
    ],
  },
  {
    category: "Steering & Suspension",
    items: [
      { id: "susp_shocks", label: "Shocks / Struts" },
      { id: "susp_ball_joints", label: "Ball Joints" },
      { id: "susp_tie_rods", label: "Tie Rod Ends" },
      { id: "susp_wheel_bearings", label: "Wheel Bearings" },
      { id: "susp_alignment", label: "Alignment Visual Check" },
    ],
  },
  {
    category: "Exhaust & Emissions",
    items: [
      { id: "exhaust_muffler", label: "Muffler & Pipes" },
      { id: "exhaust_catalytic", label: "Catalytic Converter" },
      { id: "exhaust_o2_sensor", label: "O₂ Sensors" },
      { id: "exhaust_leaks", label: "Exhaust Leak Check" },
      { id: "exhaust_hangers", label: "Exhaust Hangers" },
    ],
  },
  {
    category: "Interior & Safety",
    items: [
      { id: "safety_wipers", label: "Wiper Blades" },
      { id: "safety_horn", label: "Horn" },
      { id: "safety_seatbelts", label: "Seat Belts" },
      { id: "safety_mirrors", label: "Mirrors" },
      { id: "safety_air_filter", label: "Cabin Air Filter" },
    ],
  },
];

// ---------------------------------------------------------------------------
// Build initial flat state from the template
// ---------------------------------------------------------------------------

function buildInitialItems(): ChecklistItemData[] {
  return CHECKLIST_TEMPLATE.flatMap((cat) =>
    cat.items.map((item) => ({
      id: item.id,
      category: cat.category,
      label: item.label,
      status: null,
      note: "",
      photoUrl: "",
    })),
  );
}

// ---------------------------------------------------------------------------
// Status pill colours
// ---------------------------------------------------------------------------

const STATUS_STYLES: Record<"PASS" | "CAUTION" | "FAIL", string> = {
  PASS: "bg-green-700 text-white",
  CAUTION: "bg-yellow-600 text-white",
  FAIL: "bg-red-600 text-white",
};

const STATUS_INACTIVE = "bg-gray-800 text-gray-500 border border-gray-700";

// ---------------------------------------------------------------------------
// Single checklist row
// ---------------------------------------------------------------------------

interface RowProps {
  item: ChecklistItemData;
  onChange: (id: string, patch: Partial<ChecklistItemData>) => void;
}

function ChecklistRow({ item, onChange }: RowProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const setStatus = (s: "PASS" | "CAUTION" | "FAIL") =>
    onChange(item.id, { status: s });

  const handlePhotoCapture = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setUploading(true);
      try {
        const res = await fetch("/api/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: file.name,
            contentType: file.type,
            context: "checklist",
          }),
        });
        if (!res.ok) throw new Error("Upload URL error");
        const { uploadUrl, publicUrl } = (await res.json()) as {
          uploadUrl: string;
          publicUrl: string;
        };
        await fetch(uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file,
        });
        onChange(item.id, { photoUrl: publicUrl });
      } catch {
        // no-op — user can retry
      } finally {
        setUploading(false);
        if (fileRef.current) fileRef.current.value = "";
      }
    },
    [item.id, onChange],
  );

  return (
    <div className="flex flex-col gap-2 py-3 border-b border-gray-800 last:border-0">
      {/* Label + pills */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-sm text-white font-medium">{item.label}</span>
        <div className="flex gap-1">
          {(["PASS", "CAUTION", "FAIL"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={`px-3 py-1 rounded-full text-xs font-bold transition-opacity ${
                item.status === s ? STATUS_STYLES[s] : STATUS_INACTIVE
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Expanded FAIL section */}
      {item.status === "FAIL" && (
        <div className="flex flex-col gap-2 ml-1 pl-3 border-l-2 border-red-700">
          {/* Note */}
          <textarea
            rows={2}
            placeholder="Required: describe the failure…"
            value={item.note}
            onChange={(e) => onChange(item.id, { note: e.target.value })}
            className="w-full rounded-xl border border-gray-700 bg-gray-900 text-white placeholder-gray-600 focus:border-red-500 focus:ring-1 focus:ring-red-500 text-sm p-2 resize-none"
          />

          {/* Photo */}
          {item.photoUrl ? (
            <div className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.photoUrl}
                alt="Failure photo"
                className="w-16 h-16 object-cover rounded-xl border border-gray-700"
              />
              <button
                type="button"
                onClick={() => onChange(item.id, { photoUrl: "" })}
                className="text-xs text-red-400 underline"
              >
                Remove
              </button>
            </div>
          ) : (
            <label className="cursor-pointer">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                onChange={handlePhotoCapture}
              />
              <span className="inline-flex items-center gap-1 border border-dashed border-red-700 text-red-400 text-xs font-bold uppercase tracking-wide rounded-xl px-3 py-2 hover:bg-red-950 active:scale-95 transition-transform select-none">
                {uploading ? "Uploading…" : "📷 Add Required Photo"}
              </span>
            </label>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main export: ChecklistEngine
// ---------------------------------------------------------------------------

export function ChecklistEngine({ workOrderId }: { workOrderId: string }) {
  const [items, setItems] = useState<ChecklistItemData[]>(buildInitialItems);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const handleChange = useCallback(
    (id: string, patch: Partial<ChecklistItemData>) => {
      setItems((prev) =>
        prev.map((item) => (item.id === id ? { ...item, ...patch } : item)),
      );
      setSaved(false);
    },
    [],
  );

  const handleSave = useCallback(async () => {
    // Validate FAIL items
    const failItems = items.filter((i) => i.status === "FAIL");
    const invalid = failItems.filter((i) => !i.note.trim() || !i.photoUrl);
    if (invalid.length > 0) {
      setSaveError(
        `${invalid.length} FAIL item(s) need both a note and a photo before saving.`,
      );
      return;
    }

    setSaving(true);
    setSaveError(null);
    const result = await saveChecklist(workOrderId, items);
    setSaving(false);

    if (result.error) {
      setSaveError(result.error);
    } else {
      setSaved(true);
    }
  }, [workOrderId, items]);

  // Progress stats
  const total = items.length;
  const checked = items.filter((i) => i.status !== null).length;
  const passCount = items.filter((i) => i.status === "PASS").length;
  const failCount = items.filter((i) => i.status === "FAIL").length;

  return (
    <div className="flex flex-col gap-6">
      {/* Progress header */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1">
            Inspection Progress
          </p>
          <p className="text-white font-bold text-lg">
            {checked} / {total}
            <span className="text-gray-500 font-normal text-sm ml-2">
              items reviewed
            </span>
          </p>
        </div>
        <div className="flex gap-3 text-xs font-bold">
          <span className="text-green-400">✓ {passCount} Pass</span>
          <span className="text-red-400">✗ {failCount} Fail</span>
        </div>
      </div>

      {/* Categories */}
      {CHECKLIST_TEMPLATE.map((cat) => {
        const catItems = items.filter((i) => i.category === cat.category);
        return (
          <div
            key={cat.category}
            className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden"
          >
            <div className="px-5 py-3 border-b border-gray-800">
              <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400">
                {cat.category}
              </h3>
            </div>
            <div className="px-5">
              {catItems.map((item) => (
                <ChecklistRow
                  key={item.id}
                  item={item}
                  onChange={handleChange}
                />
              ))}
            </div>
          </div>
        );
      })}

      {/* Save bar */}
      <div className="flex flex-col gap-2 sticky bottom-4">
        {saveError && (
          <div className="bg-red-950 border border-red-700 rounded-xl px-4 py-3 text-red-300 text-sm">
            ⚠️ {saveError}
          </div>
        )}
        {saved && (
          <div className="bg-green-950 border border-green-700 rounded-xl px-4 py-3 text-green-300 text-sm">
            ✅ Checklist saved successfully.
          </div>
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-red-600 text-white font-black uppercase tracking-wide rounded-xl py-4 hover:bg-red-500 active:scale-95 transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? "Saving…" : "Save Checklist"}
        </button>
      </div>
    </div>
  );
}
