"use client";

/**
 * ProductUISlideshow.tsx
 *
 * Auto-rotating slideshow of product UI display images for the hero.
 * Cycles through: Financial dashboard, Messages/SMS UI, AI Insights UI.
 * Marketing illustration only — not real user data.
 */

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const ROTATE_MS = 5_000;

const REVENUE_BARS = [40, 65, 50, 80, 55, 90, 75, 95];
const METRICS = [
  { label: "Net Profit", value: "$4,820", color: "text-green-400" },
  { label: "Open Jobs", value: "12", color: "text-yellow-400" },
  { label: "Parts COGS", value: "$1,340", color: "text-orange-400" },
  { label: "Card Fees", value: "$87", color: "text-red-400" },
];
const PIPELINE = [
  { label: "Intake", count: 3, color: "bg-blue-600" },
  { label: "Active", count: 5, color: "bg-yellow-500" },
  { label: "Done", count: 4, color: "bg-green-600" },
];

/** Financial dashboard UI display */
function FinancialCard({ variant }: { variant: "mobile" | "desktop" }) {
  const isDesktop = variant === "desktop";
  return (
    <div
      className={
        isDesktop
          ? "w-full max-w-sm xl:max-w-md rounded-2xl border border-gray-600/80 bg-gray-900/95 p-5 xl:p-6 shadow-2xl shadow-black/50 ring-1 ring-gray-500/20"
          : "w-full max-w-sm mx-auto rounded-2xl border border-gray-700 bg-gray-900 p-5 shadow-2xl shadow-black/60"
      }
    >
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full bg-red-500" />
          <div className="h-3 w-3 rounded-full bg-yellow-400" />
          <div className="h-3 w-3 rounded-full bg-green-500" />
        </div>
        <div className="h-4 w-24 rounded bg-gray-800" />
      </div>
      <div className={`mb-4 grid grid-cols-2 gap-3 ${isDesktop ? "xl:gap-4" : ""}`}>
        {METRICS.map((m) => (
          <div
            key={m.label}
            className={`rounded-xl border border-gray-700 bg-gray-800 ${isDesktop ? "xl:p-4 p-3" : "p-3"}`}
          >
            <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-gray-500">
              {m.label}
            </p>
            <p className={`tabular-nums font-black ${m.color} ${isDesktop ? "text-xl xl:text-2xl" : "text-xl"}`}>
              {m.value}
            </p>
          </div>
        ))}
      </div>
      <div className={`mb-4 rounded-xl border border-gray-700 bg-gray-800 p-3 ${isDesktop ? "xl:p-4" : ""}`}>
        <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-gray-500">
          Weekly Revenue
        </p>
        <div className="flex h-16 items-end gap-1.5">
          {REVENUE_BARS.map((h, i) => (
            <div
              key={i}
              className="flex-1 rounded-sm bg-gradient-to-t from-red-600 to-red-400 opacity-80"
              style={{ height: `${h}%` }}
            />
          ))}
        </div>
      </div>
      <div className={`rounded-xl border border-gray-700 bg-gray-800 p-3 ${isDesktop ? "xl:p-4" : ""}`}>
        <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-500">
          Job Pipeline
        </p>
        <div className="flex gap-2">
          {PIPELINE.map((s) => (
            <div key={s.label} className="flex-1 text-center">
              <div className={`${s.color} mb-1 rounded-lg py-2 text-sm font-black text-white`}>
                {s.count}
              </div>
              <p className="text-[9px] uppercase tracking-widest text-gray-500">{s.label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Messages / SMS handoff UI display */
function MessagesCard({ variant }: { variant: "mobile" | "desktop" }) {
  const isDesktop = variant === "desktop";
  const threads = [
    { name: "Maria R.", preview: "Can you do brakes tomorrow?", time: "10:42", unread: true },
    { name: "James T.", preview: "Quote looks good, see you at 2", time: "9:15", unread: false },
    { name: "Fleet Acme", preview: "Batch invoice ready for approval", time: "Yesterday", unread: true },
  ];
  return (
    <div
      className={
        isDesktop
          ? "w-full max-w-sm xl:max-w-md rounded-2xl border border-gray-600/80 bg-gray-900/95 p-5 xl:p-6 shadow-2xl shadow-black/50 ring-1 ring-gray-500/20"
          : "w-full max-w-sm mx-auto rounded-2xl border border-gray-700 bg-gray-900 p-5 shadow-2xl shadow-black/60"
      }
    >
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full bg-red-500" />
          <div className="h-3 w-3 rounded-full bg-yellow-400" />
          <div className="h-3 w-3 rounded-full bg-green-500" />
        </div>
        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
          Messages
        </span>
      </div>
      <div className="space-y-2">
        {threads.map((t) => (
          <div
            key={t.name}
            className={`flex items-center gap-3 rounded-xl border border-gray-700 bg-gray-800 px-3 py-2.5 ${isDesktop ? "xl:px-4" : ""}`}
          >
            <div className="h-9 w-9 flex-shrink-0 rounded-full bg-gray-600" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-xs font-semibold text-white">{t.name}</span>
                <span className="text-[10px] text-gray-500">{t.time}</span>
              </div>
              <p className={`truncate text-[11px] ${t.unread ? "font-medium text-gray-300" : "text-gray-500"}`}>
                {t.preview}
              </p>
            </div>
            {t.unread && (
              <div className="h-2 w-2 flex-shrink-0 rounded-full bg-red-500" aria-hidden />
            )}
          </div>
        ))}
      </div>
      <div className={`mt-3 rounded-xl border border-green-700/40 bg-green-950/30 p-3 ${isDesktop ? "xl:p-4" : ""}`}>
        <p className="text-[10px] font-bold uppercase tracking-widest text-green-400">
          Native SMS · No app required
        </p>
        <p className="mt-1 text-[11px] text-gray-400">
          Customers get a link in their Messages app. One tap to view quote & sign.
        </p>
      </div>
    </div>
  );
}

/** AI insights / diagnostics UI display */
function AIInsightsCard({ variant }: { variant: "mobile" | "desktop" }) {
  const isDesktop = variant === "desktop";
  return (
    <div
      className={
        isDesktop
          ? "w-full max-w-sm xl:max-w-md rounded-2xl border border-gray-600/80 bg-gray-900/95 p-5 xl:p-6 shadow-2xl shadow-black/50 ring-1 ring-gray-500/20"
          : "w-full max-w-sm mx-auto rounded-2xl border border-gray-700 bg-gray-900 p-5 shadow-2xl shadow-black/60"
      }
    >
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full bg-red-500" />
          <div className="h-3 w-3 rounded-full bg-yellow-400" />
          <div className="h-3 w-3 rounded-full bg-green-500" />
        </div>
        <span className="text-[10px] font-bold uppercase tracking-widest text-red-400">
          AI Insights
        </span>
      </div>
      <div className={`mb-3 rounded-xl border border-gray-700 bg-gray-800 p-3 ${isDesktop ? "xl:p-4" : ""}`}>
        <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-500">
          Suggested diagnosis
        </p>
        <p className="text-sm font-semibold text-white">
          P0420 — Catalyst system efficiency below threshold
        </p>
        <p className="mt-1.5 text-[11px] text-gray-400">
          Bank 1 · Common causes: O2 sensor, catalytic converter
        </p>
      </div>
      <div className={`mb-3 rounded-xl border border-amber-800/40 bg-amber-950/20 p-3 ${isDesktop ? "xl:p-4" : ""}`}>
        <p className="text-[10px] font-bold uppercase tracking-widest text-amber-400">
          TSB match
        </p>
        <p className="text-[11px] text-gray-300">
          TSB 12-123: Extended warranty for P0420 on 2018–2021 models
        </p>
      </div>
      <div className={`rounded-xl border border-gray-700 bg-gray-800 p-3 ${isDesktop ? "xl:p-4" : ""}`}>
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
          Confidence 94%
        </p>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-700">
          <div
            className="h-full rounded-full bg-gradient-to-r from-red-500 to-green-500"
            style={{ width: "94%" }}
          />
        </div>
      </div>
    </div>
  );
}

const SLIDES = [
  { id: "financial", label: "Dashboard", Card: FinancialCard },
  { id: "messages", label: "Messages", Card: MessagesCard },
  { id: "ai", label: "AI Insights", Card: AIInsightsCard },
] as const;

type Variant = "mobile" | "desktop";

export function ProductUISlideshow({ variant = "mobile" }: { variant?: Variant }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % SLIDES.length);
    }, ROTATE_MS);
    return () => clearInterval(id);
  }, []);

  const current = SLIDES[index];
  const Card = current.Card;

  return (
    <div className="w-full max-w-md mx-auto lg:max-w-full">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={current.id}
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.98 }}
          transition={{ duration: 0.35 }}
          className="flex justify-center"
        >
          <Card variant={variant} />
        </motion.div>
      </AnimatePresence>

      <div
        className="mt-4 flex justify-center gap-1.5"
        role="tablist"
        aria-label="Product UI slides"
      >
        {SLIDES.map((s, i) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={i === index}
            aria-label={`View ${s.label} screen`}
            onClick={() => setIndex(i)}
            className={`h-2 rounded-full transition-all ${
              i === index ? "w-6 bg-red-500" : "w-2 bg-gray-700 hover:bg-gray-600"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
