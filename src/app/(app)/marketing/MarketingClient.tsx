"use client";

import { useState, useTransition, useEffect } from "react";
import {
  motion,
  useMotionValue,
  useTransform,
  animate,
  AnimatePresence,
} from "framer-motion";
import {
  type QueuedMessage,
  type RetentionQueueItem,
  type SentLogItem,
  approveAndSendMessage,
  discardMessage,
  sendBlastCampaign,
  fetchSentLog,
  fetchAutoRetentionStatus,
  toggleAutoRetention,
} from "./actions";
import { BLAST_AUDIENCES, type BlastAudience } from "./constants";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function relativeAge(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diffMs / 3_600_000);
  if (hours < 1) return "Just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ---------------------------------------------------------------------------
// SwipeCard — single draggable message card
// ---------------------------------------------------------------------------

function SwipeCard({
  campaign,
  onApprove,
  onDiscard,
}: {
  campaign: QueuedMessage;
  onApprove: () => void;
  onDiscard: () => void;
}) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 0, 200], [-8, 0, 8]);
  const cardOpacity = useTransform(x, [-200, -120, 0, 120, 200], [0, 1, 1, 1, 0]);

  // Coloured action overlays
  const discardOverlay = useTransform(x, [-160, -40, 0], [0.75, 0, 0]);
  const approveOverlay = useTransform(x, [0, 40, 160], [0, 0, 0.75]);

  // Action hint labels
  const discardHintOpacity = useTransform(x, [-160, -60, 0], [1, 0.4, 0]);
  const approveHintOpacity = useTransform(x, [0, 60, 160], [0, 0.4, 1]);

  const THRESHOLD = 90;

  async function handleDragEnd(
    _: MouseEvent | TouchEvent | PointerEvent,
    info: { offset: { x: number } },
  ) {
    if (info.offset.x > THRESHOLD) {
      await animate(x, 500, { duration: 0.3, ease: "easeOut" });
      onApprove();
    } else if (info.offset.x < -THRESHOLD) {
      await animate(x, -500, { duration: 0.3, ease: "easeOut" });
      onDiscard();
    } else {
      animate(x, 0, { type: "spring", stiffness: 400, damping: 30 });
    }
  }

  const clientName = campaign.client
    ? `${campaign.client.firstName} ${campaign.client.lastName}`
    : "All Clients";

  return (
    <div className="relative select-none touch-pan-y">
      {/* Background action hints */}
      <div className="absolute inset-0 flex items-center justify-between px-8 pointer-events-none rounded-3xl overflow-hidden">
        <motion.div
          style={{ opacity: approveHintOpacity }}
          className="flex flex-col items-center gap-1"
        >
          <span className="text-4xl">✅</span>
          <span className="text-green-400 font-black text-sm uppercase tracking-widest">
            Send
          </span>
        </motion.div>
        <motion.div
          style={{ opacity: discardHintOpacity }}
          className="flex flex-col items-center gap-1"
        >
          <span className="text-4xl">🗑️</span>
          <span className="text-red-400 font-black text-sm uppercase tracking-widest">
            Discard
          </span>
        </motion.div>
      </div>

      {/* Draggable card */}
      <motion.div
        style={{ x, rotate, opacity: cardOpacity }}
        drag="x"
        dragElastic={0.15}
        dragMomentum={false}
        onDragEnd={handleDragEnd}
        className="relative z-10 rounded-3xl overflow-hidden cursor-grab active:cursor-grabbing"
        whileTap={{ scale: 0.98 }}
      >
        {/* Green approve overlay */}
        <motion.div
          style={{ opacity: approveOverlay }}
          className="absolute inset-0 bg-green-500 z-10 pointer-events-none rounded-3xl"
        />
        {/* Red discard overlay */}
        <motion.div
          style={{ opacity: discardOverlay }}
          className="absolute inset-0 bg-red-500 z-10 pointer-events-none rounded-3xl"
        />

        {/* Card body */}
        <div className="relative z-20 bg-gray-900 border border-gray-800 rounded-3xl p-6">
          {/* Campaign type chip */}
          <div className="flex items-center justify-between mb-4">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-400/15 border border-brand-400/30 text-brand-400 text-xs font-bold uppercase tracking-wider">
              🤖 AI Generated
            </span>
            <span className="text-xs text-gray-500">
              {relativeAge(campaign.createdAt)}
            </span>
          </div>

          {/* Recipient */}
          <p className="text-sm font-semibold text-gray-400 mb-2">
            To: <span className="text-white">{clientName}</span>
            {campaign.phoneNumber && (
              <span className="ml-2 text-gray-500">{campaign.phoneNumber}</span>
            )}
          </p>

          {/* Message body */}
          <p className="text-lg leading-relaxed text-white font-medium">
            {campaign.message}
          </p>

          {/* Swipe hint */}
          <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-800">
            <span className="text-xs text-red-400 font-semibold flex items-center gap-1">
              ← Discard
            </span>
            <span className="text-xs text-gray-600 font-medium">
              drag to action
            </span>
            <span className="text-xs text-green-400 font-semibold flex items-center gap-1">
              Approve →
            </span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// RetentionQueueCard — single predictive maintenance item
// ---------------------------------------------------------------------------

function RetentionQueueCard({
  item,
  onApprove,
  onDiscard,
}: {
  item: RetentionQueueItem;
  onApprove: () => void;
  onDiscard: () => void;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-bold text-white text-sm">{item.clientName}</p>
          <p className="text-xs text-gray-400">{item.phone}</p>
        </div>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-400/10 border border-yellow-400/30 text-yellow-400 text-xs font-bold flex-shrink-0">
          {(item.approachingMilestone / 1_000).toFixed(0)}k mi
        </span>
      </div>
      <p className="text-xs text-gray-400">
        {item.vehicleYear} {item.vehicleMake} {item.vehicleModel} ·{" "}
        <span className="text-gray-300">
          ~{item.currentMileage.toLocaleString()} mi projected
        </span>
      </p>
      <div className="bg-gray-800 rounded-xl p-3">
        <p className="text-xs text-gray-300 leading-relaxed">{item.smsDraft}</p>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={isPending}
          onClick={() => startTransition(onApprove)}
          className="flex-1 rounded-xl bg-green-500/20 border border-green-500/40 text-green-400 text-xs font-bold py-2 hover:bg-green-500/30 transition-colors disabled:opacity-50"
        >
          ✅ Approve &amp; Send
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => startTransition(onDiscard)}
          className="flex-1 rounded-xl bg-gray-800 border border-gray-700 text-gray-400 text-xs font-bold py-2 hover:bg-gray-700 transition-colors disabled:opacity-50"
        >
          Discard
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AIQueuePanel — left card (pending messages + retention queue)
// ---------------------------------------------------------------------------

function AIQueuePanel({
  initialMessages,
  initialRetentionQueue,
}: {
  initialMessages: QueuedMessage[];
  initialRetentionQueue: RetentionQueueItem[];
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [retentionQueue, setRetentionQueue] = useState(initialRetentionQueue);
  const [lastAction, setLastAction] = useState<{
    type: "sent" | "discarded";
    client: string;
  } | null>(null);
  const [, startTransition] = useTransition();

  function removeMessage(id: string) {
    setMessages((prev) => prev.filter((m) => m.id !== id));
  }

  function handleApprove(campaign: QueuedMessage) {
    const clientName = campaign.client
      ? `${campaign.client.firstName} ${campaign.client.lastName}`
      : "client";
    removeMessage(campaign.id);
    setLastAction({ type: "sent", client: clientName });
    startTransition(async () => {
      await approveAndSendMessage(campaign.id);
    });
  }

  function handleDiscard(campaign: QueuedMessage) {
    const clientName = campaign.client
      ? `${campaign.client.firstName} ${campaign.client.lastName}`
      : "client";
    removeMessage(campaign.id);
    setLastAction({ type: "discarded", client: clientName });
    startTransition(async () => {
      await discardMessage(campaign.id);
    });
  }

  function handleRetentionApprove(item: RetentionQueueItem) {
    setRetentionQueue((prev) =>
      prev.filter((i) => i.vehicleId !== item.vehicleId),
    );
    setLastAction({ type: "sent", client: item.clientName });
    // For retention items we create a campaign inline — use sendBlastCampaign
    // to a single phone number. The approveAndSendMessage action requires an
    // existing OutboundCampaign row. Instead we just send directly via the
    // blast path for this ad-hoc preview approval.
    startTransition(async () => {
      const { sendRetentionSms } = await import("./actions");
      await sendRetentionSms(item.clientId, item.phone, item.smsDraft);
    });
  }

  function handleRetentionDiscard(item: RetentionQueueItem) {
    setRetentionQueue((prev) =>
      prev.filter((i) => i.vehicleId !== item.vehicleId),
    );
    setLastAction({ type: "discarded", client: item.clientName });
  }

  const totalPending = messages.length + retentionQueue.length;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-white">🧠 AI Queue</h2>
        {totalPending > 0 && (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-brand-400/10 border border-brand-400/20 text-brand-400 text-xs font-bold">
            {totalPending} pending
          </span>
        )}
      </div>

      {/* Action toast */}
      <AnimatePresence>
        {lastAction && (
          <motion.div
            key={`${lastAction.type}-${lastAction.client}`}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={[
              "rounded-xl px-4 py-2.5 flex items-center gap-2 text-sm font-semibold",
              lastAction.type === "sent"
                ? "bg-green-500/15 border border-green-500/30 text-green-400"
                : "bg-red-500/15 border border-red-500/30 text-red-400",
            ].join(" ")}
          >
            {lastAction.type === "sent" ? "✅" : "🗑️"}
            {lastAction.type === "sent"
              ? `Message sent to ${lastAction.client}`
              : `Message discarded for ${lastAction.client}`}
          </motion.div>
        )}
      </AnimatePresence>

      {totalPending === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <span className="text-5xl mb-3" aria-hidden="true">🎉</span>
          <p className="text-xl font-black text-white mb-1">All clear!</p>
          <p className="text-sm text-gray-400">
            No pending messages. Check back after the next analysis run.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Swipeable QUEUED campaigns */}
          <AnimatePresence>
            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
              >
                <SwipeCard
                  campaign={msg}
                  onApprove={() => handleApprove(msg)}
                  onDiscard={() => handleDiscard(msg)}
                />
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Predictive retention items */}
          {retentionQueue.length > 0 && (
            <>
              {messages.length > 0 && (
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mt-2">
                  Predictive Maintenance
                </p>
              )}
              <AnimatePresence>
                {retentionQueue.map((item) => (
                  <motion.div
                    key={item.vehicleId}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
                  >
                    <RetentionQueueCard
                      item={item}
                      onApprove={() => handleRetentionApprove(item)}
                      onDiscard={() => handleRetentionDiscard(item)}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AutomationsPanel — right card (toggle + SMS log + blast form)
// ---------------------------------------------------------------------------

function AutomationsPanel() {
  const [autoEnabled, setAutoEnabled] = useState<boolean | null>(null);
  const [sentLog, setSentLog] = useState<SentLogItem[]>([]);
  const [logLoading, setLogLoading] = useState(true);
  const [togglePending, startToggleTransition] = useTransition();
  const [blastAudience, setBlastAudience] = useState<string>(BLAST_AUDIENCES[0].value);
  const [blastMessage, setBlastMessage] = useState("");
  const [blastStatus, setBlastStatus] = useState<
    | { type: "idle" }
    | { type: "loading" }
    | { type: "success"; sent: number }
    | { type: "error"; message: string }
  >({ type: "idle" });
  const [, startBlastTransition] = useTransition();

  useEffect(() => {
    fetchAutoRetentionStatus().then((res) => {
      if ("enabled" in res) setAutoEnabled(res.enabled);
    });
    fetchSentLog().then((res) => {
      if ("data" in res) setSentLog(res.data);
      setLogLoading(false);
    });
  }, []);

  function handleToggle() {
    if (autoEnabled === null) return;
    const next = !autoEnabled;
    setAutoEnabled(next);
    startToggleTransition(async () => {
      await toggleAutoRetention(next);
    });
  }

  async function handleBlastSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!blastMessage.trim()) return;
    setBlastStatus({ type: "loading" });
    startBlastTransition(async () => {
      const result = await sendBlastCampaign(blastAudience, blastMessage);
      if ("error" in result) {
        setBlastStatus({ type: "error", message: result.error });
      } else {
        setBlastStatus({ type: "success", sent: result.sent });
        setBlastMessage("");
        // Refresh log
        fetchSentLog().then((res) => {
          if ("data" in res) setSentLog(res.data);
        });
      }
    });
  }

  const MAX_CHARS = 320;
  const charCount = blastMessage.length;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl flex flex-col gap-6 p-6">
      <h2 className="text-base font-bold text-white">⚡ Automations &amp; Logs</h2>

      {/* Auto-retention toggle */}
      <div className="flex items-center justify-between gap-4 bg-gray-800 rounded-xl p-4">
        <div>
          <p className="text-sm font-bold text-white">
            Fully Automated AI Reminders
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            Automatically queue SMS for approaching maintenance milestones.
          </p>
        </div>
        <button
          type="button"
          onClick={handleToggle}
          disabled={autoEnabled === null || togglePending}
          aria-pressed={autoEnabled ?? false}
          className={[
            "relative flex-shrink-0 w-12 h-6 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400 disabled:opacity-50",
            autoEnabled ? "bg-yellow-400" : "bg-gray-600",
          ].join(" ")}
        >
          <span
            className={[
              "absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform",
              autoEnabled ? "translate-x-6" : "translate-x-0",
            ].join(" ")}
          />
        </button>
      </div>

      {/* Blast campaign form */}
      <form onSubmit={handleBlastSubmit} className="flex flex-col gap-4">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">
          📣 Blast Campaign
        </p>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-gray-400">Audience</label>
          <select
            value={blastAudience}
            onChange={(e) => setBlastAudience(e.target.value)}
            className="w-full rounded-xl bg-gray-800 border border-gray-700 text-white text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400"
          >
            {BLAST_AUDIENCES.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs text-gray-400">Message</label>
            <span
              className={[
                "text-xs tabular-nums",
                charCount > MAX_CHARS ? "text-red-400" : "text-gray-500",
              ].join(" ")}
            >
              {charCount}/{MAX_CHARS}
            </span>
          </div>
          <textarea
            value={blastMessage}
            onChange={(e) => setBlastMessage(e.target.value)}
            rows={3}
            maxLength={MAX_CHARS}
            placeholder="Write a message to clients…"
            className="w-full rounded-xl bg-gray-800 border border-gray-700 text-white placeholder-gray-600 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
        </div>
        <AnimatePresence>
          {blastStatus.type === "success" && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="rounded-xl bg-green-500/15 border border-green-500/30 px-3 py-2 text-green-400 text-xs font-semibold"
            >
              ✅ Sent to {blastStatus.sent} client{blastStatus.sent !== 1 ? "s" : ""}
            </motion.div>
          )}
          {blastStatus.type === "error" && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="rounded-xl bg-red-500/15 border border-red-500/30 px-3 py-2 text-red-400 text-xs font-semibold"
            >
              ❌ {blastStatus.message}
            </motion.div>
          )}
        </AnimatePresence>
        <button
          type="submit"
          disabled={
            blastStatus.type === "loading" ||
            !blastMessage.trim() ||
            charCount > MAX_CHARS
          }
          className="w-full rounded-xl py-2.5 text-sm font-black uppercase tracking-wider bg-brand-400 text-gray-950 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 transition-all"
        >
          {blastStatus.type === "loading" ? "Sending…" : "🚀 Send Campaign"}
        </button>
      </form>

      {/* SMS sent log */}
      <div className="flex flex-col gap-2">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">
          📋 Recent Sent Log
        </p>
        {logLoading ? (
          <p className="text-xs text-gray-500">Loading…</p>
        ) : sentLog.length === 0 ? (
          <p className="text-xs text-gray-500">No messages sent yet.</p>
        ) : (
          <div className="flex flex-col gap-2 max-h-64 overflow-y-auto pr-1">
            {sentLog.map((item) => (
              <div
                key={item.id}
                className="bg-gray-800 rounded-xl p-3 flex flex-col gap-1"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-white">
                    {item.clientName ?? item.phoneNumber ?? "Unknown"}
                  </p>
                  <p className="text-xs text-gray-500 flex-shrink-0">
                    {item.sentAt ? relativeAge(item.sentAt) : "—"}
                  </p>
                </div>
                {item.phoneNumber && item.clientName && (
                  <p className="text-xs text-gray-500">{item.phoneNumber}</p>
                )}
                <p className="text-xs text-gray-300 leading-relaxed line-clamp-2">
                  {item.message}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MarketingClient — main exported component
// ---------------------------------------------------------------------------

export type MarketingSegment = "pending" | "blast";

export function MarketingClient({
  initialMessages,
  initialError,
  initialRetentionQueue,
}: {
  initialMessages: QueuedMessage[];
  initialError?: string;
  initialRetentionQueue: RetentionQueueItem[];
}) {
  return (
    <div className="flex-1 px-4 py-6 pb-[calc(env(safe-area-inset-bottom)+80px)] lg:pb-8">
      {initialError && (
        <div
          role="alert"
          className="mb-4 rounded-2xl bg-red-950 border border-red-700 px-4 py-3 text-sm text-red-400"
        >
          {initialError}
        </div>
      )}

      {/* Two-column desktop layout (stacked on mobile) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left — AI Queue */}
        <AIQueuePanel
          initialMessages={initialMessages}
          initialRetentionQueue={initialRetentionQueue}
        />
        {/* Right — Automations & Logs */}
        <AutomationsPanel />
      </div>
    </div>
  );
}
