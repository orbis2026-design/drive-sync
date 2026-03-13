"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type HubWorkOrder,
  type FieldTechOption,
  type WorkOrderEvent,
  acceptRequest,
  declineRequest,
  assignTech,
  addWorkOrderNote,
  forceApproveWorkOrder,
  archiveWorkOrder,
  setOilChangePackage,
  attachLightJob,
  signWaiver,
} from "./actions";
import {
  WAIVER_TEMPLATES,
  type WaiverTemplateId,
} from "@/lib/schemas/waiver-templates";
import { generateAndSendInvoice } from "@/app/(app)/checkout/[workOrderId]/actions";
import { useToast } from "@/components/Toast";
import type { WorkOrderStatus } from "@prisma/client";
import { TAX_RATE } from "@/app/(app)/quotes/[workOrderId]/constants";
import {
  computeMoneySummary,
  type WorkOrderLineItem,
  type WorkOrderMoneySummary,
} from "@/lib/schemas/work-order-oil-change";

// ---------------------------------------------------------------------------
// Status config
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<WorkOrderStatus, string> = {
  REQUESTED: "Requested",
  INTAKE: "Estimating",
  ACTIVE: "Active",
  PENDING_APPROVAL: "Pending approval",
  BLOCKED_WAITING_APPROVAL: "Change order",
  COMPLETE: "Approved",
  INVOICED: "Invoiced",
  PAID: "Paid",
  BATCHED_PENDING_PAYMENT: "Batch pending",
  CANCELLED: "Cancelled",
};

const STATUS_STEPS: WorkOrderStatus[] = [
  "REQUESTED",
  "INTAKE",
  "ACTIVE",
  "PENDING_APPROVAL",
  "BLOCKED_WAITING_APPROVAL",
  "COMPLETE",
  "INVOICED",
  "PAID",
];

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

function deriveLineItemsFromJson(json: unknown, kind: WorkOrderLineItem["kind"]): WorkOrderLineItem[] {
  if (!Array.isArray(json)) return [];
  return (json as any[])
    .map((raw, idx): WorkOrderLineItem | null => {
      if (!raw || typeof raw !== "object") return null;
      const obj = raw as Record<string, any>;
      const description: string = String(obj.description ?? obj.name ?? `Line ${idx + 1}`);
      const quantity = Number(obj.quantity ?? obj.hours ?? 1);
      const unitPriceCents = Number(
        obj.unitPriceCents ??
          obj.retailPriceCents ??
          obj.wholesalePriceCents ??
          0,
      );
      if (!Number.isFinite(quantity) || !Number.isFinite(unitPriceCents)) {
        return null;
      }
      const subtotalCents =
        typeof obj.subtotalCents === "number"
          ? obj.subtotalCents
          : Math.round(quantity * unitPriceCents);

      return {
        id: String(obj.id ?? `${kind}-${idx}`),
        kind,
        description,
        price: {
          unitPriceCents,
          quantity,
          subtotalCents,
        },
        sku: typeof obj.partNumber === "string" ? obj.partNumber : undefined,
        tags: Array.isArray(obj.tags) ? obj.tags : undefined,
      };
    })
    .filter((x): x is WorkOrderLineItem => x !== null);
}

function deriveMoneySummary(workOrder: HubWorkOrder): WorkOrderMoneySummary {
  const partsItems = deriveLineItemsFromJson(workOrder.partsJson, "PART");
  const laborItems = deriveLineItemsFromJson(workOrder.laborJson, "LABOR");
  const items = [...partsItems, ...laborItems];

  // When JSON is empty, fall back to stored roll-ups.
  if (items.length === 0) {
    const base = {
      partsCents: workOrder.partsCents,
      laborCents: workOrder.laborCents,
      feesCents: 0,
    };
    const subtotal = base.partsCents + base.laborCents;
    const taxCents = Math.round(subtotal * TAX_RATE);
    return {
      ...base,
      taxCents,
      totalCents: subtotal + taxCents,
    };
  }

  return computeMoneySummary(items, TAX_RATE);
}

