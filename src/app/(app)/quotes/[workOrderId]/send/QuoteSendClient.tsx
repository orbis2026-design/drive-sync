"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition, useState } from "react";
import { sendQuote, type SendPageData, type SelectedPart } from "../actions";
import { TAX_RATE } from "../constants";
import { NativeSmsButton } from "@/components/sms-button";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return raw;
}

// ---------------------------------------------------------------------------
// SupplierBadge
// ---------------------------------------------------------------------------

function SupplierBadge({ supplier }: { supplier: SelectedPart["supplier"] }) {
  const isAutoZone = supplier === "AutoZone";
  return (
    <span
      className={[
        "inline-flex items-center rounded-full border px-2 py-0.5",
        "text-[10px] font-black tracking-widest uppercase",
        isAutoZone
          ? "bg-brand-400/20 text-brand-400 border-brand-400/40"
          : "bg-success-500/20 text-success-400 border-success-500/40",
      ].join(" ")}
    >
      {supplier}
    </span>
  );
}

// ---------------------------------------------------------------------------
// QuoteSummaryCard
// ---------------------------------------------------------------------------

interface QuoteSummaryCardProps {
  data: SendPageData;
  partsSubtotalCents: number;
  taxCents: number;
  totalCents: number;
}

function QuoteSummaryCard({
  data,
  partsSubtotalCents,
  taxCents,
  totalCents,
}: QuoteSummaryCardProps) {
  const rows: [string, number][] = [
    ["Parts", partsSubtotalCents],
    ["Labour", data.laborCents],
    ["Subtotal", partsSubtotalCents + data.laborCents],
    [`Tax (${(TAX_RATE * 100).toFixed(2)}%)`, taxCents],
  ];

  return (
    <section
      aria-labelledby="summary-heading"
      className="rounded-2xl border-2 border-gray-700 bg-gray-900 px-5 py-5 space-y-4"
    >
      <h2
        id="summary-heading"
        className="text-xs font-bold uppercase tracking-widest text-gray-500"
      >
        Quote Summary
      </h2>

      {/* Totals grid */}
      <div className="grid grid-cols-2 gap-2">
        {rows.map(([label, cents]) => (
          <div key={label} className="rounded-xl bg-gray-800 px-3 py-2">
            <p className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">
              {label}
            </p>
            <p className="text-sm font-black text-white">
              ${formatCents(cents)}
            </p>
          </div>
        ))}
      </div>

      {/* Grand total */}
      <div className="flex items-center justify-between rounded-xl bg-gray-800 border border-gray-700 px-4 py-3">
        <p className="text-xs font-bold uppercase tracking-widest text-gray-500">
          Grand Total
        </p>
        <p
          className="text-2xl font-black text-brand-400"
          style={{ textShadow: "0 0 16px rgba(250,204,21,0.5)" }}
        >
          ${formatCents(totalCents)}
        </p>
      </div>

      {/* Parts ledger */}
      {data.parts.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-600">
            Parts · {data.parts.length} line{data.parts.length !== 1 ? "s" : ""}
          </p>
          <ul className="space-y-2" aria-label="Parts ledger">
            {data.parts.map((part) => (
              <li
                key={part.partId}
                className="flex items-center justify-between gap-3 rounded-xl bg-gray-800 border border-gray-700 px-3 py-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <SupplierBadge supplier={part.supplier} />
                  <p className="text-xs font-bold text-white truncate">
                    {part.name}
                  </p>
                </div>
                <p className="text-xs font-black text-white flex-shrink-0">
                  ${formatCents(part.retailPriceCents * part.quantity)}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// SMSPreviewCard
// ---------------------------------------------------------------------------

interface SMSPreviewCardProps {
  clientName: string;
}

function SMSPreviewCard({ clientName }: SMSPreviewCardProps) {
  const portalBaseUrl =
    process.env.NEXT_PUBLIC_PORTAL_BASE_URL ?? "https://app.domain.com";
  const previewToken = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx";
  const previewUrl = `${portalBaseUrl}/portal/${previewToken}`;
  const previewBody =
    `Your mechanic has finished diagnosing your vehicle. ` +
    `Tap here to review and approve the repair quote: ${previewUrl}`;

  return (
    <section
      aria-labelledby="sms-preview-heading"
      className="rounded-2xl border-2 border-gray-700 bg-gray-900 px-5 py-5 space-y-3"
    >
      <div className="flex items-center justify-between">
        <h2
          id="sms-preview-heading"
          className="text-xs font-bold uppercase tracking-widest text-gray-500"
        >
          SMS Preview
        </h2>
        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-600">
          To: {clientName}
        </span>
      </div>

      {/* Simulated SMS bubble */}
      <div className="flex justify-end">
        <div
          className={[
            "max-w-[85%] rounded-2xl rounded-tr-sm",
            "bg-[#1e88e5] px-4 py-3",
            "text-xs text-white leading-relaxed",
          ].join(" ")}
        >
          {previewBody}
        </div>
      </div>

      <p className="text-[10px] text-gray-600 text-center">
        A unique approval link is generated per quote
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// QuoteSendClient — top-level client component
// ---------------------------------------------------------------------------

interface QuoteSendClientProps {
  data: SendPageData;
}

export function QuoteSendClient({ data }: QuoteSendClientProps) {
  const router = useRouter();
  const [isSending, startSendTransition] = useTransition();
  const [sendError, setSendError] = useState<string | null>(null);
  const [isSent, setIsSent] = useState(false);
  const [smsReady, setSmsReady] = useState<{ portalUrl: string; smsBody: string } | null>(null);

  // Recalculate totals from the authoritative locked values.
  const partsSubtotalCents = data.partsCents;
  const subtotalCents = partsSubtotalCents + data.laborCents;
  const taxCents = Math.round(subtotalCents * TAX_RATE);
  const totalCents = subtotalCents + taxCents;

  const clientFullName = `${data.client.firstName} ${data.client.lastName}`;
  const vehicleLabel = `${data.vehicle.year} ${data.vehicle.make} ${data.vehicle.model}`;

  function handleSend() {
    if (isSending || isSent) return;

    startSendTransition(async () => {
      setSendError(null);

      const result = await sendQuote(data.workOrderId);

      if ("error" in result) {
        setSendError(result.error);
        return;
      }

      setIsSent(true);
      setSmsReady({ portalUrl: result.portalUrl, smsBody: result.smsBody });
    });
  }

  return (
    <div className="min-h-[100dvh] px-4 py-6 sm:px-6 sm:py-8 pb-[calc(env(safe-area-inset-bottom)+32px)]">
      <div className="mx-auto max-w-lg space-y-6">

        {/* ── Page header ────────────────────────────────────────────────── */}
        <div className="space-y-1">
          <Link
            href={`/quotes/${data.workOrderId}`}
            className="inline-flex items-center gap-1 text-xs font-bold text-gray-500 hover:text-gray-300 transition-colors mb-3"
          >
            ← Back to Quote Builder
          </Link>
          <h1 className="text-4xl font-black text-white tracking-tight">
            Send Quote
          </h1>
          <p className="text-sm text-gray-400 leading-relaxed">
            Review everything below, then send the approval link to your client
            via SMS.
          </p>
        </div>

        {/* ── Client + vehicle card ──────────────────────────────────────── */}
        <section
          aria-labelledby="client-heading"
          className="rounded-2xl border-2 border-gray-700 bg-gray-900 px-5 py-4 space-y-2"
        >
          <h2
            id="client-heading"
            className="text-xs font-bold uppercase tracking-widest text-gray-500"
          >
            Client
          </h2>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-base font-black text-white">{clientFullName}</p>
              <p className="text-sm text-gray-400">{vehicleLabel}</p>
              <p className="text-xs font-mono text-gray-600 mt-0.5 uppercase tracking-widest">
                WO · {data.workOrderId}
              </p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">
                Phone
              </p>
              <p className="text-sm font-black text-white">
                {formatPhone(data.client.phone)}
              </p>
            </div>
          </div>
        </section>

        {/* ── Quote summary ─────────────────────────────────────────────── */}
        <QuoteSummaryCard
          data={data}
          partsSubtotalCents={partsSubtotalCents}
          taxCents={taxCents}
          totalCents={totalCents}
        />

        {/* ── SMS preview ───────────────────────────────────────────────── */}
        <SMSPreviewCard clientName={clientFullName} />

        {/* ── Send error ────────────────────────────────────────────────── */}
        {sendError && (
          <p role="alert" className="text-sm text-danger-400 font-medium px-1">
            {sendError}
          </p>
        )}

        {smsReady ? (
          /* ── Native SMS button — opens the device SMS app ──────────────── */
          <div className="space-y-3">
            <NativeSmsButton
              phoneNumber={data.client.phone}
              messageBody={smsReady.smsBody}
              label="Open SMS App"
            />
            <button
              type="button"
              onClick={() => router.push("/clients")}
              className="w-full text-center text-xs text-gray-500 hover:text-gray-300 transition-colors py-2"
            >
              Done — back to Clients
            </button>
          </div>
        ) : (
          /* ── Prepare link button — calls the server action ──────────────── */
          <button
            type="button"
            onClick={handleSend}
            disabled={isSending}
            aria-busy={isSending}
            className={[
              "relative flex w-full items-center justify-center gap-3",
              "min-h-[80px] rounded-2xl",
              "text-xl font-black uppercase tracking-widest",
              isSending
                ? "bg-brand-400 text-gray-950 opacity-70 cursor-not-allowed shadow-none"
                : [
                    "bg-brand-400 text-gray-950",
                    "shadow-[0_0_40px_10px_rgba(250,204,21,0.50)]",
                    "hover:bg-brand-300 hover:shadow-[0_0_56px_16px_rgba(250,204,21,0.70)]",
                    "active:scale-[0.98]",
                  ].join(" "),
              "transition-all duration-300",
              "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900",
            ].join(" ")}
          >
            {isSending ? (
              <>
                <span
                  className="h-6 w-6 rounded-full border-[3px] border-black/30 border-t-black animate-spin"
                  aria-hidden="true"
                />
                Preparing…
              </>
            ) : (
              <>
                <span aria-hidden="true">🔗</span>
                Prepare Quote Link
              </>
            )}
          </button>
        )}

        <p className="text-[10px] text-gray-600 text-center pb-6">
          The client will receive a secure one-time link to review and approve
          the quote.
        </p>

      </div>
    </div>
  );
}
