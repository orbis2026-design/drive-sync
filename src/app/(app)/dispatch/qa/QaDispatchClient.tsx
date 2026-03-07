"use client";

/**
 * QA & Dispatch Command Center — Client Component  (Issue #62)
 *
 * The Shop Owner's QA inbox. Shows WorkOrders flagged by Field Techs for:
 *   • Pre-existing damage (hasDamageFlag = true)
 *   • Pending change-order approvals (status = BLOCKED_WAITING_APPROVAL)
 *
 * For each item the Shop Owner can:
 *   • Preview Cloudflare R2 inspection media (photos / video).
 *   • Click "Approve Liability & Send to Client" to forward the digital
 *     waiver to the customer after signing off on the tech's assessment.
 */

import { useState, useTransition } from "react";
import type { QaWorkOrder } from "./page";

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusBadge({ type }: { type: "damage" | "change-order" }) {
  return (
    <span
      className={[
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold",
        type === "damage"
          ? "bg-red-900/60 text-red-300 border border-red-700"
          : "bg-orange-900/60 text-orange-300 border border-orange-700",
      ].join(" ")}
    >
      {type === "damage" ? "⚠ Pre-Existing Damage" : "📋 Change Order Pending"}
    </span>
  );
}

function MediaPreview({ urls }: { urls: string[] }) {
  if (urls.length === 0) {
    return (
      <p className="text-xs text-gray-500 italic">
        No inspection media on file.
      </p>
    );
  }
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {urls.map((url, i) => {
        const isVideo = /\.(mp4|webm|mov)$/i.test(url);
        return isVideo ? (
          <video
            key={i}
            src={url}
            className="h-24 w-24 object-cover rounded-lg border border-gray-700"
            controls
            muted
            playsInline
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={i}
            src={url}
            alt={`Inspection media ${i + 1}`}
            className="h-24 w-24 object-cover rounded-lg border border-gray-700"
          />
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface QaDispatchClientProps {
  workOrders: QaWorkOrder[];
}

export function QaDispatchClient({ workOrders }: QaDispatchClientProps) {
  const [queue, setQueue] = useState<QaWorkOrder[]>(workOrders);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [toasts, setToasts] = useState<
    Record<string, { type: "success" | "error"; message: string }>
  >({});

  function addToast(
    id: string,
    type: "success" | "error",
    message: string,
  ) {
    setToasts((prev) => ({ ...prev, [id]: { type, message } }));
  }

  async function handleApprove(workOrderId: string) {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/dispatch/qa/approve`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workOrderId }),
        });
        const data = (await res.json()) as { error?: string };
        if (!res.ok) {
          addToast(
            workOrderId,
            "error",
            data.error ?? "Failed to approve liability.",
          );
        } else {
          addToast(workOrderId, "success", "Liability approved. Waiver sent to client.");
          setQueue((prev) => prev.filter((wo) => wo.id !== workOrderId));
        }
      } catch {
        addToast(workOrderId, "error", "Network error — please try again.");
      }
    });
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4 sm:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-white">
            QA &amp; Dispatch Inbox
          </h1>
          <p className="text-gray-400 mt-1 text-sm">
            Review tech-flagged damage reports and change orders before the
            client is billed.
          </p>
        </div>

        {queue.length === 0 && (
          <div className="bg-gray-900 border border-gray-700 rounded-xl px-6 py-12 text-center">
            <p className="text-4xl mb-3">✅</p>
            <p className="text-gray-300 font-semibold">All clear — no items in the QA queue.</p>
            <p className="text-gray-500 text-sm mt-1">
              When a tech flags pre-existing damage or opens a change order, it
              will appear here for your review.
            </p>
          </div>
        )}

        {queue.map((wo) => {
          const isOpen = expanded === wo.id;
          const toast = toasts[wo.id];

          return (
            <div
              key={wo.id}
              className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden"
            >
              {/* Card header */}
              <button
                className="w-full flex items-start sm:items-center justify-between gap-4 px-5 py-4 text-left hover:bg-gray-800/50 transition-colors"
                onClick={() => setExpanded(isOpen ? null : wo.id)}
                aria-expanded={isOpen}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap gap-2 mb-1">
                    {wo.hasDamageFlag && <StatusBadge type="damage" />}
                    {wo.isChangeOrder && <StatusBadge type="change-order" />}
                  </div>
                  <p className="font-semibold text-white truncate">{wo.title}</p>
                  <p className="text-sm text-gray-400 mt-0.5">
                    {wo.vehicleLabel} &mdash; {wo.clientName}
                  </p>
                </div>
                <span className="text-gray-500 text-lg flex-shrink-0">
                  {isOpen ? "▲" : "▼"}
                </span>
              </button>

              {/* Expanded detail panel */}
              {isOpen && (
                <div className="border-t border-gray-800 px-5 py-4 space-y-4">
                  {/* Tech notes */}
                  {wo.notes && (
                    <div>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                        Tech Notes
                      </p>
                      <p className="text-sm text-gray-200 bg-gray-800/60 rounded-lg p-3">
                        {wo.notes}
                      </p>
                    </div>
                  )}

                  {/* R2 inspection media */}
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                      Pre-Inspection Media (Cloudflare R2)
                    </p>
                    <MediaPreview urls={wo.mediaUrls} />
                  </div>

                  {/* Toast */}
                  {toast && (
                    <div
                      className={[
                        "rounded-lg px-4 py-3 text-sm font-medium",
                        toast.type === "success"
                          ? "bg-green-900/60 text-green-300 border border-green-700"
                          : "bg-red-900/60 text-red-300 border border-red-700",
                      ].join(" ")}
                    >
                      {toast.message}
                    </div>
                  )}

                  {/* Approve CTA */}
                  <button
                    onClick={() => handleApprove(wo.id)}
                    disabled={isPending}
                    className="w-full py-4 bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-base rounded-xl transition-colors"
                  >
                    ✅ Approve Liability &amp; Send to Client
                  </button>
                  <p className="text-xs text-gray-500 text-center">
                    By clicking above you confirm as Shop Owner that you have
                    reviewed the tech&apos;s assessment and authorise forwarding
                    the digital waiver to the customer.
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
