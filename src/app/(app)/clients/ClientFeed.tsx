"use client";

import { useState, useTransition, useMemo } from "react";
import Link from "next/link";
import { checkMaintenanceDue } from "./actions";
import { type MaintenanceBadge } from "@/lib/maintenance";

// ---------------------------------------------------------------------------
// Types — mirror the shape produced by page.tsx's Prisma query.
// ---------------------------------------------------------------------------
export type VehicleData = {
  id: string;
  make: string;
  model: string;
  year: number;
  vin: string | null;
  plate: string | null;
  color: string | null;
  mileageIn: number | null;
  /** Pre-computed on the server; refreshed on-demand via Server Action. */
  maintenanceBadges: MaintenanceBadge[];
};

export type ClientData = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string;
  vehicles: VehicleData[];
};

// ---------------------------------------------------------------------------
// SearchBar — sticky input that drives instant client-side filtering.
// ---------------------------------------------------------------------------
function SearchBar({
  value,
  onChange,
  total,
  filtered,
}: {
  value: string;
  onChange: (v: string) => void;
  total: number;
  filtered: number;
}) {
  return (
    <div className="sticky top-0 z-10 bg-gray-950 px-4 pt-4 pb-3 border-b border-gray-800">
      <label htmlFor="client-search" className="sr-only">
        Search clients
      </label>
      <div className="relative">
        {/* Search icon */}
        <span
          className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-gray-400"
          aria-hidden="true"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </span>
        <input
          id="client-search"
          type="search"
          inputMode="search"
          autoComplete="off"
          placeholder="Search by name, phone, plate…"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={[
            "block w-full rounded-xl pl-10 pr-4 py-3",
            "bg-gray-900 border border-gray-700",
            "text-white text-lg placeholder-gray-500",
            "focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent",
            "min-h-[48px]",
          ].join(" ")}
        />
        {/* Clear button */}
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            aria-label="Clear search"
            className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-white"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>
      {/* Result count */}
      <p className="mt-2 text-sm text-gray-400">
        {value
          ? `${filtered} of ${total} client${total !== 1 ? "s" : ""} matched`
          : `${total} client${total !== 1 ? "s" : ""}`}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MaintenanceBadge — oversized visual upsell tag per vehicle.
// ---------------------------------------------------------------------------
function Badge({ badge }: { badge: MaintenanceBadge }) {
  const isOverdue = badge.urgency === "overdue";
  return (
    <div
      className={[
        "flex flex-col gap-0.5 rounded-xl px-4 py-3",
        isOverdue
          ? "bg-danger-950 border border-danger-700"
          : "bg-yellow-950 border border-yellow-700",
      ].join(" ")}
      role="status"
      aria-label={badge.label}
    >
      <span
        className={[
          "text-xl font-black leading-tight",
          isOverdue ? "text-danger-400" : "text-brand-400",
        ].join(" ")}
      >
        {badge.icon} {badge.label}
      </span>
      <span className="text-sm text-gray-400 leading-snug">{badge.detail}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// VehicleRow — single vehicle inside an expanded client card.
// ---------------------------------------------------------------------------
function VehicleRow({ vehicle }: { vehicle: VehicleData }) {
  const [badges, setBadges] = useState<MaintenanceBadge[]>(
    vehicle.maintenanceBadges
  );
  const [isPending, startTransition] = useTransition();

  const hasBadges = badges.length > 0;

  function refreshBadges() {
    startTransition(async () => {
      const fresh = await checkMaintenanceDue(vehicle.id);
      if (!Array.isArray(fresh)) return; // auth error — keep existing badges
      setBadges(fresh);
    });
  }

  return (
    <div className="rounded-2xl bg-gray-900 border border-gray-700 overflow-hidden">
      {/* Vehicle header */}
      <div className="px-4 py-3 flex items-center gap-3">
        {/* Car icon */}
        <span className="flex-shrink-0 text-gray-400" aria-hidden="true">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-6 w-6"
          >
            <path d="M19 17H5a2 2 0 0 1-2-2v-5l2.5-5h11L19 10v5a2 2 0 0 1-2 2z" />
            <circle cx="7.5" cy="17.5" r="1.5" />
            <circle cx="16.5" cy="17.5" r="1.5" />
          </svg>
        </span>

        <div className="flex-1 min-w-0">
          <p className="text-xl font-bold text-white leading-tight">
            {vehicle.year} {vehicle.make} {vehicle.model}
          </p>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5 text-sm text-gray-400">
            {vehicle.plate && <span>🪪 {vehicle.plate}</span>}
            {vehicle.vin && (
              <span className="font-mono truncate">VIN: {vehicle.vin}</span>
            )}
            {vehicle.color && <span>{vehicle.color}</span>}
          </div>
        </div>

        {/* Mileage chip */}
        {vehicle.mileageIn != null && (
          <div className="flex-shrink-0 text-right">
            <span className="text-2xl font-black text-white tabular-nums">
              {vehicle.mileageIn.toLocaleString()}
            </span>
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">
              mi
            </p>
          </div>
        )}
      </div>

      {/* Maintenance badges */}
      {hasBadges && (
        <div className="px-4 pb-3 flex flex-col gap-2">
          {badges.map((b) => (
            <Badge key={b.service} badge={b} />
          ))}
        </div>
      )}

      {/* Action row */}
      <div className="px-4 pb-4 flex flex-wrap gap-2 items-center">
        <Link
          href={`/work-orders/new?vehicleId=${vehicle.id}`}
          className={[
            "flex-1 flex items-center justify-center gap-2",
            "min-h-[56px] rounded-xl px-5 py-3",
            "bg-brand-400 hover:bg-brand-300 active:bg-brand-500",
            "text-gray-950 font-black text-xl",
            "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-400",
          ].join(" ")}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-6 w-6 flex-shrink-0"
            aria-hidden="true"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="12" y1="18" x2="12" y2="12" />
            <line x1="9" y1="15" x2="15" y2="15" />
          </svg>
          Create Work Order
        </Link>

        {/* Re-check button (only if mileage is set) */}
        {vehicle.mileageIn != null && (
          <button
            type="button"
            onClick={refreshBadges}
            disabled={isPending}
            aria-label="Re-check maintenance"
            className={[
              "flex items-center justify-center",
              "min-h-[56px] min-w-[56px] rounded-xl px-4",
              "bg-gray-800 hover:bg-gray-700 active:bg-gray-600 border border-gray-600",
              "text-gray-300 transition-colors disabled:opacity-50",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400",
            ].join(" ")}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className={["h-6 w-6", isPending ? "animate-spin" : ""].join(" ")}
              aria-hidden="true"
            >
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ClientCard — expandable row in the client feed.
// ---------------------------------------------------------------------------
function ClientCard({ client }: { client: ClientData }) {
  const [isExpanded, setIsExpanded] = useState(false);

  const vehicleCount = client.vehicles.length;
  const alertCount = client.vehicles.reduce(
    (n, v) => n + v.maintenanceBadges.length,
    0
  );
  const fullName = `${client.firstName} ${client.lastName}`;
  const initials = `${client.firstName?.[0] ?? ""}${client.lastName?.[0] ?? ""}`.toUpperCase();

  return (
    <li className="list-none">
      <article className="rounded-2xl bg-gray-900 border border-gray-700 overflow-hidden">
        {/* ── Card header (always visible, tappable) ── */}
        <button
          type="button"
          onClick={() => setIsExpanded((x) => !x)}
          aria-expanded={isExpanded}
          aria-controls={`vehicles-${client.id}`}
          className={[
            "w-full text-left flex items-center gap-4 px-4 py-4",
            "min-h-[72px]",
            "hover:bg-gray-800 active:bg-gray-700 transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-inset",
          ].join(" ")}
        >
          {/* Avatar */}
          <div
            className="flex-shrink-0 h-14 w-14 rounded-full bg-gray-700 flex items-center justify-center"
            aria-hidden="true"
          >
            <span className="text-xl font-black text-white">{initials}</span>
          </div>

          {/* Name + contact */}
          <div className="flex-1 min-w-0">
            <p className="text-2xl font-black text-white leading-tight truncate">
              {fullName}
            </p>
            <p className="text-base text-gray-400 mt-0.5 truncate">
              {client.phone}
            </p>
            {client.email && (
              <p className="text-sm text-gray-500 truncate">{client.email}</p>
            )}
          </div>

          {/* Right-side meta */}
          <div className="flex-shrink-0 flex flex-col items-end gap-1">
            {/* Alert badge */}
            {alertCount > 0 && (
              <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-full bg-danger-600 text-white text-sm font-bold">
                {alertCount} alert{alertCount !== 1 ? "s" : ""}
              </span>
            )}
            {/* Vehicle count */}
            <span className="text-sm text-gray-500">
              {vehicleCount} vehicle{vehicleCount !== 1 ? "s" : ""}
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
                "h-5 w-5 text-gray-500 mt-1 transition-transform duration-200",
                isExpanded ? "rotate-180" : "",
              ].join(" ")}
              aria-hidden="true"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>
        </button>

        {/* ── Expanded vehicle section ── */}
        <div
          id={`vehicles-${client.id}`}
          hidden={!isExpanded}
          className="border-t border-gray-700"
        >
          {vehicleCount === 0 ? (
            <p className="px-4 py-6 text-center text-gray-400 text-lg">
              No vehicles on file.
            </p>
          ) : (
            <div className="px-4 py-4 flex flex-col gap-3">
              {client.vehicles.map((v) => (
                <VehicleRow key={v.id} vehicle={v} />
              ))}
            </div>
          )}
        </div>
      </article>
    </li>
  );
}

// ---------------------------------------------------------------------------
// EmptyState — shown when search matches nothing or the list is empty.
// ---------------------------------------------------------------------------
function EmptyState({ hasQuery }: { hasQuery: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center px-8 py-20 text-center">
      <span className="text-6xl mb-4" aria-hidden="true">
        {hasQuery ? "🔍" : "👥"}
      </span>
      <p className="text-2xl font-bold text-white mb-2">
        {hasQuery ? "No clients matched" : "No clients yet"}
      </p>
      <p className="text-lg text-gray-400 mb-8">
        {hasQuery
          ? "Try a different name, phone number, or plate."
          : "Your first client will appear here when you create a work order."}
      </p>
      {!hasQuery && (
        <Link
          href="/intake"
          className="px-6 py-3 rounded-2xl bg-brand-400 text-gray-950 font-bold text-sm hover:bg-brand-300 active:scale-95 transition-all"
        >
          + New Intake
        </Link>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ClientFeed — the main client-side entry point rendered by page.tsx.
// ---------------------------------------------------------------------------
export function ClientFeed({ clients }: { clients: ClientData[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients;

    return clients.filter((c) => {
      const name = `${c.firstName} ${c.lastName}`.toLowerCase();
      const phone = c.phone.toLowerCase().replace(/\D/g, "");
      const email = (c.email ?? "").toLowerCase();
      const plates = c.vehicles
        .map((v) => (v.plate ?? "").toLowerCase())
        .join(" ");
      const vins = c.vehicles
        .map((v) => (v.vin ?? "").toLowerCase())
        .join(" ");
      const searchTarget = `${name} ${phone} ${email} ${plates} ${vins}`;
      return searchTarget.includes(q.replace(/\D/g, "") || q);
    });
  }, [clients, query]);

  return (
    <div className="flex flex-col min-h-full">
      <SearchBar
        value={query}
        onChange={setQuery}
        total={clients.length}
        filtered={filtered.length}
      />

      <div className="flex-1 px-4 py-4">
        {filtered.length === 0 ? (
          <EmptyState hasQuery={query.trim().length > 0} />
        ) : (
          <ul className="flex flex-col gap-3" role="list" aria-label="Clients">
            {filtered.map((client) => (
              <ClientCard key={client.id} client={client} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
