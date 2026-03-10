"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  type HubWorkOrder,
  type FieldTechOption,
  type WorkOrderEvent,
  acceptRequest,
  declineRequest,
  assignTech,
  addWorkOrderNote,
  forceApproveWorkOrder,
} from "./actions";
import { generateAndSendInvoice } from "@/app/(app)/checkout/[workOrderId]/actions";
import { useToast } from "@/components/Toast";
import type { WorkOrderStatus } from "@prisma/client";

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
// JobCardHubClient
// ---------------------------------------------------------------------------

export function JobCardHubClient({
  workOrder,
  fieldTechs: initialFieldTechs,
}: {
  workOrder: HubWorkOrder;
  fieldTechs: FieldTechOption[];
  events: WorkOrderEvent[];
}) {
  const [isPending, startTransition] = useTransition();
  const [noteText, setNoteText] = useState("");
  const { showToast, toastElement } = useToast();
  const clientName = `${workOrder.vehicle.client.firstName} ${workOrder.vehicle.client.lastName}`;
  const vehicleLabel = [workOrder.vehicle.year, workOrder.vehicle.make, workOrder.vehicle.model]
    .filter(Boolean)
    .join(" ") || "Vehicle";

  function handleAccept() {
    startTransition(async () => {
      const result = await acceptRequest(workOrder.id);
      if ("error" in result) {
        showToast(result.error, "error");
      } else {
        showToast("Request accepted.");
        window.location.reload();
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
        window.location.reload();
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
        window.location.reload();
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
        window.location.reload();
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
        window.location.reload();
      }
    });
  }

  return (
    <div className="flex flex-col gap-6 pb-20 lg:pb-6">
      {toastElement}

      {/* Header */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-black text-white">{workOrder.title}</h1>
            <p className="mt-1 text-sm text-gray-400">{clientName}</p>
            <p className="text-sm text-gray-500">{vehicleLabel}</p>
          </div>
          <span
            className={[
              "inline-flex items-center rounded-lg px-3 py-1 text-xs font-bold",
              workOrder.status === "REQUESTED" && "bg-amber-500/20 text-amber-400",
              workOrder.status === "INTAKE" && "bg-brand-500/20 text-brand-400",
              workOrder.status === "ACTIVE" && "bg-orange-500/20 text-orange-400",
              (workOrder.status === "PENDING_APPROVAL" || workOrder.status === "BLOCKED_WAITING_APPROVAL") &&
                "bg-sky-500/20 text-sky-400",
              workOrder.status === "COMPLETE" && "bg-emerald-500/20 text-emerald-400",
              workOrder.status === "INVOICED" && "bg-purple-500/20 text-purple-400",
              workOrder.status === "PAID" && "bg-gray-500/20 text-gray-400",
              workOrder.status === "CANCELLED" && "bg-danger-500/20 text-danger-400",
            ].filter(Boolean).join(" ") || "bg-gray-700 text-gray-300"}
          >
            {STATUS_LABELS[workOrder.status]}
          </span>
        </div>

        {/* Assign tech (SHOP_OWNER only; show when we have techs and not REQUESTED) */}
        {initialFieldTechs.length > 0 && workOrder.status !== "REQUESTED" && (
          <div className="mt-4 flex items-center gap-2">
            <span className="text-xs text-gray-500">Assigned:</span>
            <select
              value={workOrder.assignedTechId ?? ""}
              onChange={(e) => handleAssignTech(e.target.value || null)}
              disabled={isPending}
              className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-white focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
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

      {/* Status timeline */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
        <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500">Status</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {STATUS_STEPS.filter((s) => s !== "CANCELLED" && s !== "BATCHED_PENDING_PAYMENT").map(
            (status, idx) => {
              const isActive = workOrder.status === status;
              const isPast = currentStepIndex >= STATUS_STEPS.indexOf(status);
              return (
                <span
                  key={status}
                  className={[
                    "rounded-lg px-2 py-1 text-xs font-medium",
                    isActive && "bg-brand-500/20 text-brand-400",
                    isPast && !isActive && "bg-gray-700 text-gray-400",
                    !isPast && !isActive && "text-gray-600",
                  ].filter(Boolean).join(" ")}
                >
                  {STATUS_LABELS[status]}
                </span>
              );
            },
          )}
        </div>
      </div>

      {/* Next actions */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
        <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500">Actions</h2>
        <div className="mt-3 flex flex-wrap gap-2">
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
          {(workOrder.status === "ACTIVE" || workOrder.status === "BLOCKED_WAITING_APPROVAL") && (
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
          {(workOrder.status === "ACTIVE" || workOrder.status === "INTAKE") && (
            <Link
              href={`/quotes/${workOrder.id}/send`}
              className="inline-flex rounded-xl border border-sky-500/60 bg-sky-500/10 px-4 py-2.5 text-sm font-bold text-sky-300 hover:bg-sky-500/20"
            >
              Send quote for approval
            </Link>
          )}
          {(workOrder.hasDamageFlag || workOrder.status === "BLOCKED_WAITING_APPROVAL") && (
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

      {/* Timeline */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
        <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500">
          Timeline
        </h2>
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
                window.location.reload();
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

      {/* Quick links */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
        <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500">Quick links</h2>
        <ul className="mt-2 flex flex-wrap gap-2 text-sm">
          <li>
            <Link href={`/diagnostics/${workOrder.id}`} className="text-brand-400 hover:underline">
              Diagnostics
            </Link>
          </li>
          <li>
            <Link href={`/parts/${workOrder.id}`} className="text-brand-400 hover:underline">
              Parts
            </Link>
          </li>
          <li>
            <Link href={`/quotes/${workOrder.id}`} className="text-brand-400 hover:underline">
              Quote
            </Link>
          </li>
          <li>
            <Link href={`/checkout/${workOrder.id}`} className="text-brand-400 hover:underline">
              Checkout
            </Link>
          </li>
          <li>
            <Link href={`/clients`} className="text-gray-400 hover:underline">
              Clients
            </Link>
          </li>
        </ul>
      </div>

      {/* Documents */}
      {workOrder.documents.length > 0 && (
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
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
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
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
    </div>
  );
}
