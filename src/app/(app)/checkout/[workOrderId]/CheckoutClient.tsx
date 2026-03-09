"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, useCallback } from "react";
import { processPayment, type CheckoutData } from "./actions";
import { TAX_RATE } from "@/app/(app)/quotes/[workOrderId]/constants";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDollars(cents: number): string {
  return `$${formatCents(cents)}`;
}

/**
 * Luhn algorithm — validates a credit card number.
 * Returns true when the number passes the check.
 */
function luhnCheck(cardNumber: string): boolean {
  const digits = cardNumber.replace(/\D/g, "");
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let isEven = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = parseInt(digits[i], 10);
    if (isEven) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    isEven = !isEven;
  }
  return sum % 10 === 0;
}

function formatCardNumber(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 16);
  return digits.replace(/(.{4})/g, "$1 ").trim();
}

function isValidExpiry(value: string): boolean {
  const match = value.match(/^(\d{2})\/(\d{2})$/);
  if (!match) return false;
  const month = parseInt(match[1], 10);
  const year = parseInt(match[2], 10) + 2000;
  if (month < 1 || month > 12) return false;
  const now = new Date();
  const expiryDate = new Date(year, month - 1, 1);
  const startOfCurrentMonth = new Date(
    now.getFullYear(),
    now.getMonth(),
    1,
  );
  return expiryDate >= startOfCurrentMonth;
}

