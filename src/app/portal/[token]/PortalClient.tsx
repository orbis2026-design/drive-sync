"use client";

import { useRef, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import SignatureCanvas from "react-signature-canvas";
import { approveQuote } from "./actions";
import type { PortalData, MpiStatus } from "./actions";

// Dynamically import the 3D viewer — WebGL is client-only, no SSR.
const VehicleViewer = dynamic(
  () => import("@/components/3d-vehicle-viewer"),
  { ssr: false, loading: () => null },
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

function formatDollars(cents: number): string {
  return `$${formatCents(cents)}`;
}

// ---------------------------------------------------------------------------
// MPI Status config
// ---------------------------------------------------------------------------

const MPI_CONFIG: Record<
  NonNullable<MpiStatus>,
  { label: string; bg: string; text: string; dot: string }
> = {
  PASS: {
    label: "Good",
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    dot: "bg-emerald-500",
  },
  MONITOR: {
    label: "Monitor",
    bg: "bg-amber-50",
    text: "text-amber-700",
    dot: "bg-amber-400",
  },
  FAIL: {
    label: "Needs Attention",
    bg: "bg-red-50",
    text: "text-red-700",
    dot: "bg-red-500",
  },
};

const MPI_LABELS: Record<string, string> = {
  fluids: "Fluid Levels",
  tires: "Tires & Wheels",
  brakes: "Brake System",
  belts: "Belts & Hoses",
};

// ---------------------------------------------------------------------------
// MPI icons (simple inline SVG)
// ---------------------------------------------------------------------------

function MpiIcon({ category }: { category: string }) {
  if (category === "fluids") {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5" aria-hidden="true">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z" />
      </svg>
    );
  }
  if (category === "tires") {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5" aria-hidden="true">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm0-14c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm0 10c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4z" />
      </svg>
    );
  }
  if (category === "brakes") {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5" aria-hidden="true">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z" />
      </svg>
    );
  }
  if (category === "belts") {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5" aria-hidden="true">
        <path d="M17 7H7C4.24 7 2 9.24 2 12s2.24 5 5 5h10c2.76 0 5-2.24 5-5s-2.24-5-5-5zm0 8H7c-1.65 0-3-1.35-3-3s1.35-3 3-3h10c1.65 0 3 1.35 3 3s-1.35 3-3 3z" />
      </svg>
    );
  }
  return null;
}

// ---------------------------------------------------------------------------
// MpiCard
// ---------------------------------------------------------------------------

interface MpiCardProps {
  category: string;
  status: MpiStatus;
  note: string;
}

