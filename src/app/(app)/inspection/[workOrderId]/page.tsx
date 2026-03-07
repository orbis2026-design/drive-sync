"use client";

import { use, useCallback, useRef, useState } from "react";
import {
  syncInspection,
  type InspectionPayload,
  type InspectionStatus,
  type InspectionPoint,
} from "./actions";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const INSPECTION_POINTS = ["fluids", "tires", "brakes", "belts"] as const;
type InspectionKey = (typeof INSPECTION_POINTS)[number];

const POINT_LABELS: Record<InspectionKey, { label: string; icon: string; sublabel: string }> = {
  fluids: { label: "Fluids", icon: "💧", sublabel: "Oil · Coolant · Brake Fluid · Power Steering" },
  tires:  { label: "Tires",  icon: "🔘", sublabel: "Tread Depth · Sidewall · Pressure · Wear" },
  brakes: { label: "Brakes", icon: "🛑", sublabel: "Pad Thickness · Rotor Condition · Caliper" },
  belts:  { label: "Belts",  icon: "⚙️", sublabel: "Serpentine · Timing · Tension · Cracking" },
};

const DEBOUNCE_MS = 800;
const SYNC_CONFIRMATION_WINDOW_MS = 2500;

// ---------------------------------------------------------------------------
// Initial state factory
// ---------------------------------------------------------------------------

function emptyPayload(): InspectionPayload {
  const pt = (): InspectionPoint => ({ status: null, note: "" });
  return { fluids: pt(), tires: pt(), brakes: pt(), belts: pt() };
}

// ---------------------------------------------------------------------------
// StatusButton — one of three tri-state hit areas
// ---------------------------------------------------------------------------

interface StatusButtonProps {
  variant: InspectionStatus;
  active: boolean;
  onClick: () => void;
}

const VARIANT_STYLES: Record<
  InspectionStatus,
  { base: string; active: string; glow: string; label: string }
> = {
  PASS: {
    base: "border-success-500/30 text-success-400 hover:border-success-500 hover:bg-success-500/10",
    active: "border-success-500 bg-success-500/20 text-success-400 shadow-[0_0_16px_4px_rgba(34,197,94,0.3)]",
    glow: "shadow-[0_0_24px_6px_rgba(34,197,94,0.4)]",
    label: "PASS",
  },
  MONITOR: {
    base: "border-brand-400/30 text-brand-400 hover:border-brand-400 hover:bg-brand-400/10",
    active: "border-brand-400 bg-brand-400/20 text-brand-400 shadow-[0_0_16px_4px_rgba(250,204,21,0.3)]",
    glow: "shadow-[0_0_24px_6px_rgba(250,204,21,0.4)]",
    label: "MONITOR",
  },
  FAIL: {
    base: "border-danger-500/30 text-danger-400 hover:border-danger-500 hover:bg-danger-500/10",
    active: "border-danger-500 bg-danger-500/20 text-danger-400 shadow-[0_0_16px_4px_rgba(244,63,94,0.3)]",
    glow: "shadow-[0_0_24px_6px_rgba(244,63,94,0.4)]",
    label: "FAIL",
  },
};

