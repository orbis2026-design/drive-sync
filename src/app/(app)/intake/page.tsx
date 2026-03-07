"use client";

import { useActionState, useRef, useState } from "react";
import {
  decodeVin,
  createTenantVehicle,
  type DecodeVinResult,
  type DecodeVinError,
  type MaintenanceInterval,
} from "./actions";

// ---------------------------------------------------------------------------
// Metadata is handled by the parent layout or a separate metadata export.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isError(
  result: DecodeVinResult | DecodeVinError | null,
): result is DecodeVinError {
  return result !== null && "error" in result;
}

function isSuccess(
  result: DecodeVinResult | DecodeVinError | null,
): result is DecodeVinResult {
  return result !== null && "globalVehicle" in result;
}

// ---------------------------------------------------------------------------
// VIN Glow Input
// ---------------------------------------------------------------------------

interface VinInputProps {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}

function VinInput({ value, onChange, disabled }: VinInputProps) {
  return (
    <input
      id="vin-input"
      type="text"
      inputMode="text"
      autoCapitalize="characters"
      autoComplete="off"
      autoCorrect="off"
      spellCheck={false}
      maxLength={17}
      placeholder="1HGBH41JXMN109186"
      value={value}
      onChange={(e) => onChange(e.target.value.toUpperCase())}
      disabled={disabled}
      aria-label="Vehicle Identification Number (VIN)"
      className={[
        // Layout & sizing
        "w-full rounded-xl px-5 py-5 text-center",
        // Typography — large monospace for readability
        "font-mono text-2xl font-bold tracking-[0.15em] text-white placeholder:text-gray-600",
        // Background / border
        "bg-gray-900 border-2",
        value.length === 17
          ? "border-brand-400"
          : "border-gray-700 focus:border-brand-400",
        // Yellow glow when complete
        value.length === 17
          ? "shadow-[0_0_24px_4px_rgba(250,204,21,0.35)]"
          : "",
        // Focus ring
        "outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950",
        // Disabled state
        disabled ? "opacity-50 cursor-not-allowed" : "",
        "transition-all duration-200",
      ].join(" ")}
    />
  );
}

// ---------------------------------------------------------------------------
// Decode Button
// ---------------------------------------------------------------------------

interface DecodeButtonProps {
  disabled?: boolean;
  pending?: boolean;
}

