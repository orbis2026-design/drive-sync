"use client";

/**
 * src/app/onboarding/page.tsx
 *
 * Zero-Touch Tenant Setup Wizard (Issue #65).
 *
 * Three-step, mobile-optimised flow that runs immediately after Stripe
 * checkout completes (success_url = /onboarding).
 *
 * Step 1 — Shop Profile : shopName, phoneNumber, logoUrl (optional)
 * Step 2 — The Math     : laborRateCents, partsTaxRate
 * Step 3 — Biometrics   : WebAuthn passkey (FaceID / TouchID) registration
 *
 * On completion, the saveOnboardingSettings server action persists all data
 * to the Supabase tenants + mechanic_settings tables and redirects to /calendar.
 */

import { useState, useTransition } from "react";
import { registerPasskey } from "@/lib/auth-helpers";
import { saveOnboardingSettings } from "./actions";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Step = 1 | 2 | 3;

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StepIndicator({ current }: { current: Step }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {([1, 2, 3] as Step[]).map((s) => (
        <div key={s} className="flex items-center gap-2">
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-black transition-all ${
              s === current
                ? "bg-red-600 text-white"
                : s < current
                  ? "bg-green-700 text-white"
                  : "bg-gray-800 text-gray-500"
            }`}
          >
            {s < current ? "✓" : s}
          </div>
          {s < 3 && (
            <div
              className={`h-0.5 w-8 transition-all ${
                s < current ? "bg-green-700" : "bg-gray-800"
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 1 — Shop Profile
// ---------------------------------------------------------------------------

interface Step1Props {
  shopName: string;
  setShopName: (v: string) => void;
  phoneNumber: string;
  setPhoneNumber: (v: string) => void;
  logoUrl: string;
  setLogoUrl: (v: string) => void;
  onNext: () => void;
}

function Step1ShopProfile({
  shopName,
  setShopName,
  phoneNumber,
  setPhoneNumber,
  logoUrl,
  setLogoUrl,
  onNext,
}: Step1Props) {
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    setIsUploading(true);

    try {
      // Get a pre-signed upload URL from R2 (same pattern as inspection pre-check).
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: `logos/${Date.now()}-${file.name}`,
          contentType: file.type,
          context: "logo",
        }),
      });

      if (!res.ok) {
        setUploadError("Could not get upload URL. Logo upload skipped.");
        return;
      }

      const { uploadUrl, publicUrl } = (await res.json()) as {
        uploadUrl: string;
        publicUrl: string;
      };

      await fetch(uploadUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });

      setLogoUrl(publicUrl);
    } catch {
      setUploadError("Logo upload failed. You can add it later in Settings.");
    } finally {
      setIsUploading(false);
    }
  }

  const isValid = shopName.trim().length > 0 && phoneNumber.trim().length >= 7;

  return (
    <div className="space-y-5">
      <div>
        <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-gray-400">
          Shop Name *
        </label>
        <input
          type="text"
          value={shopName}
          onChange={(e) => setShopName(e.target.value)}
          placeholder="e.g. Fast Lane Mobile Mechanics"
          className="w-full rounded-xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-white placeholder-gray-600 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-gray-400">
          Phone Number *
        </label>
        <input
          type="tel"
          value={phoneNumber}
          onChange={(e) => setPhoneNumber(e.target.value)}
          placeholder="e.g. (555) 867-5309"
          className="w-full rounded-xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-white placeholder-gray-600 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-gray-400">
          Shop Logo{" "}
          <span className="font-normal normal-case text-gray-600">(optional)</span>
        </label>

        {logoUrl ? (
          <div className="flex items-center gap-3 rounded-xl border border-green-700/40 bg-green-950/40 px-4 py-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={logoUrl}
              alt="Shop logo"
              className="h-10 w-10 rounded-lg object-cover"
            />
            <span className="text-sm text-green-400">Logo uploaded ✓</span>
            <button
              type="button"
              onClick={() => setLogoUrl("")}
              className="ml-auto text-xs text-gray-500 hover:text-gray-300"
            >
              Remove
            </button>
          </div>
        ) : (
          <label className="flex cursor-pointer items-center justify-center rounded-xl border border-dashed border-gray-700 bg-gray-900/50 px-4 py-6 text-sm text-gray-500 transition-colors hover:border-gray-600 hover:bg-gray-900">
            {isUploading ? "Uploading…" : "Tap to upload logo (PNG / JPG)"}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              onChange={handleLogoUpload}
              disabled={isUploading}
            />
          </label>
        )}

        {uploadError && (
          <p className="mt-1.5 text-xs text-red-400">{uploadError}</p>
        )}
      </div>

      <button
        type="button"
        disabled={!isValid}
        onClick={onNext}
        className="mt-4 flex min-h-[52px] w-full items-center justify-center rounded-xl bg-red-600 text-sm font-black uppercase tracking-wide text-white transition-all hover:bg-red-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950"
      >
        Continue →
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — The Math
// ---------------------------------------------------------------------------

interface Step2Props {
  laborRate: string;
  setLaborRate: (v: string) => void;
  taxRate: string;
  setTaxRate: (v: string) => void;
  onNext: () => void;
  onBack: () => void;
}

function Step2TheMath({
  laborRate,
  setLaborRate,
  taxRate,
  setTaxRate,
  onNext,
  onBack,
}: Step2Props) {
  const isValid =
    parseFloat(laborRate) > 0 &&
    parseFloat(taxRate) >= 0 &&
    parseFloat(taxRate) <= 30;

  return (
    <div className="space-y-5">
      <div>
        <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-gray-400">
          Hourly Labor Rate *
        </label>
        <div className="relative">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">
            $
          </span>
          <input
            type="number"
            min="0"
            step="5"
            value={laborRate}
            onChange={(e) => setLaborRate(e.target.value)}
            placeholder="120"
            className="w-full rounded-xl border border-gray-700 bg-gray-900 px-4 py-3 pl-8 text-sm text-white placeholder-gray-600 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
          />
          <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-gray-500">
            /hr
          </span>
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-gray-400">
          Parts Tax Rate *
        </label>
        <div className="relative">
          <input
            type="number"
            min="0"
            max="30"
            step="0.25"
            value={taxRate}
            onChange={(e) => setTaxRate(e.target.value)}
            placeholder="7.75"
            className="w-full rounded-xl border border-gray-700 bg-gray-900 px-4 py-3 pr-10 text-sm text-white placeholder-gray-600 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
          />
          <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-gray-500">
            %
          </span>
        </div>
        <p className="mt-1 text-xs text-gray-600">
          Check your local county tax authority for the exact rate.
        </p>
      </div>

      {parseFloat(laborRate) > 0 && (
        <div className="rounded-xl border border-gray-800 bg-gray-900/60 px-4 py-3 text-sm text-gray-400">
          Preview: a 3-hr job with $250 parts →{" "}
          <span className="font-bold text-white">
            $
            {(
              parseFloat(laborRate) * 3 +
              250 * (1 + parseFloat(taxRate || "0") / 100)
            ).toFixed(2)}
          </span>
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex min-h-[52px] flex-1 items-center justify-center rounded-xl border border-gray-700 bg-gray-900 text-sm font-semibold text-gray-300 transition-all hover:bg-gray-800 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-600"
        >
          ← Back
        </button>
        <button
          type="button"
          disabled={!isValid}
          onClick={onNext}
          className="flex min-h-[52px] flex-1 items-center justify-center rounded-xl bg-red-600 text-sm font-black uppercase tracking-wide text-white transition-all hover:bg-red-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
        >
          Continue →
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3 — Biometrics (WebAuthn)
// ---------------------------------------------------------------------------

interface Step3Props {
  onBack: () => void;
  onFinish: (passkeyRegistered: boolean) => void;
  isSaving: boolean;
}

function Step3Biometrics({ onBack, onFinish, isSaving }: Step3Props) {
  const [passkeyStatus, setPasskeyStatus] = useState<
    "idle" | "registering" | "success" | "error"
  >("idle");
  const [passkeyError, setPasskeyError] = useState<string | null>(null);

  async function handleRegisterPasskey() {
    setPasskeyStatus("registering");
    setPasskeyError(null);

    const result = await registerPasskey();

    if (result.success) {
      setPasskeyStatus("success");
    } else {
      setPasskeyStatus("error");
      setPasskeyError(result.error);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-800 bg-gray-900 p-6 text-center">
        <div className="text-5xl mb-3">
          {passkeyStatus === "success" ? "✅" : "🔑"}
        </div>
        <h3 className="text-base font-bold text-white mb-1">
          {passkeyStatus === "success"
            ? "Biometrics Registered!"
            : "Secure Your Account"}
        </h3>
        <p className="text-sm text-gray-400">
          {passkeyStatus === "success"
            ? "You can now sign in instantly with FaceID or TouchID."
            : "Register your FaceID or TouchID for instant, password-free sign-in from this device."}
        </p>

        {passkeyError && (
          <p className="mt-3 text-xs text-red-400">{passkeyError}</p>
        )}

        {passkeyStatus !== "success" && (
          <button
            type="button"
            disabled={passkeyStatus === "registering"}
            onClick={handleRegisterPasskey}
            className="mt-4 inline-flex items-center gap-2 rounded-xl border border-gray-700 bg-gray-800 px-6 py-3 text-sm font-semibold text-white transition-all hover:bg-gray-700 active:scale-95 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-500"
          >
            {passkeyStatus === "registering"
              ? "Waiting for biometric…"
              : "Register FaceID / TouchID"}
          </button>
        )}
      </div>

      {passkeyStatus !== "success" && (
        <p className="text-center text-xs text-gray-600">
          You can also skip this step and set it up later in Settings.
        </p>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          disabled={isSaving}
          className="flex min-h-[52px] flex-1 items-center justify-center rounded-xl border border-gray-700 bg-gray-900 text-sm font-semibold text-gray-300 transition-all hover:bg-gray-800 active:scale-95 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-600"
        >
          ← Back
        </button>
        <button
          type="button"
          disabled={isSaving}
          onClick={() => onFinish(passkeyStatus === "success")}
          className="flex min-h-[52px] flex-1 items-center justify-center rounded-xl bg-red-600 text-sm font-black uppercase tracking-wide text-white transition-all hover:bg-red-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
        >
          {isSaving
            ? "Saving…"
            : passkeyStatus === "success"
              ? "🚀 Launch DriveSync"
              : "Skip & Launch"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Onboarding Page
// ---------------------------------------------------------------------------

const STEP_TITLES: Record<Step, string> = {
  1: "Shop Profile",
  2: "The Math",
  3: "Secure Your Account",
};

const STEP_SUBTITLES: Record<Step, string> = {
  1: "Tell us about your shop.",
  2: "Set your labor rate and local tax.",
  3: "Register biometrics for instant sign-in.",
};

export default function OnboardingPage() {
  const [step, setStep] = useState<Step>(1);
  const [isPending, startTransition] = useTransition();
  const [saveError, setSaveError] = useState<string | null>(null);

  // Step 1 state
  const [shopName, setShopName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [logoUrl, setLogoUrl] = useState("");

  // Step 2 state
  const [laborRate, setLaborRate] = useState("");
  const [taxRate, setTaxRate] = useState("");

  function handleFinish(passkeyRegistered: boolean) {
    setSaveError(null);
    void passkeyRegistered; // noted for analytics; not required to block save

    startTransition(async () => {
      const result = await saveOnboardingSettings({
        shopName: shopName.trim(),
        phoneNumber: phoneNumber.trim(),
        logoUrl: logoUrl || undefined,
        laborRateCents: Math.round(parseFloat(laborRate) * 100),
        partsTaxRate: parseFloat(taxRate) / 100,
      });

      if (result?.error) {
        setSaveError(result.error);
      }
      // On success, the server action calls redirect() — no client action needed.
    });
  }

  return (
    <div className="flex min-h-screen flex-col bg-gray-950 px-4 py-10">
      <div className="mx-auto w-full max-w-md">
        {/* Header */}
        <div className="mb-8 text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-red-500 mb-1">
            Welcome to DriveSync
          </p>
          <h1 className="text-2xl font-black text-white">
            {STEP_TITLES[step]}
          </h1>
          <p className="mt-1 text-sm text-gray-500">{STEP_SUBTITLES[step]}</p>
        </div>

        <StepIndicator current={step} />

        {/* Error banner */}
        {saveError && (
          <div
            role="alert"
            className="mb-5 rounded-2xl border border-red-700 bg-red-950 px-4 py-3 text-sm text-red-400"
          >
            {saveError}
          </div>
        )}

        {/* Step content */}
        {step === 1 && (
          <Step1ShopProfile
            shopName={shopName}
            setShopName={setShopName}
            phoneNumber={phoneNumber}
            setPhoneNumber={setPhoneNumber}
            logoUrl={logoUrl}
            setLogoUrl={setLogoUrl}
            onNext={() => setStep(2)}
          />
        )}

        {step === 2 && (
          <Step2TheMath
            laborRate={laborRate}
            setLaborRate={setLaborRate}
            taxRate={taxRate}
            setTaxRate={setTaxRate}
            onNext={() => setStep(3)}
            onBack={() => setStep(1)}
          />
        )}

        {step === 3 && (
          <Step3Biometrics
            onBack={() => setStep(2)}
            onFinish={handleFinish}
            isSaving={isPending}
          />
        )}
      </div>
    </div>
  );
}
