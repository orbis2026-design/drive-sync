"use client";

import { useState } from "react";
import { submitIntakeRequest, getPhotoUploadUrl } from "../actions";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Step = 1 | 2 | 3 | 4;

interface FormState {
  // Step 1 — Vehicle
  vin: string;
  plate: string;
  make: string;
  model: string;
  year: string;
  // Step 2 — Client
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  // Step 3 — 3 Cs
  complaint: string;
  cause: string;
  correction: string;
}

const EMPTY_FORM: FormState = {
  vin: "", plate: "", make: "", model: "", year: "",
  firstName: "", lastName: "", email: "", phone: "",
  complaint: "", cause: "", correction: "",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function InputField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-semibold text-gray-700">
        {label}
        {required && <span className="text-blue-600 ml-0.5">*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="w-full px-4 py-3 rounded-2xl border border-gray-300 bg-white text-gray-900 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-400"
      />
    </div>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  placeholder,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-semibold text-gray-700">
        {label}
        {required && <span className="text-blue-600 ml-0.5">*</span>}
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        rows={3}
        className="w-full px-4 py-3 rounded-2xl border border-gray-300 bg-white text-gray-900 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-400 resize-none"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step indicators
// ---------------------------------------------------------------------------

function StepDots({ current, total }: { current: Step; total: number }) {
  return (
    <div className="flex items-center gap-2 justify-center">
      {Array.from({ length: total }, (_, i) => i + 1).map((n) => (
        <div
          key={n}
          className={[
            "rounded-full transition-all",
            n === current
              ? "w-6 h-2.5 bg-blue-600"
              : n < current
              ? "w-2.5 h-2.5 bg-blue-400"
              : "w-2.5 h-2.5 bg-gray-300",
          ].join(" ")}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main IntakeClient component
// ---------------------------------------------------------------------------

export function IntakeClient({ tenantId }: { tenantId: string }) {
  const [step, setStep] = useState<Step>(1);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ workOrderId: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof FormState>(key: K, val: string) {
    setForm((prev) => ({ ...prev, [key]: val }));
  }

  function canAdvance(): boolean {
    if (step === 1) return true; // vehicle optional — mechanic will confirm
    if (step === 2) return !!(form.firstName && form.lastName && form.phone);
    if (step === 3) return !!form.complaint;
    return true;
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = () => setPhotoPreview(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);

    let photoPath: string | null = null;

    // Upload photo if provided
    if (photoFile) {
      const urlResult = await getPhotoUploadUrl(tenantId, photoFile.name);
      if ("error" in urlResult) {
        setError(`Photo upload failed: ${urlResult.error}`);
        setSubmitting(false);
        return;
      }
      try {
        const resp = await fetch(urlResult.uploadUrl, {
          method: "PUT",
          body: photoFile,
          headers: { "Content-Type": photoFile.type },
        });
        if (resp.ok) {
          photoPath = urlResult.path;
        }
      } catch {
        // Non-fatal — proceed without photo.
      }
    }

    const result = await submitIntakeRequest({
      tenantId,
      vin: form.vin,
      plate: form.plate,
      make: form.make,
      model: form.model,
      year: parseInt(form.year, 10) || new Date().getFullYear(),
      firstName: form.firstName,
      lastName: form.lastName,
      email: form.email,
      phone: form.phone,
      complaint: form.complaint,
      cause: form.cause,
      correction: form.correction,
      photoPath,
    });

    if ("error" in result) {
      setError(result.error);
      setSubmitting(false);
      return;
    }

    setDone({ workOrderId: result.workOrderId });
    setSubmitting(false);
  }

  // ── Success screen ──────────────────────────────────────────────────────────
  if (done) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 gap-6 px-6 py-12 text-center">
        <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center text-4xl">
          ✅
        </div>
        <h2 className="text-3xl font-black text-gray-900">Request Received!</h2>
        <p className="text-gray-600 text-base leading-relaxed">
          Your repair request has been submitted. The shop will review your
          information and contact you shortly to confirm your appointment.
        </p>
        <div className="rounded-2xl bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-700 font-mono">
          Ref #{done.workOrderId.slice(-8).toUpperCase()}
        </div>
      </div>
    );
  }

  // ── Step renderers ──────────────────────────────────────────────────────────

  function renderStep() {
    switch (step) {
      case 1:
        return (
          <div className="flex flex-col gap-4">
            <div className="rounded-2xl bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-700">
              Enter your vehicle&apos;s VIN <em>or</em> license plate — you only need one.
            </div>
            <InputField
              label="VIN (Vehicle Identification Number)"
              value={form.vin}
              onChange={(v) => set("vin", v.toUpperCase())}
              placeholder="1HGCM82633A004352"
            />
            <div className="flex items-center gap-3">
              <hr className="flex-1 border-gray-200" />
              <span className="text-xs text-gray-400 font-semibold">OR</span>
              <hr className="flex-1 border-gray-200" />
            </div>
            <InputField
              label="License Plate"
              value={form.plate}
              onChange={(v) => set("plate", v.toUpperCase())}
              placeholder="ABC 1234"
            />
            <div className="grid grid-cols-3 gap-3">
              <InputField label="Year" value={form.year} onChange={(v) => set("year", v)} placeholder="2019" type="number" />
              <InputField label="Make" value={form.make} onChange={(v) => set("make", v)} placeholder="Honda" />
              <InputField label="Model" value={form.model} onChange={(v) => set("model", v)} placeholder="Civic" />
            </div>
          </div>
        );

      case 2:
        return (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <InputField label="First Name" value={form.firstName} onChange={(v) => set("firstName", v)} required />
              <InputField label="Last Name" value={form.lastName} onChange={(v) => set("lastName", v)} required />
            </div>
            <InputField label="Phone Number" value={form.phone} onChange={(v) => set("phone", v)} type="tel" placeholder="+1 (555) 000-0000" required />
            <InputField label="Email (optional)" value={form.email} onChange={(v) => set("email", v)} type="email" placeholder="you@example.com" />
          </div>
        );

      case 3:
        return (
          <div className="flex flex-col gap-4">
            <div className="rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700">
              Describe the <strong>3 Cs</strong> of your repair as clearly as you can.
            </div>
            <TextAreaField
              label="Complaint — What are you experiencing?"
              value={form.complaint}
              onChange={(v) => set("complaint", v)}
              placeholder="My car shakes when braking at highway speed…"
              required
            />
            <TextAreaField
              label="Cause — What do you think caused it? (optional)"
              value={form.cause}
              onChange={(v) => set("cause", v)}
              placeholder="I hit a large pothole last week…"
            />
            <TextAreaField
              label="Correction — Any repairs you've already tried? (optional)"
              value={form.correction}
              onChange={(v) => set("correction", v)}
              placeholder="Took it to another shop and they said rotors were fine…"
            />
          </div>
        );

      case 4:
        return (
          <div className="flex flex-col gap-4">
            <div className="rounded-2xl bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-700">
              Take a photo of your dashboard warning light, damage, or anything
              that helps us understand the issue.
            </div>

            {photoPreview ? (
              <div className="relative rounded-2xl overflow-hidden border border-gray-300 bg-gray-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photoPreview}
                  alt="Preview of uploaded damage or warning light"
                  className="w-full max-h-64 object-cover"
                />
                <button
                  onClick={() => { setPhotoFile(null); setPhotoPreview(null); }}
                  className="absolute top-2 right-2 bg-white rounded-full w-8 h-8 flex items-center justify-center shadow text-gray-600 hover:text-red-600 font-bold"
                  aria-label="Remove photo"
                >
                  ✕
                </button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-blue-300 bg-blue-50 p-10 cursor-pointer hover:bg-blue-100 transition-colors">
                <span className="text-4xl" aria-hidden="true">📸</span>
                <span className="text-blue-700 font-semibold text-sm text-center">
                  Tap to snap a photo or upload from your gallery
                </span>
                <span className="text-xs text-blue-500">JPEG, PNG, HEIC up to 10 MB</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handlePhotoChange}
                  className="sr-only"
                />
              </label>
            )}

            <p className="text-xs text-gray-500 text-center">
              Photo is optional — skip to submit your request without one.
            </p>
          </div>
        );
    }
  }

  const stepLabels: Record<Step, string> = {
    1: "Vehicle Info",
    2: "Your Details",
    3: "What's Wrong?",
    4: "Photo Upload",
  };

  return (
    <div className="flex flex-col flex-1 gap-6 px-6 py-4">
      {/* Step indicator */}
      <div className="flex flex-col gap-2">
        <StepDots current={step} total={4} />
        <p className="text-center text-sm font-bold text-blue-600">
          Step {step} of 4 — {stepLabels[step]}
        </p>
      </div>

      {/* Step content */}
      {renderStep()}

      {/* Error */}
      {error && (
        <div role="alert" className="rounded-2xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Navigation */}
      <div className="flex gap-3 mt-auto pb-4">
        {step > 1 && (
          <button
            onClick={() => setStep((s) => (s - 1) as Step)}
            disabled={submitting}
            className="flex-1 py-4 rounded-2xl border border-gray-300 text-gray-700 font-bold text-base hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Back
          </button>
        )}

        {step < 4 ? (
          <button
            onClick={() => setStep((s) => (s + 1) as Step)}
            disabled={!canAdvance()}
            className="flex-1 py-4 rounded-2xl bg-blue-600 text-white font-bold text-base hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next →
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex-1 py-4 rounded-2xl bg-blue-600 text-white font-bold text-base hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {submitting ? "Submitting…" : "Submit Request"}
          </button>
        )}
      </div>
    </div>
  );
}
