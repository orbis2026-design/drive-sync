"use client";

import { useState, useCallback, useOptimistic, useTransition } from "react";
import type { CalendarData, ScheduledJob, BacklogJob } from "./actions";
import { scheduleWorkOrder, unscheduleWorkOrder, cancelWorkOrder } from "./actions";
import { ElasticDispatchPrompt } from "./live-dispatch";
import { useToast } from "@/components/Toast";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const HOUR_HEIGHT_PX = 64; // px per hour in day view
const DAY_START_HOUR = 7;  // 7 AM
const DAY_END_HOUR = 19;   // 7 PM

function formatHour(h: number): string {
  if (h === 0) return "12 AM";
  if (h < 12) return `${h} AM`;
  if (h === 12) return "12 PM";
  return `${h - 12} PM`;
}

function isoToSlot(iso: string): { hour: number; minute: number } {
  const d = new Date(iso);
  return { hour: d.getHours(), minute: d.getMinutes() };
}

function slotTopPx(hour: number, minute: number): number {
  return (hour - DAY_START_HOUR) * HOUR_HEIGHT_PX + (minute / 60) * HOUR_HEIGHT_PX;
}

/** Returns the day-of-week labels and ISO date strings for a week. */
function getWeekDays(base: Date): { label: string; iso: string }[] {
  const monday = new Date(base);
  const dow = base.getDay();
  monday.setDate(base.getDate() - ((dow + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return {
      label: d.toLocaleDateString("en-US", { weekday: "short", day: "numeric" }),
      iso: d.toISOString().slice(0, 10),
    };
  });
}

/** ZIP-code based drive time: same ZIP = 0 min, else 30 min padding. */
function drivePaddingMinutes(prevZip: string | null, nextZip: string | null): number {
  if (!prevZip || !nextZip) return 0;
  return prevZip.slice(0, 3) !== nextZip.slice(0, 3) ? 30 : 0;
}

// ---------------------------------------------------------------------------
// Status pill
// ---------------------------------------------------------------------------

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    INTAKE: "bg-yellow-800 text-yellow-200",
    ACTIVE: "bg-blue-800 text-blue-200",
    PENDING_APPROVAL: "bg-purple-800 text-purple-200",
    COMPLETE: "bg-green-800 text-green-200",
    INVOICED: "bg-teal-800 text-teal-200",
    PAID: "bg-gray-700 text-gray-300",
  };
  const cls = map[status] ?? "bg-gray-700 text-gray-300";
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${cls}`}>
      {status.replace("_", " ")}
    </span>
  );
}

// ---------------------------------------------------------------------------
// BacklogDrawer
// ---------------------------------------------------------------------------

function BacklogDrawer({
  jobs,
  selectedId,
  onSelect,
}: {
  jobs: BacklogJob[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className={[
        "fixed bottom-[60px] left-0 right-0 z-40 transition-all duration-300",
        "sm:bottom-0",
        open ? "h-64" : "h-14",
      ].join(" ")}
    >
      {/* Handle */}
      <button
        onClick={() => setOpen((p) => !p)}
        className="w-full h-14 bg-gray-800 border-t border-gray-700 flex items-center justify-between px-4"
        aria-label={open ? "Collapse backlog drawer" : "Expand backlog drawer"}
      >
        <div className="flex items-center gap-2">
          <span className="text-yellow-400 text-lg font-black">≡</span>
          <span className="text-white font-bold text-sm">
            Unscheduled Backlog
          </span>
          <span className="text-xs text-gray-400 bg-gray-700 rounded-full px-2 py-0.5">
            {jobs.length}
          </span>
        </div>
        <span className="text-gray-400 text-xs">
          {open ? "▼ collapse" : "▲ tap to select & schedule"}
        </span>
      </button>

      {/* Cards */}
      {open && (
        <div className="flex-1 overflow-x-auto bg-gray-900 border-t border-gray-700 h-[calc(100%-3.5rem)]">
          {jobs.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-500 text-sm">
              All jobs are scheduled 🎉
            </div>
          ) : (
            <ul className="flex flex-row gap-3 p-3 h-full items-stretch">
              {jobs.map((job) => {
                const selected = selectedId === job.id;
                return (
                  <li key={job.id} className="flex-shrink-0">
                    <button
                      onClick={() => onSelect(selected ? null : job.id)}
                      className={[
                        "flex flex-col gap-1 p-3 rounded-2xl border text-left w-48 h-full transition-all",
                        selected
                          ? "border-yellow-400 bg-yellow-400/10 ring-2 ring-yellow-400"
                          : "border-gray-700 bg-gray-800 hover:border-gray-500",
                      ].join(" ")}
                      aria-pressed={selected}
                    >
                      <p className="text-white font-bold text-xs leading-tight truncate">
                        {job.title}
                      </p>
                      <p className="text-gray-400 text-[11px]">
                        {job.client.firstName} {job.client.lastName}
                      </p>
                      <p className="text-gray-500 text-[11px]">
                        {job.vehicle.year} {job.vehicle.make} {job.vehicle.model}
                      </p>
                      <StatusPill status={job.status} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DayView
// ---------------------------------------------------------------------------

function DayView({
  date,
  scheduled,
  pendingId,
  onSlotTap,
  onJobTap,
}: {
  date: Date;
  scheduled: ScheduledJob[];
  pendingId: string | null;
  onSlotTap: (isoDateTime: string) => void;
  onJobTap: (job: ScheduledJob) => void;
}) {
  const hours = Array.from(
    { length: DAY_END_HOUR - DAY_START_HOUR },
    (_, i) => DAY_START_HOUR + i,
  );

  const dateIso = date.toISOString().slice(0, 10);
  const dayJobs = scheduled.filter(
    (j) => j.scheduledAt.slice(0, 10) === dateIso,
  );

  // Sort to compute drive-time padding
  const sorted = [...dayJobs].sort(
    (a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
  );

  return (
    <div className="relative flex-1 overflow-y-auto" style={{ minHeight: `${(DAY_END_HOUR - DAY_START_HOUR) * HOUR_HEIGHT_PX}px` }}>
      {/* Hour grid lines */}
      {hours.map((h) => (
        <div
          key={h}
          className="absolute left-0 right-0 border-t border-gray-800 flex items-start"
          style={{ top: `${(h - DAY_START_HOUR) * HOUR_HEIGHT_PX}px`, height: `${HOUR_HEIGHT_PX}px` }}
        >
          <span className="text-[10px] text-gray-600 w-10 text-right pr-2 mt-[-7px]">
            {formatHour(h)}
          </span>
          {/* Tappable slot */}
          {pendingId && (
            <button
              onClick={() => {
                const d = new Date(date);
                d.setHours(h, 0, 0, 0);
                onSlotTap(d.toISOString());
              }}
              className="flex-1 h-full bg-yellow-400/5 hover:bg-yellow-400/20 transition-colors border-l border-dashed border-yellow-600/30"
              aria-label={`Schedule at ${formatHour(h)}`}
            />
          )}
        </div>
      ))}

      {/* Scheduled job blocks */}
      {sorted.map((job, idx) => {
        const { hour, minute } = isoToSlot(job.scheduledAt);
        const top = slotTopPx(hour, minute);
        const heightPx = (job.durationMinutes / 60) * HOUR_HEIGHT_PX;

        // Drive time padding from previous job
        const prev = idx > 0 ? sorted[idx - 1] : null;
        const padding = prev
          ? drivePaddingMinutes(prev.client.zipCode, job.client.zipCode)
          : 0;
        let prevEnd: number | null = null;
        if (prev) {
          const { hour: prevHour, minute: prevMinute } = isoToSlot(prev.scheduledAt);
          prevEnd =
            slotTopPx(prevHour, prevMinute) +
            (prev.durationMinutes / 60) * HOUR_HEIGHT_PX;
        }

        return (
          <div key={job.id}>
            {/* Drive-time padding block */}
            {prev && padding > 0 && prevEnd !== null && (
              <div
                className="absolute left-10 right-2 rounded-lg flex items-center justify-center"
                style={{
                  top: `${prevEnd}px`,
                  height: `${(padding / 60) * HOUR_HEIGHT_PX}px`,
                  background: "repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(251,191,36,0.08) 4px, rgba(251,191,36,0.08) 8px)",
                  border: "1px dashed rgba(251,191,36,0.3)",
                }}
                aria-label={`${padding} min drive-time buffer`}
              >
                <span className="text-[9px] text-yellow-600 font-semibold">
                  🚗 {padding} min drive
                </span>
              </div>
            )}

            {/* Job block */}
            <button
              onClick={() => onJobTap(job)}
              className="absolute left-10 right-2 rounded-2xl p-2 text-left hover:brightness-110 transition-all"
              style={{
                top: `${top}px`,
                height: `${heightPx}px`,
                background: "linear-gradient(135deg, #1e40af, #1d4ed8)",
                border: "1px solid #3b82f6",
              }}
              aria-label={`${job.title} at ${formatHour(hour)}`}
            >
              <p className="text-white font-bold text-xs truncate leading-tight">
                {job.title}
              </p>
              <p className="text-blue-200 text-[10px] truncate">
                {job.client.firstName} {job.client.lastName}
              </p>
              <p className="text-blue-300 text-[10px] truncate">
                {job.vehicle.year} {job.vehicle.make}
              </p>
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// WeekView
// ---------------------------------------------------------------------------

function WeekView({
  weekDays,
  scheduled,
}: {
  weekDays: { label: string; iso: string }[];
  scheduled: ScheduledJob[];
}) {
  return (
    <div className="flex flex-row gap-px overflow-x-auto bg-gray-800 border border-gray-700 rounded-2xl">
      {weekDays.map((day) => {
        const dayJobs = scheduled.filter((j) => j.scheduledAt.slice(0, 10) === day.iso);
        const isToday = day.iso === new Date().toISOString().slice(0, 10);
        return (
          <div key={day.iso} className="flex-1 min-w-[80px] bg-gray-900 last:rounded-r-2xl first:rounded-l-2xl">
            <div
              className={[
                "text-center text-[10px] font-bold p-2 border-b border-gray-800",
                isToday ? "text-yellow-400" : "text-gray-400",
              ].join(" ")}
            >
              {day.label}
            </div>
            <div className="flex flex-col gap-1 p-1 min-h-[80px]">
              {dayJobs.length === 0 ? (
                <div className="flex-1 flex items-center justify-center">
                  <span className="text-gray-700 text-[10px]">—</span>
                </div>
              ) : (
                dayJobs.map((job) => {
                  const { hour } = isoToSlot(job.scheduledAt);
                  return (
                    <div
                      key={job.id}
                      className="rounded-lg p-1.5 text-[10px]"
                      style={{ background: "#1d4ed8" }}
                    >
                      <p className="text-white font-semibold truncate">{job.title}</p>
                      <p className="text-blue-300">{formatHour(hour)}</p>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CalendarClient — main exported component
// ---------------------------------------------------------------------------

export function CalendarClient({ initial }: { initial: CalendarData }) {
  const [view, setView] = useState<"day" | "week">("day");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [data, setData] = useState<CalendarData>(initial);
  const [selectedBacklogId, setSelectedBacklogId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [detailJob, setDetailJob] = useState<ScheduledJob | null>(null);
  const [, startTransition] = useTransition();
  const { showToast, toastElement } = useToast();

  // Elastic dispatch state (Issue #87)
  const [dispatchPrompt, setDispatchPrompt] = useState<{
    cancelledJobId: string;
    nextJob: ScheduledJob | null;
  } | null>(null);

  // Optimistic calendar data: immediately reflect scheduling changes while
  // the server request resolves in the background.
  const [optimisticData, applyOptimistic] = useOptimistic(
    data,
    (state, patch: Partial<CalendarData>) => ({ ...state, ...patch }),
  );

  const weekDays = getWeekDays(currentDate);

  const handleSlotTap = useCallback(
    (isoDateTime: string) => {
      if (!selectedBacklogId || busy) return;
      const job = data.backlog.find((j) => j.id === selectedBacklogId);
      if (!job) return;

      setBusy(true);
      const newScheduled: ScheduledJob = {
        id: job.id,
        title: job.title,
        scheduledAt: isoDateTime,
        durationMinutes: 60,
        status: job.status,
        client: { ...job.client, zipCode: null },
        vehicle: job.vehicle,
      };

      startTransition(async () => {
        // Optimistic: move job from backlog to scheduled immediately
        applyOptimistic({
          scheduled: [...data.scheduled, newScheduled],
          backlog: data.backlog.filter((j) => j.id !== selectedBacklogId),
        });

        const result = await scheduleWorkOrder(selectedBacklogId, isoDateTime);
        if ("error" in result) {
          showToast(result.error, "error");
        } else {
          // Commit real state
          setData((prev) => ({
            scheduled: [...prev.scheduled, newScheduled],
            backlog: prev.backlog.filter((j) => j.id !== selectedBacklogId),
          }));
          setSelectedBacklogId(null);
          showToast("Job scheduled ✓");
        }
        setBusy(false);
      });
    },
    [selectedBacklogId, busy, data, applyOptimistic, showToast, startTransition],
  );

  const handleUnschedule = useCallback(
    (job: ScheduledJob) => {
      if (busy) return;
      setBusy(true);

      const backlogJob: BacklogJob = {
        id: job.id,
        title: job.title,
        status: job.status,
        client: { firstName: job.client.firstName, lastName: job.client.lastName },
        vehicle: job.vehicle,
        createdAt: new Date().toISOString(),
      };

      startTransition(async () => {
        // Optimistic: move job from scheduled back to backlog immediately
        applyOptimistic({
          scheduled: data.scheduled.filter((j) => j.id !== job.id),
          backlog: [...data.backlog, backlogJob],
        });

        const result = await unscheduleWorkOrder(job.id);
        if ("error" in result) {
          showToast(result.error, "error");
        } else {
          setData((prev) => ({
            scheduled: prev.scheduled.filter((j) => j.id !== job.id),
            backlog: [...prev.backlog, backlogJob],
          }));
          setDetailJob(null);
          showToast("Job returned to backlog");
        }
        setBusy(false);
      });
    },
    [busy, data, applyOptimistic, showToast, startTransition],
  );

  // Issue #87 — Elastic Dispatch: cancel a job and check for schedule gap
  const handleCancel = useCallback(
    (job: ScheduledJob) => {
      if (busy) return;
      setBusy(true);

      startTransition(async () => {
        // Optimistic: remove job from scheduled immediately
        applyOptimistic({
          scheduled: data.scheduled.filter((j) => j.id !== job.id),
          backlog: data.backlog,
        });

        const result = await cancelWorkOrder(job.id);
        if ("error" in result) {
          showToast(result.error, "error");
        } else {
          setData((prev) => ({
            scheduled: prev.scheduled.filter((j) => j.id !== job.id),
            backlog: prev.backlog,
          }));
          setDetailJob(null);
          showToast("Job cancelled");
          // If there is a next job, surface the ElasticDispatchPrompt
          if (result.nextJob) {
            setDispatchPrompt({ cancelledJobId: job.id, nextJob: result.nextJob });
          }
        }
        setBusy(false);
      });
    },
    [busy, data, applyOptimistic, showToast, startTransition],
  );

  function navigate(dir: -1 | 1) {
    setCurrentDate((d) => {
      const next = new Date(d);
      if (view === "day") next.setDate(next.getDate() + dir);
      else next.setDate(next.getDate() + dir * 7);
      return next;
    });
  }

  const dateLabel =
    view === "day"
      ? currentDate.toLocaleDateString("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
        })
      : `Week of ${weekDays[0].label}`;

  return (
    <div className="flex flex-col h-full bg-gray-950 relative">
      {/* Toast */}
      {toastElement}

      {/* Header */}
      <header className="px-4 pt-6 pb-3 flex flex-col gap-3">
        <h1 className="text-4xl font-black text-white tracking-tight">Calendar</h1>

        {/* Day/Week toggle */}
        <div className="flex items-center gap-3">
          <div className="flex rounded-xl overflow-hidden border border-gray-700 bg-gray-900">
            {(["day", "week"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={[
                  "px-4 py-2 text-sm font-bold capitalize transition-colors",
                  view === v
                    ? "bg-yellow-400 text-gray-900"
                    : "text-gray-400 hover:text-white",
                ].join(" ")}
              >
                {v}
              </button>
            ))}
          </div>

          {/* Navigation */}
          <div className="flex items-center gap-1 flex-1 justify-end">
            <button
              onClick={() => navigate(-1)}
              className="h-9 w-9 rounded-xl bg-gray-800 text-white flex items-center justify-center hover:bg-gray-700 transition-colors"
              aria-label="Previous"
            >
              ‹
            </button>
            <span className="text-sm text-gray-300 font-medium px-1 text-center flex-1">
              {dateLabel}
            </span>
            <button
              onClick={() => navigate(1)}
              className="h-9 w-9 rounded-xl bg-gray-800 text-white flex items-center justify-center hover:bg-gray-700 transition-colors"
              aria-label="Next"
            >
              ›
            </button>
          </div>
        </div>

        {selectedBacklogId && (
          <div
            role="status"
            className="rounded-xl bg-yellow-400/10 border border-yellow-400/40 px-3 py-2 text-yellow-300 text-xs font-semibold"
          >
            ✦ Job selected — tap a time slot below to schedule it
          </div>
        )}
      </header>

      {/* Calendar body */}
      <div className="flex-1 overflow-hidden px-4 pb-2">
        {view === "day" ? (
          <DayView
            date={currentDate}
            scheduled={optimisticData.scheduled}
            pendingId={selectedBacklogId}
            onSlotTap={handleSlotTap}
            onJobTap={setDetailJob}
          />
        ) : (
          <WeekView weekDays={weekDays} scheduled={optimisticData.scheduled} />
        )}
      </div>

      {/* Job detail sheet */}
      {detailJob && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-gray-900 rounded-t-3xl p-6 border border-gray-700">
            <h2 className="text-xl font-black text-white mb-1">{detailJob.title}</h2>
            <p className="text-gray-400 text-sm mb-1">
              {detailJob.client.firstName} {detailJob.client.lastName}
            </p>
            <p className="text-gray-400 text-sm mb-4">
              {detailJob.vehicle.year} {detailJob.vehicle.make} {detailJob.vehicle.model}
            </p>
            <p className="text-gray-500 text-xs mb-6">
              Scheduled:{" "}
              {new Date(detailJob.scheduledAt).toLocaleString("en-US", {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </p>
            <div className="flex flex-col gap-2">
              <div className="flex gap-3">
                <button
                  onClick={() => handleUnschedule(detailJob)}
                  disabled={busy}
                  className="flex-1 py-3 rounded-2xl bg-red-900 text-red-300 font-bold text-sm hover:bg-red-800 transition-colors disabled:opacity-50"
                >
                  Move to Backlog
                </button>
                <button
                  onClick={() => setDetailJob(null)}
                  className="flex-1 py-3 rounded-2xl bg-gray-800 text-white font-bold text-sm hover:bg-gray-700 transition-colors"
                >
                  Close
                </button>
              </div>
              {/* Cancel Job — triggers Elastic Dispatch gap detection (Issue #87) */}
              <button
                onClick={() => handleCancel(detailJob)}
                disabled={busy}
                className="w-full py-2.5 rounded-2xl border border-red-800 text-red-400 font-bold text-xs uppercase tracking-wide hover:bg-red-950 transition-colors disabled:opacity-50"
              >
                ✕ Cancel Job
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Elastic Dispatch prompt — shown after a cancellation creates a gap (Issue #87) */}
      {dispatchPrompt && (
        <ElasticDispatchPrompt
          cancelledJobId={dispatchPrompt.cancelledJobId}
          nextJob={dispatchPrompt.nextJob}
          onDismiss={() => setDispatchPrompt(null)}
          onConfirm={() => {
            setDispatchPrompt(null);
            showToast("Client notified of earlier arrival ✓");
          }}
        />
      )}

      {/* Backlog drawer */}
      <BacklogDrawer
        jobs={optimisticData.backlog}
        selectedId={selectedBacklogId}
        onSelect={setSelectedBacklogId}
      />
    </div>
  );
}
