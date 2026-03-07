"use client";

import { useState } from "react";
import { type GloveboxData, type GloveboxWorkOrder } from "./page";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  });
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

// ---------------------------------------------------------------------------
// ReceiptButton — simulated PDF download
// ---------------------------------------------------------------------------

function ReceiptButton({ wo }: { wo: GloveboxWorkOrder }) {
  function handleDownload() {
    // Simulated PDF: generate a simple text blob as a stand-in
    const content = [
      "DriveSync — Service Receipt",
      "─────────────────────────────────",
      `Job: ${wo.title}`,
      `Date: ${formatDate(wo.closedAt)}`,
      `Description: ${wo.description}`,
      "─────────────────────────────────",
      `Total: ${formatCents(wo.totalCents)}`,
      "",
      "Thank you for your business!",
    ].join("\n");

    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `receipt-${wo.id.slice(0, 8)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button
      type="button"
      onClick={handleDownload}
      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-gray-300 text-sm font-semibold text-gray-700 bg-white hover:bg-gray-50 active:bg-gray-100 transition-colors"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4 w-4"
        aria-hidden="true"
      >
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
      Receipt
    </button>
  );
}

// ---------------------------------------------------------------------------
// WorkOrderAccordion — expandable service history item
// ---------------------------------------------------------------------------

function WorkOrderAccordion({ wo }: { wo: GloveboxWorkOrder }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border border-gray-200 rounded-2xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((x) => !x)}
        aria-expanded={open}
        className="w-full flex items-center gap-3 px-4 py-4 text-left bg-white hover:bg-gray-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-inset"
      >
        {/* Date */}
        <span className="text-xs text-gray-400 flex-shrink-0 w-24 tabular-nums">
          {formatDate(wo.closedAt)}
        </span>

        {/* Title */}
        <span className="flex-1 font-semibold text-sm text-gray-800 truncate">
          {wo.title}
        </span>

        {/* Total */}
        <span className="text-sm font-black text-gray-900 tabular-nums flex-shrink-0">
          {formatCents(wo.totalCents)}
        </span>

        {/* Chevron */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={[
            "flex-shrink-0 h-4 w-4 text-gray-400 transition-transform duration-200",
            open ? "rotate-180" : "",
          ].join(" ")}
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="border-t border-gray-100 px-4 py-4 bg-gray-50 flex flex-col gap-3">
          <p className="text-sm text-gray-600">{wo.description}</p>
          <ReceiptButton wo={wo} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// VehicleCard — garage card for a single vehicle
// ---------------------------------------------------------------------------

function VehicleCard({
  vehicle,
}: {
  vehicle: GloveboxData["vehicles"][number];
}) {
  const workOrders = vehicle.workOrders;

  return (
    <section className="rounded-3xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      {/* Vehicle header */}
      <div className="bg-gradient-to-br from-gray-900 to-gray-800 px-6 py-5">
        <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-1">
          {vehicle.year}
        </p>
        <p className="text-2xl font-black text-white">
          {vehicle.make} {vehicle.model}
        </p>
        <div className="flex items-center gap-3 mt-2 flex-wrap">
          {vehicle.plate && (
            <span className="inline-flex items-center gap-1 text-xs text-gray-300 font-mono bg-white/10 px-2.5 py-1 rounded-lg">
              🪪 {vehicle.plate}
            </span>
          )}
          {vehicle.color && (
            <span className="text-xs text-gray-400 capitalize">
              {vehicle.color}
            </span>
          )}
        </div>
      </div>

      {/* Specs grid */}
      <div className="grid grid-cols-3 divide-x divide-gray-100 border-b border-gray-100">
        <div className="px-4 py-3 text-center">
          <p className="text-xs text-gray-400 font-medium mb-1">Mileage</p>
          <p className="text-base font-black text-gray-900">
            {vehicle.mileageIn != null
              ? vehicle.mileageIn.toLocaleString()
              : "—"}
          </p>
        </div>
        <div className="px-4 py-3 text-center">
          <p className="text-xs text-gray-400 font-medium mb-1">Oil Type</p>
          <p className="text-sm font-bold text-gray-900">
            {vehicle.oilType ?? "—"}
          </p>
        </div>
        <div className="px-4 py-3 text-center">
          <p className="text-xs text-gray-400 font-medium mb-1">Tire Size</p>
          <p className="text-sm font-bold text-gray-900 font-mono">
            {vehicle.tireSize ?? "—"}
          </p>
        </div>
      </div>

      {/* Service history */}
      {workOrders.length > 0 ? (
        <div className="px-4 py-4 flex flex-col gap-2">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
            Service History
          </p>
          {workOrders.map((wo) => (
            <WorkOrderAccordion key={wo.id} wo={wo} />
          ))}
        </div>
      ) : (
        <div className="px-4 py-6 text-center">
          <p className="text-sm text-gray-400">No completed services yet.</p>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// RequestServiceButton — sticky CTA
// ---------------------------------------------------------------------------

function RequestServiceButton({ clientName }: { clientName: string }) {
  function handleRequest() {
    // In production: call a Server Action to push an alert to the mechanic dashboard.
    alert(
      `✅ Your request has been sent!\n\nA mobile technician will contact you shortly, ${clientName}.`,
    );
  }

  return (
    <button
      type="button"
      onClick={handleRequest}
      className={[
        "w-full py-4 px-6 rounded-2xl",
        "bg-blue-600 hover:bg-blue-700 active:bg-blue-800",
        "text-white font-black text-lg uppercase tracking-wider",
        "shadow-lg shadow-blue-600/30",
        "transition-all active:scale-[0.98]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2",
      ].join(" ")}
    >
      🔧 Request Mobile Service
    </button>
  );
}

// ---------------------------------------------------------------------------
// GloveboxClient — main export
// ---------------------------------------------------------------------------

export function GloveboxClient({ data }: { data: GloveboxData }) {
  const clientName = `${data.client.firstName} ${data.client.lastName}`;

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 pt-8 pb-6 shadow-sm">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-3xl" aria-hidden="true">
              🚗
            </span>
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Vehicle Hub
              </p>
              <h1 className="text-2xl font-black text-gray-900">{clientName}</h1>
            </div>
          </div>
          {data.client.email && (
            <p className="text-sm text-gray-500 mt-1">{data.client.email}</p>
          )}
        </div>
      </header>

      {/* Content */}
      <main className="max-w-2xl mx-auto px-4 py-6 pb-32 flex flex-col gap-6">
        {data.vehicles.length === 0 ? (
          <div className="text-center py-16">
            <span className="text-5xl mb-4 block" aria-hidden="true">
              🔍
            </span>
            <p className="text-xl font-bold text-gray-700 mb-2">No vehicles on file</p>
            <p className="text-gray-500">
              Ask your mechanic to add your vehicle to get started.
            </p>
          </div>
        ) : (
          data.vehicles.map((v) => <VehicleCard key={v.id} vehicle={v} />)
        )}
      </main>

      {/* Sticky request button */}
      <div
        className={[
          "fixed bottom-0 left-0 right-0 z-50",
          "bg-white/95 backdrop-blur border-t border-gray-200",
          "px-4 py-4",
          "pb-[calc(1rem+env(safe-area-inset-bottom))]",
        ].join(" ")}
      >
        <div className="max-w-2xl mx-auto">
          <RequestServiceButton clientName={data.client.firstName} />
        </div>
      </div>
    </div>
  );
}