function MpiCard({ category, status, note }: MpiCardProps) {
  const cfg = status ? MPI_CONFIG[status] : null;

  return (
    <div
      className={[
        "rounded-2xl border p-4 flex items-start gap-3",
        cfg ? cfg.bg : "bg-gray-50",
        "border-transparent",
      ].join(" ")}
    >
      <div
        className={[
          "flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center",
          cfg ? cfg.bg : "bg-gray-100",
          cfg ? cfg.text : "text-gray-400",
        ].join(" ")}
      >
        <MpiIcon category={category} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
          <span className="text-sm font-semibold text-gray-900">
            {MPI_LABELS[category] ?? category}
          </span>
          {cfg && (
            <span
              className={[
                "inline-flex items-center gap-1.5 text-xs font-bold px-2 py-0.5 rounded-full",
                cfg.bg,
                cfg.text,
              ].join(" ")}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
              {cfg.label}
            </span>
          )}
        </div>
        {note && (
          <p className="text-xs text-gray-500 leading-relaxed mt-0.5">{note}</p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ReceiptRow
// ---------------------------------------------------------------------------

interface ReceiptRowProps {
  label: string;
  value: string;
  muted?: boolean;
}

function ReceiptRow({ label, value, muted = false }: ReceiptRowProps) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <p className={`text-sm ${muted ? "text-gray-400" : "text-gray-600"}`}>
        {label}
      </p>
      <p
        className={`text-sm font-medium tabular-nums font-mono ${muted ? "text-gray-400" : "text-gray-900"}`}
      >
        {value}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PartLineItem
// ---------------------------------------------------------------------------

interface PartLineItemProps {
  name: string;
  partNumber: string;
  qty: number;
  unitCents: number;
  totalCents: number;
}

function PartLineItem({ name, partNumber, qty, unitCents, totalCents }: PartLineItemProps) {
  return (
    <div className="py-2.5 flex items-start justify-between gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-800 font-medium truncate">{name}</p>
        <p className="text-xs text-gray-400 font-mono mt-0.5">
          #{partNumber} · {qty}× {formatDollars(unitCents)}
        </p>
      </div>
      <p className="text-sm font-semibold text-gray-900 tabular-nums flex-shrink-0">
        {formatDollars(totalCents)}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Confetti animation (CSS keyframes injected inline)
// ---------------------------------------------------------------------------

const CONFETTI_COLORS = [
  "#22c55e", "#3b82f6", "#f59e0b", "#ec4899", "#8b5cf6", "#06b6d4",
];

/** Total number of confetti particles to render. */
const CONFETTI_COUNT = 40;
/** Controls how much horizontal wave variation confetti has (degrees). */
const CONFETTI_WAVE_FREQUENCY = 2.3;
/** Width of the horizontal spread band in percent of viewport. */
const CONFETTI_WAVE_AMPLITUDE = 10;

function ConfettiShower() {
  const pieces = Array.from({ length: CONFETTI_COUNT }, (_, i) => ({
    id: i,
    x: (i / CONFETTI_COUNT) * 100 + (Math.sin(i * CONFETTI_WAVE_FREQUENCY) * CONFETTI_WAVE_AMPLITUDE),
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    delay: (i * 0.06).toFixed(2),
    size: 6 + (i % 5) * 2,
    round: i % 3 === 0,
  }));

  return (
    <>
      <style>{`
        @keyframes confetti-fall {
          0%   { transform: translateY(-10px) rotate(0deg); opacity: 1; }
          80%  { opacity: 1; }
          100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
        }
      `}</style>
      <div
        aria-hidden="true"
        className="fixed inset-0 pointer-events-none overflow-hidden z-50"
      >
        {pieces.map((p) => (
          <div
            key={p.id}
            style={{
              position: "absolute",
              left: `${p.x}%`,
              top: 0,
              width: p.size,
              height: p.size,
              backgroundColor: p.color,
              borderRadius: p.round ? "50%" : "2px",
              animation: `confetti-fall 2.5s ${p.delay}s ease-in forwards`,
            }}
          />
        ))}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// SuccessScreen
// ---------------------------------------------------------------------------

function SuccessScreen({ clientName }: { clientName: string }) {
  return (
    <div className="min-h-[100dvh] bg-white flex flex-col items-center justify-center px-6 py-12 text-center">
      <ConfettiShower />
      <div className="relative flex items-center justify-center w-28 h-28 mb-8">
        <div className="absolute inset-0 rounded-full bg-emerald-100 animate-ping opacity-25" />
        <div className="relative w-24 h-24 rounded-full bg-emerald-500 flex items-center justify-center shadow-xl shadow-emerald-300/50">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-12 h-12"
            aria-hidden="true"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </div>
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-3">
        Repair Authorized!
      </h1>
      <p className="text-gray-500 text-sm leading-relaxed max-w-xs">
        Thank you, {clientName}. Your approval has been recorded and your mechanic
        will begin work shortly. We&apos;ll contact you when your vehicle is ready.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AlreadyApprovedScreen
// ---------------------------------------------------------------------------

function AlreadyApprovedScreen() {
  return (
    <div className="min-h-[100dvh] bg-white flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="w-20 h-20 rounded-full bg-blue-100 flex items-center justify-center mb-6">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="#3b82f6"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-10 h-10"
          aria-hidden="true"
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </div>
      <h1 className="text-xl font-bold text-gray-900 mb-2">Already Approved</h1>
      <p className="text-gray-500 text-sm max-w-xs">
        This repair has already been authorized. Your mechanic will be in touch
        with an update on your vehicle.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PortalClient — main export
// ---------------------------------------------------------------------------

export function PortalClient({
  data,
  token,
}: {
  data: PortalData;
  token: string;
}) {
  const sigRef = useRef<SignatureCanvas>(null);
  const [isSigned, setIsSigned] = useState(false);
  const [approved, setApproved] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (data.status === "COMPLETE") {
    return <AlreadyApprovedScreen />;
  }

  function handleClear() {
    sigRef.current?.clear();
    setIsSigned(false);
    setErrorMsg(null);
  }

  function handleStrokeEnd() {
    setIsSigned(!(sigRef.current?.isEmpty() ?? true));
  }

  function handleAuthorize() {
    if (!sigRef.current || sigRef.current.isEmpty()) {
      setErrorMsg("Please sign above before authorizing.");
      return;
    }
    setErrorMsg(null);
    const dataUrl = sigRef.current.toDataURL("image/png");

    startTransition(async () => {
      const result = await approveQuote(token, dataUrl);
      if ("error" in result) {
        setErrorMsg(result.error);
      } else {
        setApproved(true);
      }
    });
  }

  if (approved) {
    return <SuccessScreen clientName={data.client.firstName} />;
  }

  const mpiCategories = ["fluids", "tires", "brakes", "belts"] as const;

  return (
    <div className="min-h-[100dvh] bg-gray-50">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="bg-white border-b border-gray-100 px-5 py-4 flex items-center gap-3 sticky top-0 z-10">
        <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
          <svg viewBox="0 0 24 24" fill="white" className="w-4 h-4" aria-hidden="true">
            <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
            Repair Authorization
          </p>
          <p className="text-sm font-semibold text-gray-900 truncate">
            {data.vehicle.year} {data.vehicle.make} {data.vehicle.model}
          </p>
        </div>
      </header>

      <main className="px-4 py-6 max-w-lg mx-auto space-y-4 pb-10">
        {/* ── Greeting card ─────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-5 py-5">
          <p className="text-xs text-blue-600 font-bold uppercase tracking-widest mb-1">
            Hello, {data.client.firstName}
          </p>
          <h1 className="text-lg font-bold text-gray-900 leading-tight mb-2">
            {data.title}
          </h1>
          <p className="text-sm text-gray-500 leading-relaxed">
            Your mechanic has completed the inspection of your{" "}
            <span className="font-medium text-gray-700">
              {data.vehicle.year} {data.vehicle.make} {data.vehicle.model}
            </span>
            {data.vehicle.mileageIn
              ? ` at ${data.vehicle.mileageIn.toLocaleString()} miles`
              : ""}
            . Review the findings and authorize repairs below.
          </p>
        </div>

        {/* ── MPI Results ───────────────────────────────────────────────── */}
        {data.mpi && (
          <section
            aria-labelledby="mpi-heading"
            className="bg-white rounded-2xl shadow-sm border border-gray-100 px-5 py-5"
          >
            <h2
              id="mpi-heading"
              className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3"
            >
              Multi-Point Inspection
            </h2>
            <div className="space-y-2">
              {mpiCategories.map((key) => {
                const point = data.mpi![key];
                return (
                  <MpiCard
                    key={key}
                    category={key}
                    status={point?.status ?? null}
                    note={point?.note ?? ""}
                  />
                );
              })}
            </div>
          </section>
        )}

        {/* ── 3D Vehicle Handoff Visualizer ─────────────────────────────── */}
        {data.mpi && (
          <section
            aria-labelledby="viewer-heading"
            className="bg-white rounded-2xl shadow-sm border border-gray-100 px-5 py-5"
          >
            <h2
              id="viewer-heading"
              className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3"
            >
              3D Vehicle Inspection View
            </h2>
            <p className="text-xs text-gray-400 mb-3">
              Drag to rotate · Pinch to zoom · Red = needs attention
            </p>
            <VehicleViewer mpi={data.mpi} heightClass="h-56" />
          </section>
        )}

        {/* ── Itemized Bill ─────────────────────────────────────────────── */}
        <section
          aria-labelledby="bill-heading"
          className="bg-white rounded-2xl shadow-sm border border-gray-100 px-5 py-5"
        >
          <h2
            id="bill-heading"
            className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3"
          >
            Estimate Breakdown
          </h2>

          {/* Parts line items */}
          {data.parts.length > 0 && (
            <div className="divide-y divide-gray-100 mb-3">
              {data.parts.map((p) => (
                <PartLineItem
                  key={p.partId}
                  name={p.name}
                  partNumber={p.partNumber}
                  qty={p.quantity}
                  unitCents={p.retailPriceCents}
                  totalCents={p.retailPriceCents * p.quantity}
                />
              ))}
            </div>
          )}

          {/* Subtotals */}
          <div className="border-t border-gray-100 divide-y divide-gray-50">
            <ReceiptRow label="Parts" value={formatDollars(data.partsCents)} muted={data.partsCents === 0} />
            <ReceiptRow label="Labor" value={formatDollars(data.laborCents)} />
            <ReceiptRow label="Tax (8.75%)" value={formatDollars(data.taxCents)} muted />
          </div>

          {/* Grand total */}
          <div className="mt-4 rounded-xl bg-blue-600 px-5 py-4 flex items-center justify-between">
            <p className="text-white font-semibold">Total</p>
            <p className="text-white font-black text-2xl tabular-nums">
              {formatDollars(data.totalCents)}
            </p>
          </div>
        </section>

        {/* ── Signature Pad ─────────────────────────────────────────────── */}
        <section
          aria-labelledby="sig-heading"
          className="bg-white rounded-2xl shadow-sm border border-gray-100 px-5 py-5"
        >
          <h2
            id="sig-heading"
            className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1"
          >
            Digital Signature
          </h2>
          <p className="text-sm text-gray-500 mb-4 leading-relaxed">
            By signing below, you authorize the shop to proceed with the
            repairs listed above at the quoted price.
          </p>

          {/* Canvas wrapper */}
          <div className="relative rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 overflow-hidden">
            <SignatureCanvas
              ref={sigRef}
              penColor="#1d4ed8"
              canvasProps={{
                className: "w-full block",
                style: { height: 160, touchAction: "none", display: "block" },
              }}
              onEnd={handleStrokeEnd}
            />
            {!isSigned && (
              <p
                aria-hidden="true"
                className="absolute inset-0 flex items-center justify-center text-sm text-gray-300 pointer-events-none select-none"
              >
                Sign here with your finger
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={handleClear}
            className="mt-2 text-xs text-gray-400 hover:text-gray-600 transition-colors underline underline-offset-2"
          >
            Clear
          </button>
        </section>

        {/* ── Error ─────────────────────────────────────────────────────── */}
        {errorMsg && (
          <div
            role="alert"
            className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 font-medium"
          >
            {errorMsg}
          </div>
        )}

        {/* ── Authorize CTA ─────────────────────────────────────────────── */}
        <button
          type="button"
          onClick={handleAuthorize}
          disabled={!isSigned || isPending}
          className={[
            "w-full rounded-2xl py-4 px-6 text-base font-bold tracking-wide transition-all",
            "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2",
            "active:scale-[0.98]",
            isSigned && !isPending
              ? "bg-blue-600 text-white shadow-lg shadow-blue-500/25 hover:bg-blue-700"
              : "bg-gray-100 text-gray-400 cursor-not-allowed",
          ].join(" ")}
        >
          {isPending ? "Processing…" : `Authorize ${formatDollars(data.totalCents)}`}
        </button>

        <p className="text-center text-xs text-gray-400 leading-relaxed">
          This authorization is a binding agreement to pay the quoted amount
          upon completion of the described repairs.
        </p>
      </main>
    </div>
  );
}
