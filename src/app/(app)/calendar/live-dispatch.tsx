"use client";

import { useCallback } from "react";

// ---------------------------------------------------------------------------
// Types — mirror CalendarClient ScheduledJob shape
// ---------------------------------------------------------------------------

export interface ScheduledJob {
  id: string;
  title: string;
  scheduledAt: string;
  durationMinutes: number;
  status: string;
  client: { firstName: string; lastName: string; zipCode: string | null };
  vehicle: { make: string; model: string; year: number };
}

interface ElasticDispatchPromptProps {
  cancelledJobId: string;
  nextJob: ScheduledJob | null;
  onDismiss: () => void;
  onConfirm: (nextJobId: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ElasticDispatchPrompt({
  cancelledJobId: _cancelledJobId,
  nextJob,
  onDismiss,
  onConfirm,
}: ElasticDispatchPromptProps) {
  const handleConfirm = useCallback(async () => {
    if (!nextJob) return;

    try {
      // Notify the client of the updated ETA via the messaging system
      await fetch("/api/dispatch/notify-eta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workOrderId: nextJob.id }),
      });
    } catch {
      // Fire-and-forget — UI proceeds regardless
    }

    onConfirm(nextJob.id);
  }, [nextJob, onConfirm]);

  if (!nextJob) return null;

  const scheduledTime = new Date(nextJob.scheduledAt).toLocaleTimeString(
    "en-US",
    { hour: "numeric", minute: "2-digit" },
  );

  return (
    /* Overlay */
    <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-6 pointer-events-none">
      <div className="pointer-events-auto w-full max-w-lg bg-yellow-950 border border-yellow-700 rounded-2xl shadow-2xl p-5 flex flex-col gap-4 animate-in slide-in-from-bottom-4">
        {/* Bell + title */}
        <div className="flex items-start gap-3">
          <span className="text-2xl leading-none">🔔</span>
          <div className="flex-1">
            <p className="text-yellow-200 font-black text-sm leading-snug">
              Gap detected!{" "}
              <span className="font-normal">&ldquo;{nextJob.title}&rdquo;</span>{" "}
              could be moved earlier.
            </p>
            <p className="text-yellow-400 text-xs mt-1">
              {nextJob.client.firstName} {nextJob.client.lastName} ·{" "}
              {nextJob.vehicle.year} {nextJob.vehicle.make}{" "}
              {nextJob.vehicle.model} · Currently at {scheduledTime}
            </p>
          </div>
        </div>

        <p className="text-yellow-300 text-sm">
          Recalculate the schedule and notify the client of the updated ETA?
        </p>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onDismiss}
            className="flex-1 border border-yellow-700 text-yellow-300 font-bold uppercase tracking-wide rounded-xl py-3 text-sm hover:bg-yellow-900 active:scale-95 transition-transform"
          >
            Dismiss
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="flex-1 bg-yellow-600 text-white font-black uppercase tracking-wide rounded-xl py-3 text-sm hover:bg-yellow-500 active:scale-95 transition-transform"
          >
            Notify Client
          </button>
        </div>
      </div>
    </div>
  );
}