// ---------------------------------------------------------------------------
// JobCardHubClient
// ---------------------------------------------------------------------------

export function JobCardHubClient({
  workOrder,
  fieldTechs: initialFieldTechs,
  events,
}: {
  workOrder: HubWorkOrder;
  fieldTechs: FieldTechOption[];
  events: WorkOrderEvent[];
}) {
  const [isPending, startTransition] = useTransition();
  const [noteText, setNoteText] = useState("");
  const { showToast, toastElement } = useToast();
  const router = useRouter();
  const clientName = `${workOrder.vehicle.client.firstName} ${workOrder.vehicle.client.lastName}`;
  const vehicleLabel = [workOrder.vehicle.year, workOrder.vehicle.make, workOrder.vehicle.model]
    .filter(Boolean)
    .join(" ") || "Vehicle";

  function refreshHub() {
    router.refresh();
  }

  const money = useMemo(() => deriveMoneySummary(workOrder), [workOrder]);
  const [isConfigPending, startConfigTransition] = useTransition();
  const [isLightJobPending, startLightJobTransition] = useTransition();
  const [waiverModal, setWaiverModal] = useState<{
    templateId: WaiverTemplateId;
    signerName: string;
  } | null>(null);
  const [isWaiverPending, startWaiverTransition] = useTransition();

  const signedWaiverTitles = useMemo(() => {
    return new Set(
      events.filter((e) => e.kind === "FORM").map((e) => e.title),
    );
  }, [events]);

  function handleAccept() {
    startTransition(async () => {
      const result = await acceptRequest(workOrder.id);
      if ("error" in result) {
        showToast(result.error, "error");
      } else {
        showToast("Request accepted.");
        refreshHub();
      }
    });
  }

  function handleDecline() {
    if (!confirm("Decline this request? The job will be cancelled.")) return;
    startTransition(async () => {
      const result = await declineRequest(workOrder.id);
      if ("error" in result) {
        showToast(result.error, "error");
      } else {
        showToast("Request declined.");
        refreshHub();
      }
    });
  }

  function handleAssignTech(techUserId: string | null) {
    startTransition(async () => {
      const result = await assignTech(workOrder.id, techUserId);
      if ("error" in result) {
        showToast(result.error, "error");
      } else {
        showToast(techUserId ? "Technician assigned." : "Assignment cleared.");
        refreshHub();
      }
    });
  }

  const currentStepIndex = STATUS_STEPS.indexOf(workOrder.status);

  function handleGenerateInvoice() {
    startTransition(async () => {
      const result = await generateAndSendInvoice(workOrder.id);
      if ("error" in result) {
        showToast(result.error, "error");
      } else {
        showToast("Invoice generated and sent.");
        refreshHub();
      }
    });
  }

  function handleSendEta() {
    if (!workOrder.scheduledAt) {
      showToast("Job is not scheduled yet.", "error");
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch("/api/dispatch/notify-eta", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workOrderId: workOrder.id }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          showToast(data.error ?? "Failed to send ETA SMS.", "error");
          return;
        }
        showToast("ETA SMS sent to client.");
      } catch {
        showToast("Failed to send ETA SMS.", "error");
      }
    });
  }

  function handleForceApprove() {
    if (
      !confirm(
        "Force-approve this job without client portal approval? This will mark the work order as COMPLETE and should only be used when you have explicit offline consent from the client.",
      )
    ) {
      return;
    }
    startTransition(async () => {
      const result = await forceApproveWorkOrder(workOrder.id);
      if ("error" in result) {
        showToast(result.error, "error");
      } else {
        showToast("Work order force-approved.");
        refreshHub();
      }
    });
  }

  function handleArchive() {
    if (!confirm("Archive this job? It will be removed from active boards.")) return;
    startTransition(async () => {
      const result = await archiveWorkOrder(workOrder.id);
      if ("error" in result) {
        showToast(result.error, "error");
      } else {
        showToast("Work order archived.");
        window.location.href = "/jobs";
      }
    });
  }

  return (
    <div className="flex flex-col gap-6 pb-20 lg:pb-6">
      {toastElement}

      {/* Header + key facts */}
      <div className="rounded-2xl border border-gray-800 bg-gray-900 p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-xl font-black text-white">{workOrder.title}</h1>
            <p className="text-sm text-gray-400">{clientName}</p>
            <p className="text-sm text-gray-500">{vehicleLabel}</p>
            {typeof workOrder.mileageAtIntake === "number" && (
              <p className="text-xs text-gray-500">
                Intake mileage{" "}
                <span className="font-mono">
                  {workOrder.mileageAtIntake.toLocaleString()} mi
                </span>
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-2">
            <span
              className={[
                "inline-flex items-center rounded-lg px-3 py-1 text-xs font-bold",
                workOrder.status === "REQUESTED" && "bg-amber-500/20 text-amber-400",
                workOrder.status === "INTAKE" && "bg-brand-500/20 text-brand-400",
                workOrder.status === "ACTIVE" && "bg-orange-500/20 text-orange-400",
                (workOrder.status === "PENDING_APPROVAL" ||
                  workOrder.status === "BLOCKED_WAITING_APPROVAL") &&
                  "bg-sky-500/20 text-sky-400",
                workOrder.status === "COMPLETE" &&
                  "bg-emerald-500/20 text-emerald-400",
                workOrder.status === "INVOICED" &&
                  "bg-purple-500/20 text-purple-400",
                workOrder.status === "PAID" && "bg-gray-500/20 text-gray-400",
                workOrder.status === "CANCELLED" &&
                  "bg-danger-500/20 text-danger-400",
              ]
                .filter(Boolean)
                .join(" ") || "bg-gray-700 text-gray-300"}
            >
              {STATUS_LABELS[workOrder.status]}
            </span>
            <p className="text-xs text-gray-500">
              Created{" "}
              {new Date(workOrder.createdAt).toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
            {/* Assign tech (SHOP_OWNER only; show when we have techs and not REQUESTED) */}
            {initialFieldTechs.length > 0 && workOrder.status !== "REQUESTED" && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">Assigned:</span>
                <select
                  value={workOrder.assignedTechId ?? ""}
                  onChange={(e) => handleAssignTech(e.target.value || null)}
                  disabled={isPending}
                  className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs text-white focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  aria-label="Assign technician"
                >
                  <option value="">Unassigned</option>
                  {initialFieldTechs.map((t) => (
                    <option key={t.userId} value={t.userId}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Configured package & light jobs */}
      <div className="rounded-2xl border border-gray-800 bg-gray-900 p-4 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-bold uppercase tracking-wide text-gray-500">
            Oil-change package
          </h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {["CONVENTIONAL", "SYNTHETIC_BLEND", "FULL_SYNTHETIC", "EURO_SYNTHETIC"].map(
            (pkgId) => {
              const currentJson =
                (workOrder.checklistsJson as any) ?? {};
              const currentId = currentJson?.oilChangePackageId as
                | string
                | undefined;
              const isActive = currentId === pkgId;
              const label =
                pkgId === "CONVENTIONAL"
                  ? "Conventional"
                  : pkgId === "SYNTHETIC_BLEND"
                    ? "Synthetic blend"
                    : pkgId === "FULL_SYNTHETIC"
                      ? "Full synthetic"
                      : "Euro synthetic";
              return (
                <button
                  key={pkgId}
                  type="button"
                  disabled={isConfigPending}
                  onClick={() => {
                    startConfigTransition(async () => {
                      const res = await setOilChangePackage(
                        workOrder.id,
                        pkgId as any,
                      );
                      if ("error" in res) {
                        showToast(res.error, "error");
                      } else {
                        showToast("Package updated.");
                        refreshHub();
                      }
                    });
                  }}
                  className={[
                    "px-3 py-1.5 rounded-xl text-xs font-semibold border",
                    isActive
                      ? "bg-brand-500 text-gray-950 border-brand-400"
                      : "bg-gray-800 text-gray-200 border-gray-700 hover:bg-gray-700",
                  ].join(" ")}
                >
                  {label}
                </button>
              );
            },
          )}
        </div>

        <div className="border-t border-gray-800 pt-3 mt-1 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500">
              Light jobs
            </h3>
            <button
              type="button"
              disabled={isLightJobPending}
              onClick={() => {
                startLightJobTransition(async () => {
                  const res = await attachLightJob(workOrder.id, "SIMPLE_BRAKE_JOB", {
                    axle: "FRONT",
                    side: "BOTH",
                    padsAndRotors: true,
                  });
                  if ("error" in res) {
                    showToast(res.error, "error");
                  } else {
                    showToast("Simple brake job attached.");
                    refreshHub();
                  }
                });
              }}
              className="inline-flex items-center rounded-xl bg-gray-800 px-3 py-1.5 text-xs font-semibold text-gray-200 border border-gray-700 hover:bg-gray-700 disabled:opacity-50"
            >
              + Simple brake job
            </button>
          </div>
          <p className="text-[11px] text-gray-500">
            Use for quick pad/rotor jobs you pick up during an oil change. Full
            pricing still flows through Parts and Quote.
          </p>
        </div>
      </div>

      {/* Waivers & forms */}
      <div className="rounded-2xl border border-gray-800 bg-gray-900 p-4 space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wide text-gray-500">
          Waivers & forms
        </h2>
        <p className="text-[11px] text-gray-500">
          One-tap to add a waiver; customer name is recorded as signer.
        </p>
        <div className="flex flex-wrap gap-2">
          {WAIVER_TEMPLATES.map((t) => {
            const isSigned = signedWaiverTitles.has(t.name);
            return (
              <button
                key={t.id}
                type="button"
                disabled={isWaiverPending || isSigned}
                onClick={() => setWaiverModal({ templateId: t.id, signerName: clientName })}
                className={[
                  "px-3 py-2 rounded-xl text-xs font-semibold border text-left max-w-full",
                  isSigned
                    ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-400"
                    : "bg-gray-800 text-gray-200 border-gray-700 hover:bg-gray-700",
                ].join(" ")}
              >
                {isSigned ? "✓ " : ""}
                {t.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* Status + primary actions */}
      <div className="rounded-2xl border border-gray-800 bg-gray-900 p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-bold uppercase tracking-wide text-gray-500">
            Flow
          </h2>
          <div className="flex flex-wrap gap-1">
            {STATUS_STEPS.filter(
              (s) => s !== "CANCELLED" && s !== "BATCHED_PENDING_PAYMENT",
            ).map((status) => {
              const isActive = workOrder.status === status;
              const isPast =
                currentStepIndex >= STATUS_STEPS.indexOf(status);
              return (
                <span
                  key={status}
                  className={[
                    "rounded-full px-2 py-0.5 text-[10px] font-medium",
                    isActive && "bg-brand-500/20 text-brand-400",
                    isPast && !isActive && "bg-gray-800 text-gray-400",
                    !isPast && !isActive && "text-gray-600",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {STATUS_LABELS[status]}
                </span>
              );
            })}
          </div>
        </div>

        <div className="mt-1 flex flex-wrap gap-2">
          {workOrder.status === "REQUESTED" && (
            <>
              <button
                type="button"
                onClick={handleAccept}
                disabled={isPending}
                className="rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-bold text-gray-950 hover:bg-brand-400 disabled:opacity-50"
              >
                {isPending ? "Accepting…" : "Accept request"}
              </button>
              <button
                type="button"
                onClick={handleDecline}
                disabled={isPending}
                className="rounded-xl border border-danger-500/50 bg-danger-500/10 px-4 py-2.5 text-sm font-bold text-danger-400 hover:bg-danger-500/20 disabled:opacity-50"
              >
                Decline
              </button>
            </>
          )}
          {workOrder.status === "INTAKE" && (
            <Link
              href={`/diagnostics/${workOrder.id}`}
              className="inline-flex rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-bold text-gray-950 hover:bg-brand-400"
            >
              Open estimate
            </Link>
          )}
          {(workOrder.status === "ACTIVE" ||
            workOrder.status === "BLOCKED_WAITING_APPROVAL") && (
            <>
              <Link
                href={`/parts/${workOrder.id}`}
                className="inline-flex rounded-xl bg-gray-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-gray-600"
              >
                Parts
              </Link>
              <Link
                href={`/quotes/${workOrder.id}`}
                className="inline-flex rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-bold text-gray-950 hover:bg-brand-400"
              >
                Quote
              </Link>
            </>
          )}
          {workOrder.status === "PENDING_APPROVAL" && (
            <Link
              href={`/quotes/${workOrder.id}/send`}
              className="inline-flex rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-sky-400"
            >
              Resend quote link
            </Link>
          )}
          {(workOrder.status === "ACTIVE" ||
            workOrder.status === "INTAKE") && (
            <Link
              href={`/quotes/${workOrder.id}/send`}
              className="inline-flex rounded-xl border border-sky-500/60 bg-sky-500/10 px-4 py-2.5 text-sm font-bold text-sky-300 hover:bg-sky-500/20"
            >
              Send quote for approval
            </Link>
          )}
          {(workOrder.hasDamageFlag ||
            workOrder.status === "BLOCKED_WAITING_APPROVAL") && (
            <Link
              href="/dispatch/qa"
              className="inline-flex rounded-xl border border-amber-500/50 bg-amber-500/10 px-4 py-2.5 text-sm font-bold text-amber-400 hover:bg-amber-500/20"
            >
              QA Inbox
            </Link>
          )}
          {workOrder.status === "COMPLETE" && (
            <>
              <button
                type="button"
                onClick={handleGenerateInvoice}
                disabled={isPending}
                className="inline-flex rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-400 disabled:opacity-50"
              >
                {isPending ? "Generating invoice…" : "Generate & send invoice"}
              </button>
              <Link
                href={`/checkout/${workOrder.id}`}
                className="inline-flex rounded-xl border border-emerald-500/60 bg-emerald-500/10 px-4 py-2.5 text-sm font-bold text-emerald-300 hover:bg-emerald-500/20"
              >
                Checkout
              </Link>
            </>
          )}
          {workOrder.status === "INVOICED" && (
            <Link
              href={`/checkout/${workOrder.id}`}
              className="inline-flex rounded-xl bg-purple-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-purple-400"
            >
              Collect payment
            </Link>
          )}
          {/* Owner-only emergency controls */}
          {workOrder.viewerIsOwner &&
            (workOrder.status === "ACTIVE" ||
              workOrder.status === "PENDING_APPROVAL" ||
              workOrder.status === "BLOCKED_WAITING_APPROVAL") && (
              <button
                type="button"
                onClick={handleForceApprove}
                disabled={isPending}
                className="inline-flex rounded-xl border border-danger-500/60 bg-danger-500/10 px-4 py-2.5 text-sm font-bold text-danger-400 hover:bg-danger-500/20 disabled:opacity-50"
              >
                Force-approve (owner)
              </button>
            )}
          {workOrder.viewerIsOwner && !isPending && (
            <button
              type="button"
              onClick={handleArchive}
              className="inline-flex rounded-xl border border-gray-600 bg-gray-900 px-4 py-2.5 text-sm font-bold text-gray-300 hover:bg-gray-800"
            >
              Archive job
            </button>
          )}
          {workOrder.status !== "REQUESTED" &&
            workOrder.status !== "INTAKE" &&
            workOrder.status !== "PAID" &&
            workOrder.status !== "CANCELLED" && (
              <Link
                href={`/diagnostics/${workOrder.id}`}
                className="inline-flex rounded-xl border border-gray-600 bg-gray-800 px-4 py-2.5 text-sm font-bold text-gray-300 hover:bg-gray-700"
              >
                Diagnostics
              </Link>
            )}
          {workOrder.scheduledAt && (
            <Link
              href="/calendar"
              className="inline-flex rounded-xl border border-gray-600 bg-gray-800 px-4 py-2.5 text-sm font-bold text-gray-300 hover:bg-gray-700"
            >
              Calendar
            </Link>
          )}
          {workOrder.scheduledAt && (
            <button
              type="button"
              onClick={handleSendEta}
              disabled={isPending}
              className="inline-flex rounded-xl border border-sky-500/60 bg-sky-500/10 px-4 py-2.5 text-sm font-bold text-sky-300 hover:bg-sky-500/20 disabled:opacity-50"
            >
              Send ETA SMS
            </button>
          )}
        </div>
      </div>

      {/* Pre-inspection & notes */}
      <div className="rounded-2xl border border-gray-800 bg-gray-900 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wide text-gray-500">
            Pre-inspection & Notes
          </h2>
          <Link
            href={`/diagnostics/${workOrder.id}`}
            className="text-xs text-brand-400 hover:underline"
          >
            Open full inspection
          </Link>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            const text = noteText.trim();
            if (!text) return;
            startTransition(async () => {
              const res = await addWorkOrderNote(workOrder.id, "WORK_ORDER", text);
              if ("error" in res) {
                showToast(res.error, "error");
              } else {
                setNoteText("");
                refreshHub();
              }
            });
          }}
          className="mt-3 flex flex-col gap-2"
        >
          <textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="Add a job note…"
            className="min-h-[60px] w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isPending || !noteText.trim()}
              className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-bold text-gray-950 hover:bg-brand-400 disabled:opacity-50"
            >
              {isPending ? "Saving…" : "Add note"}
            </button>
          </div>
        </form>
        <div className="mt-4 space-y-3">
          {events.length === 0 ? (
            <p className="text-xs text-gray-500">No timeline entries yet.</p>
          ) : (
            events.map((ev) => (
              <div
                key={ev.id}
                className="rounded-lg border border-gray-800 bg-gray-950 px-3 py-2"
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-gray-500">
                      {ev.kind}
                    </span>
                    <span className="text-[10px] font-medium uppercase tracking-wide text-gray-600">
                      {ev.stage}
                    </span>
                  </div>
                  <span className="text-[10px] text-gray-500">
                    {new Date(ev.createdAt).toLocaleString()}
                  </span>
                </div>
                <p className="text-xs font-semibold text-white">{ev.title}</p>
                {ev.body && (
                  <p className="mt-1 text-xs text-gray-300 whitespace-pre-line">
                    {ev.body}
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Pricing & payment snapshot */}
      <div className="rounded-2xl border border-gray-800 bg-gray-900 p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-xs font-bold uppercase tracking-wide text-gray-500">
            Pricing & Payment
          </h2>
          {workOrder.status !== "PAID" &&
            (workOrder.status === "COMPLETE" ||
            workOrder.status === "INVOICED" ? (
              <Link
                href={`/checkout/${workOrder.id}`}
                className="inline-flex items-center justify-center rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-gray-950 hover:bg-emerald-400"
              >
                Collect payment
              </Link>
            ) : (
              <Link
                href={`/checkout/${workOrder.id}`}
                className="text-xs font-bold text-emerald-400 hover:underline"
              >
                Open checkout
              </Link>
            ))}
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-xl bg-gray-800 px-3 py-2">
            <p className="text-[10px] uppercase tracking-widest text-gray-500">
              Parts
            </p>
            <p className="text-sm font-bold text-white">
              {formatCents(money.partsCents)}
            </p>
          </div>
          <div className="rounded-xl bg-gray-800 px-3 py-2">
            <p className="text-[10px] uppercase tracking-widest text-gray-500">
              Labor
            </p>
            <p className="text-sm font-bold text-white">
              {formatCents(money.laborCents)}
            </p>
          </div>
          <div className="rounded-xl bg-gray-800 px-3 py-2">
            <p className="text-[10px] uppercase tracking-widest text-gray-500">
              Tax
            </p>
            <p className="text-sm font-bold text-white">
              {formatCents(money.taxCents)}
            </p>
          </div>
          <div className="rounded-xl bg-gray-800 px-3 py-2">
            <p className="text-[10px] uppercase tracking-widest text-gray-500">
              Total
            </p>
            <p className="text-sm font-black text-brand-400">
              {formatCents(money.totalCents)}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>
            Payment method: {workOrder.paymentMethod ?? "—"}
          </span>
          <span>
            {workOrder.closedAt
              ? `Closed ${new Date(workOrder.closedAt).toLocaleDateString()}`
              : "Open"}
          </span>
        </div>
      </div>

      {/* Documents */}
      {workOrder.documents.length > 0 && (
        <div className="rounded-2xl border border-gray-800 bg-gray-900 p-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500">
            Documents
          </h2>
          <ul className="mt-2 space-y-2 text-sm">
            {workOrder.documents.map((doc) => (
              <li
                key={doc.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-gray-800 bg-gray-950 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="font-medium text-white truncate">
                    {doc.filename}
                  </p>
                  <p className="text-[11px] text-gray-500 uppercase tracking-wide">
                    {doc.type}
                  </p>
                </div>
                {doc.publicUrl ? (
                  <a
                    href={doc.publicUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center rounded-lg border border-gray-600 bg-gray-800 px-2.5 py-1 text-[11px] font-bold text-gray-200 hover:bg-gray-700"
                  >
                    View
                  </a>
                ) : (
                  <span className="text-[11px] text-gray-600">
                    {doc.bucket}:{doc.storageKey}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Expenses */}
      {workOrder.expenses.length > 0 && (
        <div className="rounded-2xl border border-gray-800 bg-gray-900 p-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500">
            Expenses
          </h2>
          <ul className="mt-2 space-y-2 text-sm">
            {workOrder.expenses.map((exp) => (
              <li
                key={exp.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-gray-800 bg-gray-950 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="font-medium text-white truncate">
                    {exp.vendor}
                  </p>
                  <p className="text-[11px] text-gray-500 uppercase tracking-wide">
                    {exp.category}
                  </p>
                </div>
                <span className="text-[11px] font-mono text-gray-200">
                  ${exp.amount.toFixed(2)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Waiver sign modal */}
      {waiverModal && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
          role="dialog"
          aria-labelledby="waiver-modal-title"
        >
          <div className="w-full max-w-lg bg-gray-900 rounded-t-2xl sm:rounded-2xl border border-gray-800 p-4 space-y-3">
            <h2 id="waiver-modal-title" className="text-sm font-bold text-white">
              {WAIVER_TEMPLATES.find((t) => t.id === waiverModal.templateId)?.name ??
                "Sign waiver"}
            </h2>
            <label className="block text-xs text-gray-400">
              Customer / signer name
            </label>
            <input
              type="text"
              value={waiverModal.signerName}
              onChange={(e) =>
                setWaiverModal((m) => m && { ...m, signerName: e.target.value })
              }
              placeholder="Full name"
              className="w-full rounded-xl border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setWaiverModal(null)}
                className="flex-1 py-2.5 rounded-xl bg-gray-800 text-sm font-bold text-gray-200 hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isWaiverPending || !waiverModal.signerName.trim()}
                onClick={() => {
                  startWaiverTransition(async () => {
                    const res = await signWaiver(
                      workOrder.id,
                      waiverModal.templateId,
                      waiverModal.signerName.trim(),
                    );
                    if ("error" in res) {
                      showToast(res.error, "error");
                    } else {
                      setWaiverModal(null);
                      showToast("Waiver recorded.");
                      refreshHub();
                    }
                  });
                }}
                className="flex-1 py-2.5 rounded-xl bg-brand-500 text-sm font-bold text-gray-950 hover:bg-brand-400 disabled:opacity-50"
              >
                {isWaiverPending ? "Saving…" : "Sign & save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
