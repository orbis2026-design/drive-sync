"use client";

/**
 * /intake/diagnostic — Upfront Diagnostic / Check Engine Gate (Issue #53)
 *
 * A parallel intake flow that completely bypasses the parts catalog and labour
 * hour calculators. Instead it hard-codes a flat "Diagnostic Fee" and
 * immediately generates an authorization contract for the client to sign,
 * legally consenting to the diagnostic charge BEFORE a repair quote is ever
 * generated.
 *
 * Workflow:
 *   1. Mechanic enters basic vehicle / client information.
 *   2. App hardcodes the Diagnostic Fee (default $150 / 1.0 Labour Hour).
 *   3. Client signs the Diagnostic Authorization contract via SMS portal link.
 *   4. Once signed, the "Convert to Repair Quote" button is revealed.
 *   5. A Server Action transitions the diagnostic ticket into a standard
 *      WorkOrder, preserving vehicle data and optionally rolling the
 *      diagnostic fee into the final repair cost.
 */

import { useState, useTransition } from "react";
import Link from "next/link";
import { createDiagnosticWorkOrder } from "./actions";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default flat diagnostic fee in US cents ($150.00). */
const DEFAULT_DIAGNOSTIC_FEE_CENTS = 15000;

/** Default labour hours charged for the diagnostic assessment. */
const DEFAULT_DIAGNOSTIC_HOURS = 1.0;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DiagnosticFormData {
  clientFirstName: string;
  clientLastName: string;
  clientPhone: string;
  vehicleYear: string;
  vehicleMake: string;
  vehicleModel: string;
  vin: string;
  mileage: string;
  complainedSymptom: string;
  /** Override the default fee amount (in dollars). */
  diagnosticFeeOverride: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// ---------------------------------------------------------------------------
// DiagnosticIntakePage
// ---------------------------------------------------------------------------

export default function DiagnosticIntakePage() {
  const [step, setStep] = useState<"form" | "contract" | "signed" | "converted">(
    "form",
  );
  const [form, setForm] = useState<DiagnosticFormData>({
    clientFirstName: "",
    clientLastName: "",
    clientPhone: "",
    vehicleYear: "",
    vehicleMake: "",
    vehicleModel: "",
    vin: "",
    mileage: "",
    complainedSymptom: "",
    diagnosticFeeOverride: (DEFAULT_DIAGNOSTIC_FEE_CENTS / 100).toFixed(2),
  });
  const [rollFee, setRollFee] = useState(false);
  const [convertedWorkOrderId, setConvertedWorkOrderId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const diagnosticFeeCents = Math.round(
    parseFloat(form.diagnosticFeeOverride || "150") * 100,
  );

  // -------------------------------------------------------------------------
  // Step 1 → Step 2: generate authorization contract
  // -------------------------------------------------------------------------

  function handleGenerateContract(e: React.FormEvent) {
    e.preventDefault();
    if (
      !form.clientFirstName.trim() ||
      !form.clientPhone.trim() ||
      !form.vehicleMake.trim() ||
      !form.vehicleModel.trim()
    ) {
      setError("Please fill in all required fields.");
      return;
    }
    setError(null);
    setStep("contract");
  }

  // -------------------------------------------------------------------------
  // Step 2 → Step 3: simulate client signature (SMS link in production)
  // -------------------------------------------------------------------------

  function handleSimulateSign() {
    startTransition(async () => {
      // In production: generate approval token → send SMS → wait for portal response.
      await new Promise((r) => setTimeout(r, 800));
      setStep("signed");
    });
  }

  // -------------------------------------------------------------------------
  // Step 3 → Step 4: convert diagnostic ticket to repair WorkOrder
  // -------------------------------------------------------------------------

  function handleConvert() {
    startTransition(async () => {
      try {
        const result = await createDiagnosticWorkOrder({
          clientFirstName: form.clientFirstName,
          clientLastName: form.clientLastName,
          clientPhone: form.clientPhone,
          vehicleYear: parseInt(form.vehicleYear, 10) || 0,
          vehicleMake: form.vehicleMake,
          vehicleModel: form.vehicleModel,
          vin: form.vin || undefined,
          mileage: form.mileage
            ? Math.max(0, Math.floor(parseFloat(form.mileage)))
            : undefined,
          symptom: form.complainedSymptom,
          diagnosticFeeCents,
          rollDiagnosticFee: rollFee,
        });

        if ("error" in result) {
          setError(result.error);
          return;
        }

        setConvertedWorkOrderId(result.workOrderId);
        setStep("converted");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Conversion failed.");
      }
    });
  }

  function set(field: keyof DiagnosticFormData, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
    setError(null);
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="max-w-xl mx-auto px-4 pt-6 pb-24">
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/intake"
          className="text-xs text-gray-500 hover:text-gray-300 transition-colors mb-3 inline-block"
        >
          ← Back to Intake
        </Link>
        <div className="flex items-start gap-3">
          <span className="text-4xl" aria-hidden="true">🔍</span>
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">
              Diagnostic-Only Intake
            </h1>
            <p className="text-gray-500 text-sm mt-0.5">
              Charge a flat diagnostic fee before any repair quote is generated.
              The client signs first — you scan second.
            </p>
          </div>
        </div>
      </div>

      {/* Step indicator */}
      <StepIndicator
        steps={["Vehicle Info", "Authorization", "Convert to Quote"]}
        current={step === "form" ? 0 : step === "contract" ? 1 : step === "signed" ? 1 : 2}
      />

      {/* ---------------------------------------------------------------- */}
      {/* STEP 1 — Vehicle & Client Info                                     */}
      {/* ---------------------------------------------------------------- */}
      {step === "form" && (
        <form onSubmit={handleGenerateContract} className="space-y-4 mt-6">
          {/* Client info */}
          <section className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
            <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">
              Client Information
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="First Name *"
                value={form.clientFirstName}
                onChange={(v) => set("clientFirstName", v)}
                placeholder="John"
              />
              <Field
                label="Last Name"
                value={form.clientLastName}
                onChange={(v) => set("clientLastName", v)}
                placeholder="Smith"
              />
              <div className="col-span-2">
                <Field
                  label="Phone *"
                  value={form.clientPhone}
                  onChange={(v) => set("clientPhone", v)}
                  placeholder="+1 555-555-5555"
                  type="tel"
                />
              </div>
            </div>
          </section>

          {/* Vehicle info */}
          <section className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
            <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">
              Vehicle Information
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Year"
                value={form.vehicleYear}
                onChange={(v) => set("vehicleYear", v)}
                placeholder="2019"
                type="number"
              />
              <Field
                label="Make *"
                value={form.vehicleMake}
                onChange={(v) => set("vehicleMake", v)}
                placeholder="Ford"
              />
              <div className="col-span-2">
                <Field
                  label="Model *"
                  value={form.vehicleModel}
                  onChange={(v) => set("vehicleModel", v)}
                  placeholder="F-150"
                />
              </div>
              <Field
                label="VIN (optional)"
                value={form.vin}
                onChange={(v) => set("vin", v.toUpperCase())}
                placeholder="1FTFW1E50NFB12345"
                mono
              />
              <Field
                label="Mileage"
                value={form.mileage}
                onChange={(v) => set("mileage", v)}
                placeholder="85000"
                type="number"
              />
              <div className="col-span-2">
                <label className="block text-xs text-gray-500 font-medium mb-1">
                  Reported Symptom / Complaint
                </label>
                <textarea
                  value={form.complainedSymptom}
                  onChange={(e) => set("complainedSymptom", e.target.value)}
                  placeholder="Check engine light on, rough idle at startup…"
                  rows={3}
                  className="w-full rounded-lg bg-gray-800 border border-gray-700 text-white placeholder:text-gray-600 px-3 py-2 text-sm focus:outline-none focus:border-brand-400 resize-none"
                />
              </div>
            </div>
          </section>

          {/* Diagnostic fee */}
          <section className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
            <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">
              Diagnostic Fee
            </h2>
            <div className="flex items-center gap-3">
              <span className="text-gray-400 text-sm">$</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.diagnosticFeeOverride}
                onChange={(e) => set("diagnosticFeeOverride", e.target.value)}
                className="w-32 rounded-lg bg-gray-800 border border-gray-700 text-white px-3 py-2 text-sm font-mono focus:outline-none focus:border-brand-400"
              />
              <span className="text-xs text-gray-600">
                ({DEFAULT_DIAGNOSTIC_HOURS}h — OBD-II scan &amp; inspection)
              </span>
            </div>
            <p className="text-xs text-gray-600 mt-2">
              This fee covers plugging in the scanner and inspecting the vehicle.
              It is charged regardless of whether the client approves the repair.
            </p>
          </section>

          {error && (
            <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
              {error}
            </p>
          )}

          <button
            type="submit"
            className="w-full rounded-xl bg-brand-500 hover:bg-brand-400 text-black font-black py-4 text-sm transition-all duration-150 active:scale-95"
          >
            Generate Diagnostic Authorization →
          </button>
        </form>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* STEP 2 — Diagnostic Authorization Contract                         */}
      {/* ---------------------------------------------------------------- */}
      {(step === "contract" || step === "signed") && (
        <div className="mt-6 space-y-4">
          {/* Contract preview */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
            <div className="text-center mb-5">
              <div className="text-2xl font-black text-gray-900 mb-1">
                Diagnostic Authorization
              </div>
              <p className="text-xs text-gray-500">
                {new Date().toLocaleDateString("en-US", {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </p>
            </div>

            <div className="text-sm text-gray-700 leading-relaxed space-y-3">
              <p>
                I, <strong>{form.clientFirstName} {form.clientLastName}</strong>,
                hereby authorize the mechanic to perform a diagnostic inspection
                of my{" "}
                <strong>
                  {form.vehicleYear} {form.vehicleMake} {form.vehicleModel}
                </strong>
                {form.vin && ` (VIN: ${form.vin})`} at the current mileage of{" "}
                {form.mileage ? `${parseInt(form.mileage, 10).toLocaleString()} miles` : "—"}.
              </p>
              <p>
                I understand and agree that a{" "}
                <strong className="text-gray-900">
                  flat Diagnostic Fee of {fmt(diagnosticFeeCents)}
                </strong>{" "}
                ({DEFAULT_DIAGNOSTIC_HOURS}h — OBD-II scan &amp; inspection)
                will be charged regardless of whether I authorise any
                subsequent repairs.
              </p>
              <p>
                I acknowledge that this authorization does not commit me to any
                repair work. A separate repair quote will be presented for my
                approval before any additional work commences.
              </p>
              {form.complainedSymptom && (
                <p className="text-xs text-gray-500 italic border-t border-gray-100 pt-3">
                  Reported symptom: &ldquo;{form.complainedSymptom}&rdquo;
                </p>
              )}
            </div>

            {step === "signed" ? (
              <div className="mt-5 border-t border-gray-100 pt-4">
                <p className="text-xs text-emerald-600 font-semibold">
                  ✓ Signed digitally via client portal —{" "}
                  {new Date().toLocaleString()}
                </p>
              </div>
            ) : (
              <div className="mt-5 border-t border-gray-100 pt-4 text-center">
                <p className="text-xs text-gray-500 mb-3">
                  An SMS has been sent to{" "}
                  <strong>{form.clientPhone}</strong> with a secure link to
                  review and sign this authorization.
                </p>
                <button
                  onClick={handleSimulateSign}
                  disabled={isPending}
                  className="rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold px-6 py-2.5 text-sm transition-all"
                >
                  {isPending ? "Waiting…" : "Simulate Client Signature ✓"}
                </button>
              </div>
            )}
          </div>

          {/* Convert to repair quote — only visible after signing */}
          {step === "signed" && (
            <div className="bg-gray-900 border border-brand-500/40 rounded-2xl p-5">
              <h2 className="text-sm font-bold text-white mb-1">
                ✓ Diagnostic Authorized
              </h2>
              <p className="text-xs text-gray-500 mb-4 leading-snug">
                The client has signed the authorization. You may now scan the
                vehicle. Once you have the OBD-II codes and your diagnosis is
                complete, convert this ticket to a full Repair Quote.
              </p>

              {/* Roll diagnostic fee option */}
              <label className="flex items-start gap-3 cursor-pointer mb-4 bg-gray-800 rounded-xl px-4 py-3">
                <input
                  type="checkbox"
                  checked={rollFee}
                  onChange={(e) => setRollFee(e.target.checked)}
                  className="mt-0.5 accent-brand-400"
                />
                <div>
                  <p className="text-sm font-medium text-white">
                    Roll diagnostic fee into final repair cost
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    The {fmt(diagnosticFeeCents)} fee will be credited toward
                    the total repair invoice. Common closing tactic — clients
                    appreciate the gesture.
                  </p>
                </div>
              </label>

              {error && (
                <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 mb-4">
                  {error}
                </p>
              )}

              <button
                onClick={handleConvert}
                disabled={isPending}
                className="w-full rounded-xl bg-brand-500 hover:bg-brand-400 disabled:opacity-50 text-black font-black py-4 text-sm transition-all duration-150 active:scale-95"
              >
                {isPending ? "Converting…" : "Convert to Repair Quote →"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* STEP 4 — Conversion complete                                       */}
      {/* ---------------------------------------------------------------- */}
      {step === "converted" && convertedWorkOrderId && (
        <div className="mt-6 text-center">
          <div className="text-6xl mb-4" aria-hidden="true">🎉</div>
          <h2 className="text-2xl font-black text-white mb-2">
            Converted to Repair Quote
          </h2>
          <p className="text-gray-400 text-sm mb-6 leading-relaxed">
            The diagnostic ticket has been seamlessly transitioned into a
            standard Work Order. Vehicle data has been preserved.
            {rollFee && (
              <>
                {" "}
                The diagnostic fee of{" "}
                <strong className="text-brand-400">{fmt(diagnosticFeeCents)}</strong>{" "}
                will be credited against the final invoice.
              </>
            )}
          </p>
          <Link
            href={`/quotes/${convertedWorkOrderId}`}
            className="inline-block rounded-xl bg-brand-500 text-black font-black px-6 py-3 text-sm hover:bg-brand-400 transition-colors"
          >
            Build Repair Quote →
          </Link>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  mono,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  mono?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs text-gray-500 font-medium mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={[
          "w-full rounded-lg bg-gray-800 border border-gray-700 text-white placeholder:text-gray-600 px-3 py-2 text-sm focus:outline-none focus:border-brand-400",
          mono ? "font-mono" : "",
        ].join(" ")}
      />
    </div>
  );
}

function StepIndicator({
  steps,
  current,
}: {
  steps: string[];
  current: number;
}) {
  return (
    <div className="flex items-center gap-0 mt-2">
      {steps.map((label, i) => (
        <div key={label} className="flex items-center flex-1">
          <div className="flex flex-col items-center flex-1">
            <div
              className={[
                "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold",
                i <= current
                  ? "bg-brand-500 text-black"
                  : "bg-gray-800 text-gray-600",
              ].join(" ")}
            >
              {i < current ? "✓" : i + 1}
            </div>
            <span
              className={[
                "text-[10px] mt-1 text-center leading-tight",
                i <= current ? "text-gray-300" : "text-gray-600",
              ].join(" ")}
            >
              {label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div
              className={[
                "h-px flex-1 mx-1 -mt-4",
                i < current ? "bg-brand-500" : "bg-gray-800",
              ].join(" ")}
            />
          )}
        </div>
      ))}
    </div>
  );
}