function DecodeButton({ disabled, pending }: DecodeButtonProps) {
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className={[
        // Base sizing
        "relative w-full min-h-[64px] rounded-2xl",
        // Typography
        "text-xl font-black uppercase tracking-widest text-gray-950",
        // Color — warning yellow
        "bg-brand-400",
        // Glow effect
        "shadow-[0_0_32px_8px_rgba(250,204,21,0.4)]",
        // Hover / active
        "hover:bg-brand-300 hover:shadow-[0_0_40px_12px_rgba(250,204,21,0.55)]",
        "active:scale-[0.98]",
        // Disabled
        disabled || pending ? "opacity-50 cursor-not-allowed shadow-none" : "",
        // Transitions
        "transition-all duration-200",
        // Focus
        "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950",
      ].join(" ")}
    >
      {pending ? (
        <span className="flex items-center justify-center gap-3">
          <svg
            className="h-5 w-5 animate-spin"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
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
          Decoding…
        </span>
      ) : (
        "⚡ Decode"
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Maintenance Schedule Card
// ---------------------------------------------------------------------------

function ScheduleItem({ item }: { item: MaintenanceInterval }) {
  return (
    <li className="flex gap-3 rounded-lg bg-gray-800/60 px-4 py-3">
      <div className="flex-shrink-0 mt-0.5">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand-400/20 text-brand-400 text-xs font-bold">
          ✓
        </span>
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-white">{item.task}</p>
        <p className="text-xs text-gray-400 mt-0.5">
          Every {item.interval_miles.toLocaleString()} mi /{" "}
          {item.interval_months} mo
        </p>
        {item.parts.length > 0 && (
          <p className="text-xs text-gray-500 mt-1">
            Parts: {item.parts.join(", ")}
          </p>
        )}
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Bottom Sheet — Vehicle Blueprint + TenantVehicle form
// ---------------------------------------------------------------------------

interface BottomSheetProps {
  result: DecodeVinResult;
  vin: string;
  onClose: () => void;
}

function BottomSheet({ result, vin, onClose }: BottomSheetProps) {
  const { globalVehicle, cacheHit } = result;

  // Tenant vehicle form state
  const [clientId, setClientId] = useState("");
  const [licensePlate, setLicensePlate] = useState("");
  const [mileage, setMileage] = useState("");
  const [color, setColor] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!clientId.trim()) {
      setSaveError("Client ID is required.");
      return;
    }
    setSaving(true);
    setSaveError(null);

    // TODO: replace with tenantId from the authenticated session (e.g. via
    // next-auth / Supabase Auth) before deploying to production.
    // Hard-coding a placeholder ID here is intentional for the prototype stage
    // and MUST NOT reach a production database with RLS enabled.
    const res = await createTenantVehicle({
      tenantId: "00000000-0000-0000-0000-000000000001",
      clientId: clientId.trim(),
      globalVehicleId: globalVehicle.id,
      vin,
      licensePlate: licensePlate.trim() || undefined,
      mileage: mileage ? parseInt(mileage, 10) : undefined,
      color: color.trim() || undefined,
    });

    setSaving(false);
    if ("error" in res) {
      setSaveError(res.error);
    } else {
      setSaved(true);
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Vehicle blueprint"
        className={[
          "fixed bottom-0 left-0 right-0 z-50",
          "flex flex-col",
          "max-h-[90dvh] overflow-y-auto",
          "rounded-t-3xl bg-gray-900 border-t-2 border-brand-400/40",
          "shadow-[0_-8px_40px_rgba(250,204,21,0.15)]",
          // Slide-up animation via Tailwind v4 arbitrary animation
          "animate-[slideUp_0.35s_cubic-bezier(0.32,0.72,0,1)_both]",
          // Desktop: constrain width and center
          "sm:left-1/2 sm:-translate-x-1/2 sm:w-full sm:max-w-2xl sm:bottom-4 sm:rounded-3xl sm:border-2 sm:border-brand-400/40",
        ].join(" ")}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-4 pb-2 flex-shrink-0">
          <div className="h-1 w-10 rounded-full bg-gray-600" />
        </div>

        <div className="px-5 pb-6 space-y-6">
          {/* Vehicle identity */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-black text-white leading-tight">
                {globalVehicle.year} {globalVehicle.make}{" "}
                {globalVehicle.model}
              </h2>
              {globalVehicle.engine && (
                <p className="text-sm text-gray-400 mt-0.5">
                  {globalVehicle.engine}
                  {globalVehicle.trim ? ` · ${globalVehicle.trim}` : ""}
                </p>
              )}
              <p className="mt-2 text-xs font-mono text-gray-600 uppercase tracking-widest">
                {vin}
              </p>
            </div>
            <span
              className={[
                "flex-shrink-0 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide",
                cacheHit
                  ? "bg-success-500/20 text-success-400"
                  : "bg-brand-400/20 text-brand-400",
              ].join(" ")}
            >
              {cacheHit ? "Cached" : "New"}
            </span>
          </div>

          {/* Maintenance schedule */}
          <section aria-labelledby="schedule-heading">
            <h3
              id="schedule-heading"
              className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3"
            >
              Maintenance Blueprint
            </h3>
            <ul className="space-y-2">
              {globalVehicle.maintenance_schedule_json.map((item) => (
                <ScheduleItem
                  key={`${item.task}-${item.interval_miles}`}
                  item={item}
                />
              ))}
            </ul>
          </section>

          {/* TenantVehicle creation form */}
          {!saved ? (
            <section aria-labelledby="attach-heading">
              <h3
                id="attach-heading"
                className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3"
              >
                Attach to Client
              </h3>

              <form onSubmit={handleSave} className="space-y-3">
                <div>
                  <label
                    htmlFor="client-id"
                    className="block text-xs font-semibold text-gray-400 mb-1"
                  >
                    Client ID <span className="text-danger-500">*</span>
                  </label>
                  <input
                    id="client-id"
                    type="text"
                    required
                    placeholder="UUID of the client"
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                    className="w-full rounded-lg bg-gray-800 border border-gray-700 px-4 py-3 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-brand-400 focus-visible:ring-2 focus-visible:ring-brand-400"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="license-plate"
                      className="block text-xs font-semibold text-gray-400 mb-1"
                    >
                      License Plate
                    </label>
                    <input
                      id="license-plate"
                      type="text"
                      placeholder="ABC-1234"
                      value={licensePlate}
                      onChange={(e) =>
                        setLicensePlate(e.target.value.toUpperCase())
                      }
                      className="w-full rounded-lg bg-gray-800 border border-gray-700 px-4 py-3 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-brand-400 focus-visible:ring-2 focus-visible:ring-brand-400"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="mileage"
                      className="block text-xs font-semibold text-gray-400 mb-1"
                    >
                      Mileage
                    </label>
                    <input
                      id="mileage"
                      type="number"
                      inputMode="numeric"
                      placeholder="75000"
                      min={0}
                      value={mileage}
                      onChange={(e) => setMileage(e.target.value)}
                      className="w-full rounded-lg bg-gray-800 border border-gray-700 px-4 py-3 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-brand-400 focus-visible:ring-2 focus-visible:ring-brand-400"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="color"
                    className="block text-xs font-semibold text-gray-400 mb-1"
                  >
                    Color
                  </label>
                  <input
                    id="color"
                    type="text"
                    placeholder="Midnight Black"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="w-full rounded-lg bg-gray-800 border border-gray-700 px-4 py-3 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-brand-400 focus-visible:ring-2 focus-visible:ring-brand-400"
                  />
                </div>

                {saveError && (
                  <p
                    role="alert"
                    className="text-sm text-danger-400 font-medium"
                  >
                    {saveError}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={saving}
                  className="w-full min-h-[52px] rounded-xl bg-brand-400 text-gray-950 font-black text-base uppercase tracking-wider hover:bg-brand-300 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900"
                >
                  {saving ? "Saving…" : "Add Vehicle to Client →"}
                </button>
              </form>
            </section>
          ) : (
            <div className="rounded-xl bg-success-500/10 border border-success-500/30 px-5 py-4 text-center">
              <p className="text-success-400 font-bold text-lg">
                ✓ Vehicle Added
              </p>
              <p className="text-gray-400 text-sm mt-1">
                The vehicle has been attached to the client record.
              </p>
              <button
                onClick={onClose}
                className="mt-4 w-full min-h-[48px] rounded-xl bg-gray-800 text-white font-semibold hover:bg-gray-700 active:scale-[0.98] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to   { transform: translateY(0); }
        }
        @media (min-width: 640px) {
          @keyframes slideUp {
            from { transform: translateX(-50%) translateY(100%); opacity: 0; }
            to   { transform: translateX(-50%) translateY(0);   opacity: 1; }
          }
        }
      `}</style>
    </>
  );
}

// ---------------------------------------------------------------------------
// Intake Page
// ---------------------------------------------------------------------------

type FormState = DecodeVinResult | DecodeVinError | null;

async function decodeVinAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const vin = formData.get("vin");
  if (typeof vin !== "string") return { error: "No VIN provided." };
  return decodeVin(vin);
}

export default function IntakePage() {
  const [vin, setVin] = useState("");
  const [dismissed, setDismissed] = useState(false);
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    decodeVinAction,
    null,
  );
  const formRef = useRef<HTMLFormElement>(null);

  // Derive sheet visibility: show when we have a valid result and not dismissed
  const sheetOpen = isSuccess(state) && !dismissed;

  function handleReset() {
    setDismissed(true);
    setVin("");
    formRef.current?.reset();
  }

  return (
    <div className="relative flex min-h-[100dvh] flex-col items-center justify-center px-5 py-12 sm:py-16">
      {/* ── Page header ────────────────────────────────────────────────────── */}
      <div className="w-full max-w-md space-y-2 text-center mb-10">
        <h1 className="text-4xl font-black tracking-tight text-white">
          New Intake
        </h1>
        <p className="text-gray-400 text-base">
          Enter the 17-character VIN to decode the vehicle.
        </p>
      </div>

      {/* ── VIN form ───────────────────────────────────────────────────────── */}
      <form
        ref={formRef}
        action={formAction}
        className="w-full max-w-md space-y-5"
        noValidate
      >
        {/* Character counter */}
        <div className="flex items-center justify-between px-1 mb-1">
          <label
            htmlFor="vin-input"
            className="text-xs font-bold uppercase tracking-widest text-gray-500"
          >
            VIN
          </label>
          <span
            className={[
              "text-xs font-mono font-bold tabular-nums",
              vin.length === 17 ? "text-brand-400" : "text-gray-600",
            ].join(" ")}
            aria-live="polite"
            aria-atomic="true"
          >
            {vin.length} / 17
          </span>
        </div>

        {/* Hidden input carries the controlled value to the form action */}
        <input type="hidden" name="vin" value={vin} />

        <VinInput value={vin} onChange={setVin} disabled={pending} />

        <DecodeButton disabled={vin.length !== 17} pending={pending} />

        {/* Error message */}
        {isError(state) && (
          <p
            role="alert"
            className="rounded-lg bg-danger-500/10 border border-danger-500/30 px-4 py-3 text-sm text-danger-400 font-medium text-center"
          >
            {state.error}
          </p>
        )}
      </form>

      {/* ── Tips ──────────────────────────────────────────────────────────── */}
      <p className="mt-8 text-center text-xs text-gray-700 max-w-xs">
        Tip: The VIN is stamped on the driver&apos;s side dashboard near the
        windshield, or on the door jamb sticker.
      </p>

      {/* ── Bottom Sheet ───────────────────────────────────────────────────── */}
      {sheetOpen && isSuccess(state) && (
        <BottomSheet result={state} vin={vin} onClose={handleReset} />
      )}
    </div>
  );
}