function StatusButton({ variant, active, onClick }: StatusButtonProps) {
  const styles = VARIANT_STYLES[variant];

  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={[
        // Layout & sizing — oversized touch target
        "flex flex-1 items-center justify-center",
        "min-h-[56px] rounded-xl border-2",
        // Typography
        "text-sm font-black tracking-widest uppercase",
        // Transition
        "transition-all duration-200",
        // Focus ring
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900",
        // State-specific styles
        active
          ? `${styles.active} ${styles.glow}`
          : `bg-gray-900 ${styles.base}`,
        // Focus ring color
        variant === "PASS"
          ? "focus-visible:ring-success-500"
          : variant === "MONITOR"
            ? "focus-visible:ring-brand-400"
            : "focus-visible:ring-danger-500",
      ].join(" ")}
    >
      {styles.label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// InspectionCard — one row for a single inspection point
// ---------------------------------------------------------------------------

interface InspectionCardProps {
  pointKey: InspectionKey;
  point: InspectionPoint;
  onStatusChange: (key: InspectionKey, status: InspectionStatus) => void;
  onNoteChange: (key: InspectionKey, note: string) => void;
  syncStatus: "idle" | "syncing" | "saved" | "error";
}

function InspectionCard({
  pointKey,
  point,
  onStatusChange,
  onNoteChange,
  syncStatus,
}: InspectionCardProps) {
  const { label, icon, sublabel } = POINT_LABELS[pointKey];
  const isFail = point.status === "FAIL";

  const cardBorderColor =
    point.status === "PASS"
      ? "border-success-500/40"
      : point.status === "MONITOR"
        ? "border-brand-400/40"
        : point.status === "FAIL"
          ? "border-danger-500/40"
          : "border-gray-700";

  return (
    <article
      className={[
        "rounded-2xl border-2 bg-gray-900",
        cardBorderColor,
        "overflow-hidden transition-colors duration-300",
        // Subtle glow when a status is selected
        point.status === "FAIL"
          ? "shadow-[0_0_24px_rgba(244,63,94,0.12)]"
          : point.status === "PASS"
            ? "shadow-[0_0_24px_rgba(34,197,94,0.08)]"
            : point.status === "MONITOR"
              ? "shadow-[0_0_24px_rgba(250,204,21,0.08)]"
              : "",
      ].join(" ")}
      aria-label={`${label} inspection`}
    >
      {/* ── Card header ──────────────────────────────────────────────────── */}
      <div className="px-5 pt-5 pb-4">
        {/* Point title row */}
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-3">
            <span className="text-2xl" aria-hidden="true">{icon}</span>
            <div>
              <h2 className="text-xl font-black tracking-tight text-white leading-none">
                {label}
              </h2>
              <p className="text-xs text-gray-500 mt-0.5 leading-snug">
                {sublabel}
              </p>
            </div>
          </div>

          {/* Sync indicator */}
          <div className="flex-shrink-0 ml-2">
            {syncStatus === "syncing" && (
              <span className="text-xs text-gray-500 font-mono animate-pulse">
                ●
              </span>
            )}
            {syncStatus === "saved" && (
              <span className="text-xs text-success-400 font-bold">✓</span>
            )}
            {syncStatus === "error" && (
              <span className="text-xs text-danger-400 font-bold">!</span>
            )}
          </div>
        </div>

        {/* ── Tri-state toggle row ─────────────────────────────────────── */}
        <div
          className="flex gap-2 mt-4"
          role="group"
          aria-label={`${label} inspection status`}
        >
          {(["PASS", "MONITOR", "FAIL"] as const).map((variant) => (
            <StatusButton
              key={variant}
              variant={variant}
              active={point.status === variant}
              onClick={() => onStatusChange(pointKey, variant)}
            />
          ))}
        </div>
      </div>

      {/* ── Animated FAIL textarea ───────────────────────────────────────── */}
      <div
        className={[
          "overflow-hidden transition-[max-height,opacity] duration-300 ease-in-out",
          isFail ? "max-h-44 opacity-100" : "max-h-0 opacity-0",
        ].join(" ")}
        aria-hidden={!isFail}
      >
        <div className="px-5 pb-5 border-t border-danger-500/20 pt-4 bg-danger-500/5">
          <label
            htmlFor={`note-${pointKey}`}
            className="block text-xs font-bold uppercase tracking-widest text-danger-400 mb-2"
          >
            Failure Details
          </label>
          <textarea
            id={`note-${pointKey}`}
            rows={3}
            tabIndex={isFail ? 0 : -1}
            placeholder='e.g. "2mm pad remaining on front-left caliper"'
            value={point.note}
            onChange={(e) => onNoteChange(pointKey, e.target.value)}
            className={[
              "w-full rounded-lg bg-gray-800 border border-danger-500/40 resize-none",
              "px-4 py-3 text-sm text-white placeholder:text-gray-600",
              "focus:outline-none focus:border-danger-500",
              "focus-visible:ring-2 focus-visible:ring-danger-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900",
              "transition-colors duration-150",
            ].join(" ")}
          />
        </div>
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// StatusBar — overall inspection summary header
// ---------------------------------------------------------------------------

interface StatusBarProps {
  payload: InspectionPayload;
  syncStatus: "idle" | "syncing" | "saved" | "error";
  syncError: string | null;
}

function StatusBar({ payload, syncStatus, syncError }: StatusBarProps) {
  const points = INSPECTION_POINTS.map((k) => payload[k]);
  const total = points.length;
  const completed = points.filter((p) => p.status !== null).length;
  const failCount = points.filter((p) => p.status === "FAIL").length;
  const allPassed = completed === total && failCount === 0;
  const hasFailures = failCount > 0;

  return (
    <div
      className={[
        "rounded-2xl border-2 px-5 py-4",
        hasFailures
          ? "border-danger-500/40 bg-danger-500/5"
          : allPassed
            ? "border-success-500/40 bg-success-500/5"
            : "border-gray-700 bg-gray-900",
      ].join(" ")}
    >
      {/* Title row */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xs font-bold uppercase tracking-widest text-gray-500">
            Multi-Point Inspection
          </h1>
          <p
            className={[
              "text-2xl font-black mt-0.5",
              hasFailures
                ? "text-danger-400"
                : allPassed
                  ? "text-success-400"
                  : "text-white",
            ].join(" ")}
          >
            {hasFailures
              ? `${failCount} FAIL${failCount > 1 ? "S" : ""}`
              : allPassed
                ? "ALL CLEAR"
                : `${completed} / ${total} Checked`}
          </p>
        </div>

        {/* Sync status pill */}
        <div
          className={[
            "rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide",
            syncStatus === "syncing"
              ? "bg-gray-700 text-gray-400 animate-pulse"
              : syncStatus === "saved"
                ? "bg-success-500/20 text-success-400"
                : syncStatus === "error"
                  ? "bg-danger-500/20 text-danger-400"
                  : "bg-gray-800 text-gray-600",
          ].join(" ")}
        >
          {syncStatus === "syncing"
            ? "Saving…"
            : syncStatus === "saved"
              ? "Saved ✓"
              : syncStatus === "error"
                ? "Sync Error"
                : "Pending"}
        </div>
      </div>

      {/* Progress track */}
      <div className="mt-3 h-1.5 w-full rounded-full bg-gray-800 overflow-hidden">
        <div
          className={[
            "h-full rounded-full transition-all duration-500",
            hasFailures ? "bg-danger-500" : "bg-success-500",
          ].join(" ")}
          style={{ width: `${(completed / total) * 100}%` }}
          role="progressbar"
          aria-valuenow={completed}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-label="Inspection progress"
        />
      </div>

      {/* Sync error detail */}
      {syncError && (
        <p
          role="alert"
          className="mt-2 text-xs text-danger-400 font-medium"
        >
          {syncError}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// InspectionPage — Client Component
// ---------------------------------------------------------------------------

export default function InspectionPage({
  params,
}: {
  params: Promise<{ workOrderId: string }>;
}) {
  // Next.js 15+ passes route params as a Promise — unwrap with React's `use()`.
  const { workOrderId } = use(params);

  const [payload, setPayload] = useState<InspectionPayload>(emptyPayload);
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "saved" | "error">("idle");
  const [syncError, setSyncError] = useState<string | null>(null);

  // Debounce timer ref
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced sync — cancels any pending call and schedules a new one
  const scheduleSync = useCallback(
    (nextPayload: InspectionPayload) => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      setSyncStatus("syncing");

      debounceRef.current = setTimeout(async () => {
        const result = await syncInspection(workOrderId, nextPayload);
        if (result.error) {
          setSyncStatus("error");
          setSyncError(result.error);
        } else {
          setSyncStatus("saved");
          setSyncError(null);
          // Reset to idle after a brief confirmation window
          setTimeout(() => setSyncStatus("idle"), SYNC_CONFIRMATION_WINDOW_MS);
        }
      }, DEBOUNCE_MS);
    },
    [workOrderId],
  );

  // Handle status change for a point
  const handleStatusChange = useCallback(
    (key: InspectionKey, status: InspectionStatus) => {
      setPayload((prev) => {
        const updated: InspectionPayload = {
          ...prev,
          [key]: {
            // Clear note when switching away from FAIL
            note: status === "FAIL" ? prev[key].note : "",
            status,
          },
        };
        scheduleSync(updated);
        return updated;
      });
    },
    [scheduleSync],
  );

  // Handle note change for a point
  const handleNoteChange = useCallback(
    (key: InspectionKey, note: string) => {
      setPayload((prev) => {
        const updated: InspectionPayload = {
          ...prev,
          [key]: { ...prev[key], note },
        };
        scheduleSync(updated);
        return updated;
      });
    },
    [scheduleSync],
  );

  return (
    <div className="min-h-[100dvh] px-4 py-6 sm:px-6 sm:py-8 pb-[calc(env(safe-area-inset-bottom)+80px)] sm:pb-8">
      <div className="mx-auto max-w-lg space-y-4">
        {/* ── Summary status bar ──────────────────────────────────────────── */}
        <StatusBar
          payload={payload}
          syncStatus={syncStatus}
          syncError={syncError}
        />

        {/* ── Work order reference ────────────────────────────────────────── */}
        <p className="text-center text-[10px] font-mono text-gray-700 uppercase tracking-widest">
          WO · {workOrderId}
        </p>

        {/* ── Inspection point cards ──────────────────────────────────────── */}
        {INSPECTION_POINTS.map((key) => (
          <InspectionCard
            key={key}
            pointKey={key}
            point={payload[key]}
            onStatusChange={handleStatusChange}
            onNoteChange={handleNoteChange}
            syncStatus={syncStatus}
          />
        ))}

        {/* ── Diagnostic footer ───────────────────────────────────────────── */}
        <p className="text-center text-[10px] text-gray-700 pt-2">
          Changes auto-save · Results visible to client on invoice
        </p>
      </div>
    </div>
  );
}