function formatTimestamp(isoString: string): string {
  return new Date(isoString).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatMethodLabel(method: string): string {
  switch (method) {
    case "card_tap": return "Tap to Pay (Card)";
    case "card_manual": return "Manual Card Entry";
    case "cash": return "Cash";
    case "check": return "Check";
    default: return method;
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PaymentMode = "card" | "cash_check";
type TapState = "awaiting" | "processing" | "success";
type CashSubMethod = "cash" | "check";

interface CheckoutClientProps {
  data: CheckoutData;
}

interface ManualCardForm {
  cardNumber: string;
  expiry: string;
  cvc: string;
  name: string;
}

interface ManualCardErrors {
  cardNumber?: string;
  expiry?: string;
  cvc?: string;
  name?: string;
}

// ---------------------------------------------------------------------------
// RadarAnimation — pulsing concentric rings for tap-to-pay
// ---------------------------------------------------------------------------

function RadarAnimation() {
  return (
    <div className="relative flex items-center justify-center" style={{ width: 220, height: 220 }}>
      {/* Pulsing rings */}
      <span className="checkout-radar-ring absolute rounded-full border-2 border-brand-400/60" style={{ width: 220, height: 220, animationDelay: "0s" }} />
      <span className="checkout-radar-ring absolute rounded-full border-2 border-brand-400/40" style={{ width: 170, height: 170, animationDelay: "0.4s" }} />
      <span className="checkout-radar-ring absolute rounded-full border-2 border-brand-400/25" style={{ width: 120, height: 120, animationDelay: "0.8s" }} />
      {/* Center circle */}
      <div className="relative flex items-center justify-center rounded-full bg-gray-800 border-2 border-brand-400/50 checkout-pulse-glow" style={{ width: 90, height: 90 }}>
        <span className="text-4xl select-none" aria-hidden="true">💳</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ProcessingAnimation — spinner during payment processing
// ---------------------------------------------------------------------------

function ProcessingAnimation() {
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative flex items-center justify-center rounded-full bg-gray-800 border-2 border-brand-400/50" style={{ width: 90, height: 90 }}>
        <div className="h-10 w-10 rounded-full border-4 border-brand-400/30 border-t-brand-400 animate-spin" />
      </div>
      <p className="text-lg font-bold text-brand-400 checkout-shimmer">Processing…</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ConfettiParticles — CSS-only celebration particles
// ---------------------------------------------------------------------------

function ConfettiParticles() {
  const particles = Array.from({ length: 18 }, (_, i) => i);
  const colors = [
    "bg-brand-400", "bg-success-400", "bg-danger-400",
    "bg-blue-400", "bg-purple-400", "bg-orange-400",
  ];
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden z-10" aria-hidden="true">
      {particles.map((i) => (
        <span
          key={i}
          className={`checkout-confetti absolute rounded-sm ${colors[i % colors.length]}`}
          style={{
            left: `${5 + (i * 5.5) % 90}%`,
            width: `${6 + (i % 4) * 3}px`,
            height: `${6 + (i % 3) * 4}px`,
            animationDelay: `${(i * 0.12).toFixed(2)}s`,
            animationDuration: `${2 + (i % 5) * 0.4}s`,
          }}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// JobCompleteScreen
// ---------------------------------------------------------------------------

interface JobCompleteScreenProps {
  data: CheckoutData;
  closedAt: string;
  paymentMethod: string;
}

function JobCompleteScreen({ data, closedAt, paymentMethod }: JobCompleteScreenProps) {
  const router = useRouter();
  const subtotalCents = data.laborCents + data.partsCents;
  const taxCents = Math.round(subtotalCents * TAX_RATE);
  const totalCents = subtotalCents + taxCents;

  return (
    <div className="relative flex min-h-[100dvh] flex-col items-center justify-center px-5 py-12 bg-surface overflow-hidden">
      <ConfettiParticles />

      <div
        className="relative z-20 w-full max-w-md text-center space-y-6"
        role="status"
        aria-live="polite"
        aria-label="Job complete"
      >
        {/* Checkmark */}
        <div className="flex justify-center">
          <div
            className="flex items-center justify-center rounded-full bg-success-500/20 border-2 border-success-500/50 checkout-scale-bounce-in"
            style={{ width: 110, height: 110 }}
          >
            <svg
              className="text-success-400"
              width="56"
              height="56"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
        </div>

        {/* Headline */}
        <div>
          <p className="text-[10px] font-mono text-gray-600 uppercase tracking-widest mb-1">
            Payment Collected
          </p>
          <h1 className="text-5xl sm:text-6xl font-black text-white tracking-tight">
            JOB COMPLETE
          </h1>
        </div>

        {/* Payment details */}
        <div className="rounded-2xl border-2 border-success-500/30 bg-success-500/10 px-5 py-5 space-y-3 text-left">
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-400">Amount</span>
            <span className="text-xl font-black text-success-400">{formatDollars(totalCents)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-400">Method</span>
            <span className="text-sm font-bold text-white">{formatMethodLabel(paymentMethod)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-400">Closed</span>
            <span className="text-sm font-bold text-white">{formatTimestamp(closedAt)}</span>
          </div>
        </div>

        {/* Client & vehicle */}
        <div className="rounded-2xl border border-gray-700 bg-gray-900 px-5 py-4 text-left space-y-2">
          <p className="text-sm font-black text-white">
            {data.client.firstName} {data.client.lastName}
          </p>
          <p className="text-xs text-gray-400">
            {data.vehicle.year} {data.vehicle.make} {data.vehicle.model}
          </p>
          <p className="text-xs text-gray-500">{data.title}</p>
        </div>

        {/* Return button */}
        <button
          type="button"
          onClick={() => router.push("/clients")}
          className="w-full min-h-[56px] rounded-2xl bg-brand-400 px-6 font-black text-black text-lg hover:bg-brand-300 hover:shadow-[0_0_24px_6px_rgba(250,204,21,0.3)] transition-all duration-200 focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900"
        >
          Close &amp; Return
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ManualCardEntry
// ---------------------------------------------------------------------------

interface ManualCardEntryProps {
  totalCents: number;
  isPending: boolean;
  onSubmit: (last4: string) => void;
  onCancel: () => void;
}

function ManualCardEntry({ totalCents, isPending, onSubmit, onCancel }: ManualCardEntryProps) {
  const [form, setForm] = useState<ManualCardForm>({
    cardNumber: "",
    expiry: "",
    cvc: "",
    name: "",
  });
  const [errors, setErrors] = useState<ManualCardErrors>({});

  function validate(): ManualCardErrors {
    const errs: ManualCardErrors = {};
    const digits = form.cardNumber.replace(/\D/g, "");
    if (!luhnCheck(digits) || digits.length < 13) {
      errs.cardNumber = "Please enter a valid card number.";
    }
    if (!isValidExpiry(form.expiry)) {
      errs.expiry = "Enter a valid expiry date (MM/YY, current or future).";
    }
    const cvcDigits = form.cvc.replace(/\D/g, "");
    if (cvcDigits.length < 3 || cvcDigits.length > 4) {
      errs.cvc = "CVC must be 3 or 4 digits.";
    }
    if (form.name.trim().length < 2) {
      errs.name = "Please enter the cardholder name.";
    }
    return errs;
  }

  const isValid = Object.keys(validate()).length === 0;

  function handleCardNumberChange(e: React.ChangeEvent<HTMLInputElement>) {
    const formatted = formatCardNumber(e.target.value);
    setForm((prev) => ({ ...prev, cardNumber: formatted }));
  }

  function handleExpiryChange(e: React.ChangeEvent<HTMLInputElement>) {
    let val = e.target.value.replace(/\D/g, "").slice(0, 4);
    if (val.length >= 3) val = `${val.slice(0, 2)}/${val.slice(2)}`;
    setForm((prev) => ({ ...prev, expiry: val }));
  }

  function handleCvcChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value.replace(/\D/g, "").slice(0, 4);
    setForm((prev) => ({ ...prev, cvc: val }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    const digits = form.cardNumber.replace(/\D/g, "");
    onSubmit(digits.slice(-4));
  }

  const inputClass = "w-full min-h-[56px] rounded-xl bg-gray-800 border border-gray-700 px-4 text-white text-base placeholder-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900";
  const labelClass = "block text-xs font-bold uppercase tracking-widest text-gray-500 mb-1.5";
  const errorClass = "mt-1 text-xs text-danger-400";

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      aria-label="Manual card entry"
      className="space-y-4"
    >
      <div>
        <label htmlFor="cardNumber" className={labelClass}>Card Number</label>
        <input
          id="cardNumber"
          type="text"
          inputMode="numeric"
          autoComplete="cc-number"
          placeholder="0000 0000 0000 0000"
          value={form.cardNumber}
          onChange={handleCardNumberChange}
          className={inputClass}
          aria-describedby={errors.cardNumber ? "cardNumber-error" : undefined}
          aria-invalid={!!errors.cardNumber}
        />
        {errors.cardNumber && (
          <p id="cardNumber-error" className={errorClass} role="alert">{errors.cardNumber}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="expiry" className={labelClass}>Expiry (MM/YY)</label>
          <input
            id="expiry"
            type="text"
            inputMode="numeric"
            autoComplete="cc-exp"
            placeholder="MM/YY"
            value={form.expiry}
            onChange={handleExpiryChange}
            className={inputClass}
            aria-describedby={errors.expiry ? "expiry-error" : undefined}
            aria-invalid={!!errors.expiry}
          />
          {errors.expiry && (
            <p id="expiry-error" className={errorClass} role="alert">{errors.expiry}</p>
          )}
        </div>
        <div>
          <label htmlFor="cvc" className={labelClass}>CVC</label>
          <input
            id="cvc"
            type="text"
            inputMode="numeric"
            autoComplete="cc-csc"
            placeholder="123"
            value={form.cvc}
            onChange={handleCvcChange}
            className={inputClass}
            aria-describedby={errors.cvc ? "cvc-error" : undefined}
            aria-invalid={!!errors.cvc}
          />
          {errors.cvc && (
            <p id="cvc-error" className={errorClass} role="alert">{errors.cvc}</p>
          )}
        </div>
      </div>

      <div>
        <label htmlFor="cardName" className={labelClass}>Cardholder Name</label>
        <input
          id="cardName"
          type="text"
          autoComplete="cc-name"
          placeholder="Jane Smith"
          value={form.name}
          onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
          className={inputClass}
          aria-describedby={errors.name ? "cardName-error" : undefined}
          aria-invalid={!!errors.name}
        />
        {errors.name && (
          <p id="cardName-error" className={errorClass} role="alert">{errors.name}</p>
        )}
      </div>

      <button
        type="submit"
        disabled={!isValid || isPending}
        aria-busy={isPending}
        className="w-full min-h-[56px] rounded-2xl bg-brand-400 px-6 font-black text-black text-base disabled:opacity-40 disabled:cursor-not-allowed hover:bg-brand-300 hover:shadow-[0_0_24px_6px_rgba(250,204,21,0.3)] transition-all duration-200 focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900"
      >
        {isPending ? (
          <span className="flex items-center justify-center gap-2">
            <span className="h-4 w-4 rounded-full border-2 border-black/30 border-t-black animate-spin" />
            Processing…
          </span>
        ) : (
          `Process Payment · ${formatDollars(totalCents)}`
        )}
      </button>

      <button
        type="button"
        onClick={onCancel}
        className="w-full text-sm text-gray-500 hover:text-gray-300 transition-colors py-2 focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900 rounded-lg"
      >
        Cancel
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// CardModePanel
// ---------------------------------------------------------------------------

type StripeTerminalSDK = {
  collectPaymentMethod: (
    clientSecret: string,
  ) => Promise<{
    paymentIntent?: { id: string };
    error?: { message: string };
  }>;
  processPayment: (paymentIntent: { id: string }) => Promise<{
    paymentIntent?: { status: string; id: string };
    error?: { message: string };
  }>;
};

interface CardModePanelProps {
  workOrderId: string;
  totalCents: number;
  isPending: boolean;
  onProcessPayment: (last4?: string) => void;
}

function CardModePanel({ workOrderId, totalCents, isPending, onProcessPayment }: CardModePanelProps) {
  const [tapState, setTapState] = useState<TapState>("awaiting");
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [terminalError, setTerminalError] = useState<string | null>(null);

  async function handleAcceptPayment() {
    setTerminalError(null);

    const terminalSdk = (
      window as Window & { __stripeTerminal?: StripeTerminalSDK }
    ).__stripeTerminal;

    if (!terminalSdk) {
      setTerminalError("Connect a card reader first.");
      return;
    }

    setTapState("processing");
    try {
      const res = await fetch("/api/stripe/payment-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workOrderId, terminalMode: true }),
      });
      if (!res.ok) {
        const errBody: unknown = await res.json().catch(() => ({}));
        const errMsg =
          errBody !== null &&
          typeof errBody === "object" &&
          "error" in errBody &&
          typeof (errBody as { error: unknown }).error === "string"
            ? (errBody as { error: string }).error
            : `HTTP ${res.status}`;
        throw new Error(errMsg);
      }
      const rawIntent: unknown = await res.json();
      const clientSecret =
        rawIntent !== null &&
        typeof rawIntent === "object" &&
        "clientSecret" in rawIntent &&
        typeof (rawIntent as { clientSecret: unknown }).clientSecret === "string"
          ? (rawIntent as { clientSecret: string }).clientSecret
          : null;
      if (!clientSecret) {
        throw new Error("Payment intent response missing clientSecret.");
      }

      const collectResult = await terminalSdk.collectPaymentMethod(clientSecret);
      if (collectResult.error) throw new Error(collectResult.error.message);
      if (!collectResult.paymentIntent) {
        throw new Error("No payment intent returned from terminal.");
      }

      const processResult = await terminalSdk.processPayment(collectResult.paymentIntent);
      if (processResult.error) throw new Error(processResult.error.message);

      onProcessPayment(undefined);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Terminal payment failed.";
      setTerminalError(msg);
      setTapState("awaiting");
    }
  }

  if (showManualEntry) {
    return (
      <div className="space-y-5">
        <button
          type="button"
          onClick={() => setShowManualEntry(false)}
          className="text-sm text-gray-500 hover:text-gray-300 transition-colors focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900 rounded-lg px-2 py-1"
        >
          ← Back to tap reader
        </button>
        <ManualCardEntry
          totalCents={totalCents}
          isPending={isPending}
          onSubmit={(last4) => onProcessPayment(last4)}
          onCancel={() => setShowManualEntry(false)}
        />
      </div>
    );
  }

  const hasTerminal =
    typeof window !== "undefined" &&
    !!(window as Window & { __stripeTerminal?: unknown }).__stripeTerminal;

  return (
    <div className="flex flex-col items-center gap-6">
      {tapState === "awaiting" && (
        <>
          <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">
            Hold card near reader
          </p>
          <RadarAnimation />
          {hasTerminal ? (
            <button
              type="button"
              onClick={handleAcceptPayment}
              disabled={isPending}
              aria-label="Ready to accept payment"
              className="mt-2 rounded-xl bg-brand-400 px-5 py-3 text-sm font-bold text-black hover:bg-brand-300 transition-all duration-200 focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900 disabled:opacity-50"
            >
              Ready to accept payment
            </button>
          ) : (
            <p className="mt-2 text-sm text-gray-500" role="status">
              Connect a card reader first.
            </p>
          )}
          {terminalError && (
            <p className="text-sm text-danger-400" role="alert">
              {terminalError}
            </p>
          )}
        </>
      )}

      {tapState === "processing" && <ProcessingAnimation />}

      {tapState !== "processing" && (
        <button
          type="button"
          onClick={() => setShowManualEntry(true)}
          className="text-xs text-gray-600 hover:text-gray-400 underline underline-offset-2 transition-colors focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900 rounded"
        >
          Card reader not working? Enter manually
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CashCheckPanel
// ---------------------------------------------------------------------------

interface CashCheckPanelProps {
  totalCents: number;
  isPending: boolean;
  onProcessPayment: (subMethod: CashSubMethod) => void;
}

function CashCheckPanel({ totalCents, isPending, onProcessPayment }: CashCheckPanelProps) {
  const [subMethod, setSubMethod] = useState<CashSubMethod>("cash");
  const [confirmStep, setConfirmStep] = useState(false);

  if (confirmStep) {
    return (
      <div className="space-y-5 text-center">
        <p className="text-base font-bold text-white">
          Confirm {subMethod === "cash" ? "Cash" : "Check"} Payment
        </p>
        <p className="text-3xl font-black text-brand-400">{formatDollars(totalCents)}</p>
        <p className="text-sm text-gray-400">
          This action will close the work order and mark it as paid. This cannot be undone.
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setConfirmStep(false)}
            className="flex-1 min-h-[56px] rounded-2xl bg-gray-800 border border-gray-700 px-4 font-bold text-gray-300 hover:bg-gray-700 transition-all duration-200 focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onProcessPayment(subMethod)}
            disabled={isPending}
            aria-busy={isPending}
            className="flex-1 min-h-[56px] rounded-2xl bg-brand-400 px-4 font-black text-black hover:bg-brand-300 hover:shadow-[0_0_24px_6px_rgba(250,204,21,0.3)] transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900"
          >
            {isPending ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 rounded-full border-2 border-black/30 border-t-black animate-spin" />
                Processing…
              </span>
            ) : (
              "Confirm"
            )}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-base font-bold text-white text-center">
        Confirm Cash or Check Payment
      </p>

      {/* Payment sub-method radio */}
      <fieldset aria-label="Payment sub-method">
        <legend className="sr-only">Choose payment sub-method</legend>
        <div className="grid grid-cols-2 gap-3">
          {(["cash", "check"] as const).map((method) => (
            <label
              key={method}
              className={[
                "flex items-center justify-center gap-2 min-h-[64px] rounded-2xl border-2 cursor-pointer transition-all duration-200 font-black text-base",
                subMethod === method
                  ? "bg-brand-400 border-brand-400 text-black"
                  : "bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500",
              ].join(" ")}
            >
              <input
                type="radio"
                name="cashSubMethod"
                value={method}
                checked={subMethod === method}
                onChange={() => setSubMethod(method)}
                className="sr-only"
              />
              {method === "cash" ? "💵 Cash" : "📋 Check"}
            </label>
          ))}
        </div>
      </fieldset>

      <button
        type="button"
        onClick={() => setConfirmStep(true)}
        className="w-full min-h-[64px] rounded-2xl bg-brand-400 px-6 font-black text-black text-lg hover:bg-brand-300 hover:shadow-[0_0_24px_6px_rgba(250,204,21,0.3)] transition-all duration-200 focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900"
      >
        Mark as Paid · {formatDollars(totalCents)}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CheckoutClient — main component
// ---------------------------------------------------------------------------

export function CheckoutClient({ data }: CheckoutClientProps) {
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("card");
  const [isPending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);
  const [completedAt, setCompletedAt] = useState<string | null>(
    data.isPaid ? data.closedAt : null,
  );
  const [completedMethod, setCompletedMethod] = useState<string | null>(
    data.isPaid ? data.paymentMethod : null,
  );

  // Recalculate totals from the stored authoritative values.
  const subtotalCents = data.laborCents + data.partsCents;
  const taxCents = Math.round(subtotalCents * TAX_RATE);
  const totalCents = subtotalCents + taxCents;

  const clientFullName = `${data.client.firstName} ${data.client.lastName}`;
  const vehicleLabel = `${data.vehicle.year} ${data.vehicle.make} ${data.vehicle.model}`;

  const handleCardPayment = useCallback(
    (last4?: string) => {
      setActionError(null);
      startTransition(async () => {
        const result = await processPayment(
          data.workOrderId,
          "card",
          last4 ? { last4, brand: "card_manual" } : undefined,
        );
        if ("error" in result) {
          setActionError(result.error);
        } else {
          setCompletedAt(result.closedAt);
          setCompletedMethod(last4 ? "card_manual" : "card_tap");
        }
      });
    },
    [data.workOrderId],
  );

  const handleCashCheckPayment = useCallback(
    (subMethod: CashSubMethod) => {
      setActionError(null);
      startTransition(async () => {
        const result = await processPayment(
          data.workOrderId,
          "cash_check",
          { last4: "", brand: subMethod },
        );
        if ("error" in result) {
          setActionError(result.error);
        } else {
          setCompletedAt(result.closedAt);
          setCompletedMethod(subMethod);
        }
      });
    },
    [data.workOrderId],
  );

  // If already paid (on mount or after processing), show the completion screen.
  if (completedAt && completedMethod) {
    return (
      <JobCompleteScreen
        data={data}
        closedAt={completedAt}
        paymentMethod={completedMethod}
      />
    );
  }

  return (
    <div
      className="flex min-h-[100dvh] flex-col bg-surface"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 24px)" }}
    >
      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <div className="px-5 pt-5 pb-3 flex items-center gap-3">
        <Link
          href={`/quotes/${data.workOrderId}`}
          className="text-sm text-gray-500 hover:text-gray-300 transition-colors focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900 rounded-lg px-1 py-0.5"
          aria-label="Back to quote"
        >
          ← Back to Quote
        </Link>
      </div>

      <div className="flex-1 flex flex-col gap-6 px-5 pb-6 max-w-lg mx-auto w-full">

        {/* ── WO ID label ────────────────────────────────────────────────── */}
        <p className="text-[10px] font-mono text-gray-700 uppercase tracking-widest">
          WO #{data.workOrderId}
        </p>

        {/* ── Amount Due ─────────────────────────────────────────────────── */}
        <section aria-labelledby="amount-due-heading" className="text-center space-y-1">
          <p
            id="amount-due-heading"
            className="text-xs font-bold uppercase tracking-widest text-gray-500"
          >
            Amount Due
          </p>
          <p
            className="text-6xl sm:text-7xl font-black text-brand-400 checkout-pulse-glow"
            style={{ textShadow: "0 0 40px rgba(250,204,21,0.4)" }}
            aria-label={`Amount due: ${formatDollars(totalCents)}`}
          >
            {formatDollars(totalCents)}
          </p>

          {/* Breakdown */}
          <div className="flex justify-center gap-4 pt-1 flex-wrap">
            {[
              ["Parts", data.partsCents],
              ["Labour", data.laborCents],
              [`Tax (${(TAX_RATE * 100).toFixed(2)}%)`, taxCents],
            ].map(([label, cents]) => (
              <span key={label as string} className="text-xs text-gray-500">
                {label}: <span className="text-gray-300 font-bold">{formatDollars(cents as number)}</span>
              </span>
            ))}
          </div>
        </section>

        {/* ── Client & Vehicle card ───────────────────────────────────────── */}
        <section
          aria-label="Client and vehicle info"
          className="rounded-2xl border border-gray-700 bg-gray-900 px-4 py-4 flex items-center gap-3"
        >
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-white truncate">{clientFullName}</p>
            <p className="text-xs text-gray-400 truncate">{vehicleLabel}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-xs text-gray-600 truncate max-w-[120px]">{data.title}</p>
          </div>
        </section>

        {/* ── Payment Mode Toggle ──────────────────────────────────────────── */}
        <div
          role="group"
          aria-label="Select payment method"
          className="grid grid-cols-2 gap-2 rounded-2xl bg-gray-900 border border-gray-800 p-1"
        >
          {(["card", "cash_check"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={paymentMode === mode}
              onClick={() => setPaymentMode(mode)}
              className={[
                "min-h-[64px] rounded-xl font-black text-base transition-all duration-200 focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900",
                paymentMode === mode
                  ? "bg-brand-400 text-black shadow-[0_0_16px_4px_rgba(250,204,21,0.2)]"
                  : "bg-gray-800 text-gray-400 border border-gray-700 hover:text-gray-200",
              ].join(" ")}
            >
              {mode === "card" ? "💳 Credit Card" : "💵 Cash / Check"}
            </button>
          ))}
        </div>

        {/* ── Payment Panel ────────────────────────────────────────────────── */}
        <section
          aria-label={paymentMode === "card" ? "Card payment" : "Cash or check payment"}
          className="rounded-2xl border-2 border-gray-700 bg-gray-900 px-5 py-6"
        >
          {paymentMode === "card" ? (
            <CardModePanel
              workOrderId={data.workOrderId}
              totalCents={totalCents}
              isPending={isPending}
              onProcessPayment={handleCardPayment}
            />
          ) : (
            <CashCheckPanel
              totalCents={totalCents}
              isPending={isPending}
              onProcessPayment={handleCashCheckPayment}
            />
          )}
        </section>

        {/* ── Error message ────────────────────────────────────────────────── */}
        {actionError && (
          <div
            role="alert"
            className="rounded-2xl border border-danger-500/30 bg-danger-500/10 px-5 py-4"
          >
            <p className="text-sm text-danger-400">{actionError}</p>
          </div>
        )}
      </div>
    </div>
  );
}
