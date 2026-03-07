"use client";

import { use, useCallback, useRef, useState } from "react";
import {
  compressMediaFiles,
  formatBytes,
  type CompressionResult,
} from "@/lib/media-compression";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Dashboard warning lights — mechanic checks these during pre-inspection. */
const DASH_LIGHTS = [
  { id: "check_engine", label: "Check Engine", icon: "🔧" },
  { id: "abs",          label: "ABS",           icon: "🛑" },
  { id: "tpms",         label: "TPMS",          icon: "💨" },
  { id: "airbag",       label: "Airbag",         icon: "🪄" },
] as const;

type DashLightId = (typeof DASH_LIGHTS)[number]["id"];

/** 2D vehicle wireframe panels for placing damage markers. */
const VEHICLE_PANELS = [
  { id: "front",              label: "Front Bumper",       x: 43, y: 4  },
  { id: "hood",               label: "Hood",               x: 43, y: 14 },
  { id: "roof",               label: "Roof",               x: 43, y: 34 },
  { id: "trunk",              label: "Trunk/Tailgate",     x: 43, y: 54 },
  { id: "rear",               label: "Rear Bumper",        x: 43, y: 68 },
  { id: "front_left_fender",  label: "Front Left Fender",  x: 14, y: 14 },
  { id: "front_right_fender", label: "Front Right Fender", x: 72, y: 14 },
  { id: "driver_door",        label: "Driver Door",        x: 14, y: 34 },
  { id: "passenger_door",     label: "Passenger Door",     x: 72, y: 34 },
  { id: "rear_left_quarter",  label: "Rear Left Quarter",  x: 14, y: 54 },
  { id: "rear_right_quarter", label: "Rear Right Quarter", x: 72, y: 54 },
] as const;

type PanelId = (typeof VEHICLE_PANELS)[number]["id"];

interface DamageMarker {
  panelId: PanelId;
  note: string;
}

// ---------------------------------------------------------------------------
// Pre-inspection State
// ---------------------------------------------------------------------------

interface PreCheckState {
  activeDashLights: Set<DashLightId>;
  obdCode: string;
  damageMarkers: DamageMarker[];
  mediaFiles: File[];
  compressionResults: CompressionResult[];
  isCompressing: boolean;
  selectedPanel: PanelId | null;
  noteForPanel: string;
}

// ---------------------------------------------------------------------------
// DashLightGrid
// ---------------------------------------------------------------------------

interface DashLightGridProps {
  activeLights: Set<DashLightId>;
  onToggle: (id: DashLightId) => void;
}

