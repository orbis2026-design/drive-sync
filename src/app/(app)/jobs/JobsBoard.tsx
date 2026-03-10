"use client";

import { useOptimistic, useTransition, useState } from "react";
import Link from "next/link";
import { type JobCard, type ActiveStatus, advanceWorkOrderStatus } from "./actions";
import { useToast } from "@/components/Toast";

// ---------------------------------------------------------------------------
// Status configuration
// ---------------------------------------------------------------------------

/**
 * Pipeline stages shown in workflow order (earliest → latest).
 * Each status maps to a human-readable label, a colour-coded dot, and the
 * next logical workflow destination the mechanic should navigate to.
 */
const STATUS_CONFIG: Record<
  ActiveStatus,
  {
    label: string;
    /** Glow dot Tailwind classes (bg + box-shadow). */
    dotClasses: string;
    /** Subtle section header accent. */
    headerAccent: string;
    /** The href prefix for the CTA action on each card. */
    actionHref: (id: string) => string;
    actionLabel: string;
  }
> = {
  INTAKE: {
    label: "Estimating",
    dotClasses:
      "bg-brand-400 shadow-[0_0_8px_3px_rgba(250,204,21,0.7)]",
    headerAccent: "border-brand-400/40 bg-brand-400/5",
    actionHref: (id) => `/diagnostics/${id}`,
    actionLabel: "Open",
  },
  ACTIVE: {
    label: "Waiting on Parts",
    dotClasses:
      "bg-orange-400 shadow-[0_0_8px_3px_rgba(251,146,60,0.7)]",
    headerAccent: "border-orange-400/40 bg-orange-400/5",
    actionHref: (id) => `/parts/${id}`,
    actionLabel: "Parts",
  },
  PENDING_APPROVAL: {
    label: "Pending Client Approval",
    dotClasses:
      "bg-sky-400 shadow-[0_0_8px_3px_rgba(56,189,248,0.7)]",
    headerAccent: "border-sky-400/40 bg-sky-400/5",
    actionHref: (id) => `/quotes/${id}/send`,
    actionLabel: "Quote",
  },
  COMPLETE: {
    label: "Approved — Wrenching",
    dotClasses:
      "bg-success-400 shadow-[0_0_8px_3px_rgba(74,222,128,0.7)]",
    headerAccent: "border-success-400/40 bg-success-400/5",
    actionHref: (id) => `/checkout/${id}`,
    actionLabel: "Checkout",
  },
  INVOICED: {
    label: "Ready for Payment",
    dotClasses:
      "bg-purple-400 shadow-[0_0_8px_3px_rgba(196,181,253,0.7)]",
    headerAccent: "border-purple-400/40 bg-purple-400/5",
    actionHref: (id) => `/checkout/${id}`,
    actionLabel: "Collect",
  },
};

