"use client";

import { useState, useTransition } from "react";
import {
  motion,
  useMotionValue,
  useTransform,
  animate,
  AnimatePresence,
} from "framer-motion";
import {
  type QueuedMessage,
  approveAndSendMessage,
  discardMessage,
  sendBlastCampaign,
  BLAST_AUDIENCES,
} from "./actions";

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
        <div className="relative z-20 bg-gray-900 border border-gray-700 rounded-3xl p-6">
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
// PendingMessages — swipeable queue
// ---------------------------------------------------------------------------

function PendingMessages({ initialMessages }: { initialMessages: QueuedMessage[] }) {
  const [messages, setMessages] = useState(initialMessages);
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

  return (
    <div className="flex flex-col gap-6">
      {/* Action toast */}
      <AnimatePresence>
        {lastAction && (
          <motion.div
            key={`${lastAction.type}-${lastAction.client}`}
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={[
              "rounded-2xl px-5 py-3 flex items-center gap-3",
              lastAction.type === "sent"
                ? "bg-green-500/15 border border-green-500/30 text-green-400"
                : "bg-red-500/15 border border-red-500/30 text-red-400",
            ].join(" ")}
          >
            <span>{lastAction.type === "sent" ? "✅" : "🗑️"}</span>
            <span className="text-sm font-semibold">
              {lastAction.type === "sent"
                ? `Message sent to ${lastAction.client}`
                : `Message discarded for ${lastAction.client}`}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {messages.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <span className="text-6xl mb-4" aria-hidden="true">
            🎉
          </span>
          <p className="text-2xl font-black text-white mb-2">All clear!</p>
          <p className="text-base text-gray-400">
            No pending AI messages. Check back after the next analysis run.
          </p>
        </div>
      ) : (
        <>
          <p className="text-sm text-gray-500 text-center">
            {messages.length} message{messages.length !== 1 ? "s" : ""} waiting
            for review
          </p>
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
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// BlastCampaignForm — audience selector + message composer
// ---------------------------------------------------------------------------

function BlastCampaignForm() {
  const [audience, setAudience] = useState<string>(BLAST_AUDIENCES[0].value);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<
    | { type: "idle" }
    | { type: "loading" }
    | { type: "success"; sent: number }
    | { type: "error"; message: string }
  >({ type: "idle" });

  const [, startTransition] = useTransition();

  const selectedAudience = BLAST_AUDIENCES.find((a) => a.value === audience);
  const charCount = message.length;
  const MAX_CHARS = 320;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;
    setStatus({ type: "loading" });
    startTransition(async () => {
      const result = await sendBlastCampaign(audience, message);
      if ("error" in result) {
        setStatus({ type: "error", message: result.error });
      } else {
        setStatus({ type: "success", sent: result.sent });
        setMessage("");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      {/* Audience selector */}
      <div>
        <p className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">
          Target Audience
        </p>
        <div className="flex flex-col gap-2">
          {BLAST_AUDIENCES.map((a) => (
            <button
              key={a.value}
              type="button"
              onClick={() => setAudience(a.value)}
              className={[
                "w-full text-left rounded-2xl border px-4 py-3 transition-colors",
                audience === a.value
                  ? "bg-brand-400/10 border-brand-400/50 text-white"
                  : "bg-gray-900 border-gray-700 text-gray-300 hover:border-gray-500",
              ].join(" ")}
            >
              <p className="font-bold text-sm">{a.label}</p>
              <p className="text-xs text-gray-500 mt-0.5">{a.description}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Message composer */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-bold text-gray-400 uppercase tracking-wider">
            Message
          </p>
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
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={5}
          maxLength={MAX_CHARS}
          placeholder={`Write a message to ${selectedAudience?.label ?? "clients"}…`}
          className="w-full rounded-2xl bg-gray-900 border border-gray-700 text-white placeholder-gray-600 px-4 py-3 text-base resize-none focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent"
        />
      </div>

      {/* Status feedback */}
      <AnimatePresence>
        {status.type === "success" && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="rounded-2xl bg-green-500/15 border border-green-500/30 px-4 py-3 text-green-400 text-sm font-semibold"
          >
            ✅ Campaign sent to {status.sent} client{status.sent !== 1 ? "s" : ""}!
          </motion.div>
        )}
        {status.type === "error" && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="rounded-2xl bg-red-500/15 border border-red-500/30 px-4 py-3 text-red-400 text-sm font-semibold"
          >
            ❌ {status.message}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Submit */}
      <button
        type="submit"
        disabled={status.type === "loading" || !message.trim() || charCount > MAX_CHARS}
        className={[
          "w-full rounded-2xl py-4 text-base font-black uppercase tracking-wider transition-all",
          "bg-brand-400 text-gray-950",
          "disabled:opacity-40 disabled:cursor-not-allowed",
          "active:scale-95",
        ].join(" ")}
      >
        {status.type === "loading" ? "Sending…" : "🚀 Send Campaign"}
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// MarketingClient — main exported component
// ---------------------------------------------------------------------------

export type MarketingSegment = "pending" | "blast";

export function MarketingClient({
  initialMessages,
  initialError,
}: {
  initialMessages: QueuedMessage[];
  initialError?: string;
}) {
  const [segment, setSegment] = useState<MarketingSegment>("pending");

  return (
    <div className="flex flex-col min-h-full">
      {/* Segmented control */}
      <div className="sticky top-0 z-20 bg-gray-950 border-b border-gray-800 px-4 pt-4 pb-0">
        <div className="flex rounded-2xl bg-gray-900 border border-gray-800 p-1 gap-1">
          {(
            [
              { key: "pending", label: "📬 Pending AI Messages" },
              { key: "blast", label: "📣 Blast Campaigns" },
            ] as { key: MarketingSegment; label: string }[]
          ).map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setSegment(key)}
              className={[
                "flex-1 rounded-xl py-2.5 text-xs font-black uppercase tracking-wider transition-all",
                segment === key
                  ? "bg-brand-400 text-gray-950 shadow"
                  : "text-gray-400 hover:text-white",
              ].join(" ")}
            >
              {label}
            </button>
          ))}
        </div>
        {/* Pending count badge */}
        {segment === "pending" && initialMessages.length > 0 && (
          <div className="py-3 text-center">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-400/10 border border-brand-400/20 text-brand-400 text-xs font-bold">
              {initialMessages.length} queued
            </span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 px-4 py-6 pb-[calc(env(safe-area-inset-bottom)+80px)] sm:pb-6">
        {initialError && (
          <div
            role="alert"
            className="mb-4 rounded-2xl bg-red-950 border border-red-700 px-4 py-3 text-sm text-red-400"
          >
            {initialError}
          </div>
        )}

        {segment === "pending" ? (
          <PendingMessages initialMessages={initialMessages} />
        ) : (
          <BlastCampaignForm />
        )}
      </div>
    </div>
  );
}