function DashLightGrid({ activeLights, onToggle }: DashLightGridProps) {
  return (
    <section aria-labelledby="dash-lights-heading">
      <h3
        id="dash-lights-heading"
        className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3"
      >
        Dashboard Warning Lights
      </h3>
      <div className="grid grid-cols-2 gap-2">
        {DASH_LIGHTS.map((light) => {
          const active = activeLights.has(light.id);
          return (
            <button
              key={light.id}
              type="button"
              aria-pressed={active}
              onClick={() => onToggle(light.id)}
              className={[
                "flex items-center gap-3 rounded-2xl border-2 px-4 py-4",
                "text-left transition-all duration-150",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger-500",
                active
                  ? "border-danger-500 bg-danger-500/15 shadow-[0_0_16px_4px_rgba(244,63,94,0.2)]"
                  : "border-gray-700 bg-gray-900 hover:border-gray-600",
              ].join(" ")}
            >
              <span className="text-2xl" aria-hidden="true">
                {light.icon}
              </span>
              <div>
                <p
                  className={[
                    "text-sm font-black leading-tight",
                    active ? "text-danger-400" : "text-white",
                  ].join(" ")}
                >
                  {light.label}
                </p>
                <p
                  className={[
                    "text-[10px] uppercase tracking-wide font-bold mt-0.5",
                    active ? "text-danger-500" : "text-gray-600",
                  ].join(" ")}
                >
                  {active ? "ACTIVE" : "OFF"}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// VehicleWireframe — 2D clickable damage map
// ---------------------------------------------------------------------------

interface VehicleWireframeProps {
  damageMarkers: DamageMarker[];
  onPanelClick: (panelId: PanelId) => void;
}

function VehicleWireframe({
  damageMarkers,
  onPanelClick,
}: VehicleWireframeProps) {
  const markedPanels = new Set(damageMarkers.map((m) => m.panelId));

  return (
    <section aria-labelledby="wireframe-heading">
      <h3
        id="wireframe-heading"
        className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3"
      >
        Damage Map — Tap a Panel
      </h3>

      {/* 2D top-down vehicle wireframe */}
      <div className="relative w-full bg-gray-900 rounded-2xl border-2 border-gray-700 overflow-hidden">
        {/* Aspect ratio container (portrait orientation — top-down view) */}
        <div className="relative w-full" style={{ paddingBottom: "80%" }}>
          {/* Vehicle silhouette — simple SVG outline */}
          <svg
            viewBox="0 0 100 80"
            className="absolute inset-0 w-full h-full"
            aria-hidden="true"
          >
            {/* Car body outline */}
            <rect
              x="20" y="5" width="60" height="70" rx="12"
              fill="none" stroke="#374151" strokeWidth="1.5"
            />
            {/* Windshield */}
            <rect
              x="25" y="12" width="50" height="12" rx="4"
              fill="none" stroke="#374151" strokeWidth="1"
            />
            {/* Rear glass */}
            <rect
              x="25" y="56" width="50" height="10" rx="4"
              fill="none" stroke="#374151" strokeWidth="1"
            />
            {/* Roof panel divider */}
            <line x1="20" y1="24" x2="80" y2="24" stroke="#374151" strokeWidth="0.5" strokeDasharray="2,2" />
            <line x1="20" y1="56" x2="80" y2="56" stroke="#374151" strokeWidth="0.5" strokeDasharray="2,2" />
            {/* Center line */}
            <line x1="50" y1="5" x2="50" y2="75" stroke="#374151" strokeWidth="0.5" strokeDasharray="2,2" />
            {/* Wheels */}
            <rect x="12" y="15" width="10" height="14" rx="3" fill="#1f2937" stroke="#374151" strokeWidth="1" />
            <rect x="78" y="15" width="10" height="14" rx="3" fill="#1f2937" stroke="#374151" strokeWidth="1" />
            <rect x="12" y="51" width="10" height="14" rx="3" fill="#1f2937" stroke="#374151" strokeWidth="1" />
            <rect x="78" y="51" width="10" height="14" rx="3" fill="#1f2937" stroke="#374151" strokeWidth="1" />
          </svg>

          {/* Clickable panel hit areas */}
          {VEHICLE_PANELS.map((panel) => {
            const hasMarker = markedPanels.has(panel.id);
            return (
              <button
                key={panel.id}
                type="button"
                title={panel.label}
                aria-label={`Mark damage on ${panel.label}`}
                onClick={() => onPanelClick(panel.id)}
                style={{
                  position: "absolute",
                  left: `${panel.x}%`,
                  top: `${panel.y}%`,
                  transform: "translate(-50%, -50%)",
                }}
                className={[
                  "w-8 h-8 rounded-full border-2",
                  "flex items-center justify-center",
                  "text-xs font-black",
                  "transition-all duration-150",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger-500",
                  hasMarker
                    ? "bg-danger-500 border-danger-400 text-white shadow-[0_0_12px_4px_rgba(244,63,94,0.5)] scale-110"
                    : "bg-gray-800 border-gray-600 text-gray-500 hover:border-danger-500 hover:text-danger-400",
                ].join(" ")}
              >
                {hasMarker ? "!" : "+"}
              </button>
            );
          })}
        </div>

        <p className="text-center text-[10px] text-gray-600 pb-3">
          Tap &quot;+&quot; to mark damage · Red indicates recorded damage
        </p>
      </div>

      {/* Damage marker list */}
      {damageMarkers.length > 0 && (
        <ul className="mt-3 space-y-2">
          {damageMarkers.map((marker) => {
            const panelLabel =
              VEHICLE_PANELS.find((p) => p.id === marker.panelId)?.label ??
              marker.panelId;
            return (
              <li
                key={marker.panelId}
                className="flex gap-3 rounded-lg bg-danger-500/10 border border-danger-500/30 px-4 py-2"
              >
                <span className="text-danger-400 font-bold text-sm flex-shrink-0">
                  ⚠
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-danger-300">
                    {panelLabel}
                  </p>
                  {marker.note && (
                    <p className="text-xs text-gray-400 mt-0.5 truncate">
                      {marker.note}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// PanelNoteModal — appears after tapping a panel
// ---------------------------------------------------------------------------

interface PanelNoteModalProps {
  panelId: PanelId;
  existingNote: string;
  onSave: (note: string) => void;
  onRemove: () => void;
  onCancel: () => void;
}

function PanelNoteModal({
  panelId,
  existingNote,
  onSave,
  onRemove,
  onCancel,
}: PanelNoteModalProps) {
  const [note, setNote] = useState(existingNote);
  const panelLabel =
    VEHICLE_PANELS.find((p) => p.id === panelId)?.label ?? panelId;

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
        onClick={onCancel}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="panel-note-title"
        className={[
          "fixed inset-x-4 top-1/2 -translate-y-1/2 z-[60]",
          "sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:w-full sm:max-w-md",
          "rounded-3xl bg-gray-900 border-2 border-danger-500/50",
          "p-6 space-y-4",
        ].join(" ")}
      >
        <h2 id="panel-note-title" className="text-lg font-black text-white">
          {panelLabel}
        </h2>
        <div>
          <label
            htmlFor="damage-note"
            className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2"
          >
            Damage Description
          </label>
          <textarea
            id="damage-note"
            rows={3}
            placeholder='e.g. "6-inch scratch along lower edge, paint chipped"'
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className={[
              "w-full rounded-xl bg-gray-800 border border-gray-700 resize-none",
              "px-4 py-3 text-sm text-white placeholder:text-gray-600",
              "focus:outline-none focus:border-danger-500",
              "focus-visible:ring-2 focus-visible:ring-danger-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900",
            ].join(" ")}
          />
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => onSave(note)}
            className="flex-1 rounded-xl bg-danger-500 text-white font-black py-3 hover:bg-danger-400 active:scale-[0.98] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger-500"
          >
            Mark Damage
          </button>
          {existingNote && (
            <button
              type="button"
              onClick={onRemove}
              className="rounded-xl bg-gray-700 text-gray-300 font-black py-3 px-4 hover:bg-gray-600 active:scale-[0.98] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-500"
            >
              Remove
            </button>
          )}
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl bg-gray-800 text-gray-400 font-bold py-3 px-4 hover:bg-gray-700 active:scale-[0.98] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-600"
          >
            Cancel
          </button>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// MediaUploadZone
// ---------------------------------------------------------------------------

interface MediaUploadZoneProps {
  compressionResults: CompressionResult[];
  isCompressing: boolean;
  onFilesSelected: (files: FileList) => void;
}

function MediaUploadZone({
  compressionResults,
  isCompressing,
  onFilesSelected,
}: MediaUploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const totalOriginal = compressionResults.reduce(
    (sum, r) => sum + r.originalBytes,
    0,
  );
  const totalCompressed = compressionResults.reduce(
    (sum, r) => sum + r.compressedBytes,
    0,
  );
  const savingsPercent =
    totalOriginal > 0
      ? Math.round(((totalOriginal - totalCompressed) / totalOriginal) * 100)
      : 0;

  return (
    <section aria-labelledby="media-heading">
      <h3
        id="media-heading"
        className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3"
      >
        Walkaround Video &amp; Damage Photos
      </h3>

      {/* Native camera capture input */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        capture="environment"
        multiple
        className="sr-only"
        aria-label="Capture walkaround media"
        onChange={(e) => {
          if (e.target.files?.length) {
            onFilesSelected(e.target.files);
          }
        }}
      />

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={isCompressing}
        className={[
          "w-full rounded-2xl border-2 border-dashed border-gray-600",
          "bg-gray-900 px-5 py-8 text-center",
          "hover:border-brand-400/60 hover:bg-gray-800",
          "active:scale-[0.98]",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          "transition-all duration-150",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400",
        ].join(" ")}
      >
        {isCompressing ? (
          <div className="flex flex-col items-center gap-2">
            <span className="h-8 w-8 rounded-full border-2 border-brand-400 border-t-transparent animate-spin" />
            <p className="text-sm text-gray-400">Compressing media…</p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="text-3xl" aria-hidden="true">📷</div>
            <p className="text-base font-bold text-white">
              Record Walkaround
            </p>
            <p className="text-xs text-gray-500">
              Tap to capture video or photos with the rear camera
            </p>
            <p className="text-[10px] text-gray-700">
              Images are auto-compressed before upload
            </p>
          </div>
        )}
      </button>

      {/* Uploaded files list */}
      {compressionResults.length > 0 && (
        <div className="mt-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-gray-500">
              {compressionResults.length} file
              {compressionResults.length !== 1 ? "s" : ""} ready
            </p>
            {savingsPercent > 0 && (
              <p className="text-xs text-success-400 font-bold">
                {savingsPercent}% smaller ✓
              </p>
            )}
          </div>
          <ul className="space-y-1.5">
            {compressionResults.map((result, idx) => (
              <li
                key={idx}
                className="flex items-center justify-between gap-3 rounded-lg bg-gray-800 px-4 py-2.5"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="text-sm flex-shrink-0"
                    aria-hidden="true"
                  >
                    {result.file.type.startsWith("video/") ? "🎥" : "📸"}
                  </span>
                  <p className="text-xs text-gray-300 truncate">
                    {result.file.name}
                  </p>
                </div>
                <div className="flex-shrink-0 text-right">
                  {result.wasCompressed ? (
                    <p className="text-[10px] text-success-400 font-bold">
                      {formatBytes(result.compressedBytes)}
                    </p>
                  ) : (
                    <p className="text-[10px] text-gray-500">
                      {formatBytes(result.originalBytes)}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>

          {savingsPercent > 0 && (
            <p className="text-[10px] text-gray-600 text-center">
              {formatBytes(totalOriginal)} → {formatBytes(totalCompressed)}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// OBD Code Prompt — shown when any dash light is active
// ---------------------------------------------------------------------------

interface ObdCodePromptProps {
  obdCode: string;
  onChange: (code: string) => void;
}

function ObdCodePrompt({ obdCode, onChange }: ObdCodePromptProps) {
  return (
    <div className="rounded-2xl bg-danger-500/10 border-2 border-danger-500/40 px-5 py-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-lg" aria-hidden="true">🔌</span>
        <p className="text-sm font-black text-danger-300">
          Active Warning Light Detected
        </p>
      </div>
      <p className="text-xs text-gray-400">
        Connect an OBD-II scanner and enter the diagnostic trouble code below.
      </p>
      <div>
        <label
          htmlFor="obd-code"
          className="block text-xs font-bold uppercase tracking-widest text-danger-400 mb-2"
        >
          OBD-II Code
        </label>
        <input
          id="obd-code"
          type="text"
          placeholder="e.g. P0301"
          value={obdCode}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          maxLength={10}
          className={[
            "w-full rounded-xl bg-gray-800 border border-danger-500/40",
            "px-4 py-3 font-mono text-sm text-white uppercase placeholder:text-gray-600",
            "focus:outline-none focus:border-danger-500",
            "focus-visible:ring-2 focus-visible:ring-danger-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900",
          ].join(" ")}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PreCheckPage — top-level client component
// ---------------------------------------------------------------------------

export default function PreCheckPage({
  params,
}: {
  params: Promise<{ workOrderId: string }>;
}) {
  const { workOrderId } = use(params);

  const [state, setState] = useState<PreCheckState>({
    activeDashLights: new Set(),
    obdCode: "",
    damageMarkers: [],
    mediaFiles: [],
    compressionResults: [],
    isCompressing: false,
    selectedPanel: null,
    noteForPanel: "",
  });

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);

  // ── Dash light toggle ───────────────────────────────────────────────────
  const handleDashLightToggle = useCallback((id: DashLightId) => {
    setState((prev) => {
      const next = new Set(prev.activeDashLights);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...prev, activeDashLights: next };
    });
  }, []);

  // ── Panel click ─────────────────────────────────────────────────────────
  const handlePanelClick = useCallback((panelId: PanelId) => {
    setState((prev) => {
      const existingMarker = prev.damageMarkers.find(
        (m) => m.panelId === panelId,
      );
      return {
        ...prev,
        selectedPanel: panelId,
        noteForPanel: existingMarker?.note ?? "",
      };
    });
  }, []);

  const handleSaveMarker = useCallback((note: string) => {
    setState((prev) => {
      if (!prev.selectedPanel) return prev;
      const panelId = prev.selectedPanel;
      const existing = prev.damageMarkers.filter((m) => m.panelId !== panelId);
      return {
        ...prev,
        selectedPanel: null,
        noteForPanel: "",
        damageMarkers: [...existing, { panelId, note }],
      };
    });
  }, []);

  const handleRemoveMarker = useCallback(() => {
    setState((prev) => {
      if (!prev.selectedPanel) return prev;
      const panelId = prev.selectedPanel;
      return {
        ...prev,
        selectedPanel: null,
        noteForPanel: "",
        damageMarkers: prev.damageMarkers.filter((m) => m.panelId !== panelId),
      };
    });
  }, []);

  const handleCancelModal = useCallback(() => {
    setState((prev) => ({
      ...prev,
      selectedPanel: null,
      noteForPanel: "",
    }));
  }, []);

  // ── Media upload + compression ──────────────────────────────────────────
  const handleFilesSelected = useCallback(async (fileList: FileList) => {
    const files = Array.from(fileList);
    setState((prev) => ({ ...prev, isCompressing: true }));

    try {
      const results = await compressMediaFiles(files, {
        maxDimension: 1920,
        quality: 0.82,
        maxSizeBytes: 1.5 * 1024 * 1024,
      });
      setState((prev) => ({
        ...prev,
        isCompressing: false,
        mediaFiles: [...prev.mediaFiles, ...files],
        compressionResults: [...prev.compressionResults, ...results],
      }));
    } catch {
      setState((prev) => ({ ...prev, isCompressing: false }));
    }
  }, []);

  // ── Complete pre-check ──────────────────────────────────────────────────
  async function handleComplete() {
    setSaving(true);
    setSaveError(null);

    try {
      // TODO: wire up real server action to:
      //   1. Upload compressed media to Supabase Storage
      //   2. Write damage markers, dash lights, OBD code to work_orders.pre_check_json
      //   3. Set work_orders.pre_check_complete = true
      //   4. Block WO from moving to IN_PROGRESS if not complete (routing guard)
      await new Promise((resolve) => setTimeout(resolve, 800));
      void workOrderId;
      setCompleted(true);
    } catch {
      setSaveError("Failed to save pre-inspection. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const hasActiveLights = state.activeDashLights.size > 0;
  const isReadyToComplete =
    state.compressionResults.length > 0 || state.damageMarkers.length > 0;

  if (completed) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center px-5 py-12 text-center">
        <div className="text-6xl mb-6" aria-hidden="true">✅</div>
        <h1 className="text-3xl font-black text-white mb-3">
          Pre-Inspection Complete
        </h1>
        <p className="text-gray-400 text-base max-w-sm leading-relaxed">
          The walkaround has been recorded. This Work Order is now cleared to
          move to Active status.
        </p>
        <p className="mt-4 text-xs font-mono text-gray-600 uppercase tracking-widest">
          WO · {workOrderId}
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] px-4 py-6 sm:px-6 sm:py-8 pb-[calc(env(safe-area-inset-bottom)+80px)] sm:pb-8">
      <div className="mx-auto max-w-lg space-y-6">

        {/* ── Page header ──────────────────────────────────────────────────── */}
        <div>
          <h1 className="text-4xl font-black text-white tracking-tight">
            Pre-Inspection
          </h1>
          <p className="text-sm text-gray-400 mt-1 leading-relaxed">
            Document the vehicle condition BEFORE starting work.
          </p>
          <div className="flex items-center gap-2 mt-2">
            <span className="rounded-full bg-danger-500/20 text-danger-400 px-3 py-1 text-xs font-bold uppercase tracking-wide">
              Required
            </span>
            <p className="text-[10px] font-mono text-gray-700 uppercase tracking-widest">
              WO · {workOrderId}
            </p>
          </div>
        </div>

        {/* ── Walkaround Media ─────────────────────────────────────────────── */}
        <MediaUploadZone
          compressionResults={state.compressionResults}
          isCompressing={state.isCompressing}
          onFilesSelected={handleFilesSelected}
        />

        {/* ── Vehicle Wireframe — Damage Map ───────────────────────────────── */}
        <VehicleWireframe
          damageMarkers={state.damageMarkers}
          onPanelClick={handlePanelClick}
        />

        {/* ── Dashboard Warning Lights ─────────────────────────────────────── */}
        <DashLightGrid
          activeLights={state.activeDashLights}
          onToggle={handleDashLightToggle}
        />

        {/* ── OBD-II Code Prompt (only when a light is active) ─────────────── */}
        {hasActiveLights && (
          <ObdCodePrompt
            obdCode={state.obdCode}
            onChange={(code) =>
              setState((prev) => ({ ...prev, obdCode: code }))
            }
          />
        )}

        {/* ── Complete CTA ─────────────────────────────────────────────────── */}
        <div className="space-y-3">
          {saveError && (
            <p role="alert" className="text-sm text-danger-400 font-medium text-center">
              {saveError}
            </p>
          )}
          <button
            type="button"
            onClick={handleComplete}
            disabled={saving || !isReadyToComplete}
            className={[
              "w-full min-h-[64px] rounded-2xl",
              "text-xl font-black uppercase tracking-widest text-gray-950",
              "bg-brand-400",
              "shadow-[0_0_32px_8px_rgba(250,204,21,0.4)]",
              "hover:bg-brand-300 hover:shadow-[0_0_48px_12px_rgba(250,204,21,0.55)]",
              "active:scale-[0.98]",
              "disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none",
              "transition-all duration-200",
              "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950",
            ].join(" ")}
          >
            {saving ? (
              <span className="flex items-center justify-center gap-3">
                <span className="h-5 w-5 rounded-full border-2 border-black/30 border-t-black animate-spin" />
                Saving…
              </span>
            ) : (
              "Complete Pre-Inspection ✓"
            )}
          </button>
          {!isReadyToComplete && (
            <p className="text-center text-xs text-gray-600">
              Add at least one photo/video or damage marker to continue.
            </p>
          )}
        </div>
      </div>

      {/* ── Panel Note Modal ─────────────────────────────────────────────────── */}
      {state.selectedPanel && (
        <PanelNoteModal
          panelId={state.selectedPanel}
          existingNote={state.noteForPanel}
          onSave={handleSaveMarker}
          onRemove={handleRemoveMarker}
          onCancel={handleCancelModal}
        />
      )}
    </div>
  );
}