/** Pipeline display order — workflow sequence from first to last step. */
const PIPELINE_ORDER: ActiveStatus[] = [
  "INTAKE",
  "ACTIVE",
  "PENDING_APPROVAL",
  "COMPLETE",
  "INVOICED",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// DriveSync is a US-market product; all monetary values are stored in USD cents.
function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function relativeAge(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const days = Math.floor(diffMs / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days}d ago`;
}

// ---------------------------------------------------------------------------
// JobCard component
// ---------------------------------------------------------------------------

/** Label for the "advance to next status" button, keyed by current status. */
const ADVANCE_LABEL: Partial<Record<ActiveStatus, string>> = {
  INTAKE: "→ Active",
  COMPLETE: "→ Invoice",
};

function JobCardRow({
  job,
  onAdvance,
}: {
  job: JobCard;
  onAdvance: (id: string) => void;
}) {
  const cfg = STATUS_CONFIG[job.status];
  const fullName = `${job.client.firstName} ${job.client.lastName}`;
  const vehicle = `${job.vehicle.year} ${job.vehicle.make} ${job.vehicle.model}`;
  const advanceLabel = ADVANCE_LABEL[job.status];

  return (
    <article className="flex items-stretch gap-3 rounded-2xl bg-gray-900 border border-gray-700 overflow-hidden hover:border-gray-500 transition-colors">
      {/* Left status strip */}
      <div className="flex items-center px-3">
        <span
          className={[
            "flex-shrink-0 h-3 w-3 rounded-full",
            cfg.dotClasses,
          ].join(" ")}
          aria-hidden="true"
        />
      </div>

      {/* Main content — title links to Job Card hub */}
      <div className="flex-1 min-w-0 py-3 pr-1">
        <Link
          href={`/work-orders/${job.id}`}
          className="block font-black text-white leading-tight truncate hover:text-brand-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 rounded"
        >
          {fullName}
        </Link>
        <p className="text-sm text-gray-400 truncate mt-0.5">{vehicle}</p>
        <p className="text-xs text-gray-500 mt-1 truncate">{job.title}</p>
      </div>

      {/* Right meta + CTA */}
      <div className="flex flex-col items-end justify-between py-3 pr-3 gap-2 flex-shrink-0">
        {/* Total or placeholder */}
        <span className="text-base font-black text-white tabular-nums">
          {job.totalCents !== null ? formatCents(job.totalCents) : "—"}
        </span>
        {/* Age chip */}
        <span className="text-xs text-gray-500">{relativeAge(job.createdAt)}</span>
        {/* Action link */}
        <div className="flex items-center gap-1.5">
          <Link
            href={`/work-orders/${job.id}`}
            className={[
              "inline-flex items-center justify-center",
              "px-2 py-1 rounded-lg",
              "bg-gray-700 hover:bg-gray-600 border border-gray-600",
              "text-[11px] font-bold text-gray-300",
              "transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400",
            ].join(" ")}
          >
            Job
          </Link>
          {advanceLabel && (
            <button
              type="button"
              onClick={() => onAdvance(job.id)}
              aria-label={`Advance ${fullName}'s job to ${advanceLabel}`}
              className={[
                "inline-flex items-center justify-center",
                "px-2 py-1 rounded-lg",
                "bg-brand-400/10 hover:bg-brand-400/20 active:bg-brand-400/30 border border-brand-400/40",
                "text-[11px] font-bold text-brand-400",
                "transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400",
              ].join(" ")}
            >
              {advanceLabel}
            </button>
          )}
          <Link
            href={cfg.actionHref(job.id)}
            className={[
              "inline-flex items-center justify-center",
              "px-3 py-1 rounded-lg",
              "bg-gray-800 hover:bg-gray-700 active:bg-gray-600 border border-gray-600",
              "text-xs font-bold text-white",
              "transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400",
            ].join(" ")}
          >
            {cfg.actionLabel}
          </Link>
        </div>
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// LaneAccordion — collapsible status lane
// ---------------------------------------------------------------------------

function LaneAccordion({
  status,
  jobs,
  defaultOpen,
  onAdvance,
}: {
  status: ActiveStatus;
  jobs: JobCard[];
  defaultOpen: boolean;
  onAdvance: (id: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const cfg = STATUS_CONFIG[status];
  const count = jobs.length;

  return (
    <section className={["rounded-2xl border overflow-hidden", cfg.headerAccent].join(" ")}>
      {/* Accordion header */}
      <button
        type="button"
        onClick={() => setIsOpen((x) => !x)}
        aria-expanded={isOpen}
        className={[
          "w-full flex items-center gap-3 px-4 py-3 text-left",
          "hover:brightness-110 active:brightness-90 transition",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-inset",
          "min-h-[52px]",
        ].join(" ")}
      >
        {/* Status dot */}
        <span
          className={[
            "flex-shrink-0 h-3 w-3 rounded-full",
            cfg.dotClasses,
          ].join(" ")}
          aria-hidden="true"
        />

        {/* Label */}
        <span className="flex-1 text-sm font-black text-white uppercase tracking-wide leading-tight">
          {cfg.label}
        </span>

        {/* Count badge */}
        <span
          className={[
            "flex-shrink-0 flex items-center justify-center",
            "h-6 min-w-[1.5rem] px-1.5 rounded-full",
            "bg-gray-700 text-xs font-bold text-white tabular-nums",
          ].join(" ")}
          aria-label={`${count} job${count !== 1 ? "s" : ""}`}
        >
          {count}
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
            isOpen ? "rotate-180" : "",
          ].join(" ")}
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Collapsible job list */}
      {isOpen && (
        <div className="border-t border-white/10 px-3 pb-3 pt-2 flex flex-col gap-2">
          {count === 0 ? (
            <p className="py-4 text-center text-sm text-gray-500 italic">
              No jobs in this stage.
            </p>
          ) : (
            jobs.map((job) => <JobCardRow key={job.id} job={job} onAdvance={onAdvance} />)
          )}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// EmptyState
// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center px-8 py-24 text-center">
      <span className="text-6xl mb-4" aria-hidden="true">🔧</span>
      <p className="text-2xl font-bold text-white mb-2">No active jobs</p>
      <p className="text-lg text-gray-400 mb-8">
        Scan a VIN or manually enter a vehicle to start your first work order.
      </p>
      <Link
        href="/intake"
        className="px-6 py-3 rounded-2xl bg-brand-400 text-gray-950 font-bold text-sm hover:bg-brand-300 active:scale-95 transition-all"
      >
        + New Intake
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------------------
// JobsBoard — main export consumed by page.tsx
// ---------------------------------------------------------------------------

export function JobsBoard({ jobs: initialJobs }: { jobs: JobCard[] }) {
  const [, startTransition] = useTransition();
  const { showToast, toastElement } = useToast();

  // Optimistic state: immediately re-bucket a job into its new status lane
  // when the user clicks the advance button, before the server responds.
  const [optimisticJobs, advanceOptimistic] = useOptimistic(
    initialJobs,
    (state, { id, nextStatus }: { id: string; nextStatus: ActiveStatus }) =>
      state.map((job) =>
        job.id === id ? { ...job, status: nextStatus } : job,
      ),
  );

  function handleAdvance(id: string) {
    // Determine next status from ADVANCE_MAP
    const job = optimisticJobs.find((j) => j.id === id);
    if (!job) return;
    const ADVANCE_MAP: Partial<Record<ActiveStatus, ActiveStatus>> = {
      INTAKE: "ACTIVE",
      COMPLETE: "INVOICED",
    };
    const nextStatus = ADVANCE_MAP[job.status];
    if (!nextStatus) return;

    startTransition(async () => {
      advanceOptimistic({ id, nextStatus });
      const result = await advanceWorkOrderStatus(id);
      if ("error" in result) {
        showToast(result.error, "error");
      } else {
        showToast(`Moved to ${STATUS_CONFIG[result.nextStatus].label} ✓`);
      }
    });
  }

  // Group jobs by status (client-side — data is already sorted by age).
  const grouped = PIPELINE_ORDER.reduce<Record<ActiveStatus, JobCard[]>>(
    (acc, status) => {
      acc[status] = optimisticJobs.filter((j) => j.status === status);
      return acc;
    },
    {} as Record<ActiveStatus, JobCard[]>,
  );

  const totalJobs = optimisticJobs.length;

  return (
    <div className="flex flex-col min-h-full">
      {toastElement}

      {/* Sticky summary bar */}
      <div className="sticky top-0 z-10 bg-gray-950 border-b border-gray-800 px-4 py-3 flex items-center gap-2">
        <span className="flex-1 text-sm text-gray-400">
          {totalJobs === 0
            ? "No open jobs"
            : `${totalJobs} open job${totalJobs !== 1 ? "s" : ""}`}
        </span>
        {/* Quick count dots */}
        <div className="flex items-center gap-2" aria-hidden="true">
          {PIPELINE_ORDER.map((status) => {
            const n = grouped[status].length;
            if (n === 0) return null;
            const cfg = STATUS_CONFIG[status];
            return (
              <span
                key={status}
                className={[
                  "flex items-center justify-center h-5 min-w-[1.25rem] px-1",
                  "rounded-full text-[10px] font-bold text-white tabular-nums",
                  "bg-gray-700",
                ].join(" ")}
                title={cfg.label}
              >
                {n}
              </span>
            );
          })}
        </div>
      </div>

      {/* Board */}
      <div className="flex-1 px-4 py-4 pb-[calc(env(safe-area-inset-bottom)+80px)] sm:pb-4">
        {totalJobs === 0 ? (
          <EmptyState />
        ) : (
          <div className="flex flex-col gap-3">
            {PIPELINE_ORDER.map((status) => (
              <LaneAccordion
                key={status}
                status={status}
                jobs={grouped[status]}
                // Open lanes that have jobs; collapse empty ones by default.
                defaultOpen={grouped[status].length > 0}
                onAdvance={handleAdvance}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
