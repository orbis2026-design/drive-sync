"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ParsedVoiceNote {
  complaint: string;
  cause: string;
  correction: string;
  rawTranscript: string;
}

export interface VoiceLoggerFabProps {
  /**
   * Called when the user confirms saving the parsed note cards.
   * Typically a Server Action bound to the current work order.
   */
  onSave: (data: ParsedVoiceNote) => Promise<{ error?: string }>;
}

type LoggerState = "idle" | "recording" | "parsing" | "done";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Mock transcript used by the AI parser simulation.
 * In a production build this would be replaced by the Web Speech API
 * (or a cloud ASR service) output captured during the recording phase.
 */
const MOCK_TRANSCRIPT =
  "Car shakes at 60mph and smells like burning rubber";

/** Lines typed out during the simulated AI-parsing phase. */
const PARSING_LINES = [
  "> Receiving audio buffer…",
  "> Transcribing voice input…",
  "> Running AI parser…",
  "> Extracting complaint keywords…",
  "> Generating repair order fields…",
  "> Done.",
];

/** Flat string rendered by the terminal typer (newline-separated). */
const PARSING_TEXT = PARSING_LINES.join("\n");

/** Milliseconds to auto-stop a simulated recording session. */
const RECORDING_AUTO_STOP_MS = 4_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Simulates an AI parser that converts a raw technician transcript into the
 * three standard repair-order fields. Cause and Correction are left blank for
 * the technician to fill in after diagnosis / repair.
 */
function parseMockTranscript(transcript: string): ParsedVoiceNote {
  const trimmed = transcript.trim();
  return {
    complaint: trimmed.charAt(0).toUpperCase() + trimmed.slice(1),
    cause: "", // technician fills after diagnosis
    correction: "", // technician fills after repair
    rawTranscript: transcript,
  };
}

// ---------------------------------------------------------------------------
// Waveform — simulated audio visualiser
// ---------------------------------------------------------------------------

/**
 * Renders a row of animated bars that mimic a live audio waveform.
 * Each bar has a slightly different animation duration and delay so they
 * appear to shift independently, giving the impression of real sound data.
 */
function Waveform() {
  const BARS = 14;
  return (
    <>
      <div
        className="flex items-end justify-center gap-[3px] h-10"
        aria-hidden="true"
      >
        {Array.from({ length: BARS }, (_, i) => (
          <div
            key={i}
            className="w-[5px] rounded-sm bg-current"
            style={{
              height: "36px",
              transformOrigin: "bottom",
              animationName: "vlfWaveBar",
              animationDuration: `${(0.55 + (i % 5) * 0.15).toFixed(2)}s`,
              animationTimingFunction: "ease-in-out",
              animationIterationCount: "infinite",
              animationDirection: "alternate",
              animationDelay: `${(i * 0.07).toFixed(2)}s`,
            }}
          />
        ))}
      </div>
      {/* Keyframes scoped to this component via a unique prefix. */}
      <style>{`
        @keyframes vlfWaveBar {
          from { transform: scaleY(0.08); }
          to   { transform: scaleY(1.0);  }
        }
      `}</style>
    </>
  );
}

// ---------------------------------------------------------------------------
// TerminalTyper — character-by-character terminal display
// ---------------------------------------------------------------------------

interface TerminalTyperProps {
  onComplete: () => void;
}

/**
 * Renders the PARSING_LINES one character at a time, pausing slightly at each
 * newline to simulate a live terminal. Calls `onComplete` once the full text
 * has been printed and a short delay has elapsed.
 */
function TerminalTyper({ onComplete }: TerminalTyperProps) {
  const [charCount, setCharCount] = useState(0);
  // Store onComplete in a ref so the effect never needs to re-run because of it.
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (charCount >= PARSING_TEXT.length) {
      const t = setTimeout(() => onCompleteRef.current(), 600);
      return () => clearTimeout(t);
    }
    // Pause slightly longer at each newline (end of line) for readability.
    const delay = PARSING_TEXT[charCount] === "\n" ? 220 : 28;
    const t = setTimeout(() => setCharCount((c) => c + 1), delay);
    return () => clearTimeout(t);
  }, [charCount]);

  const displayed = PARSING_TEXT.slice(0, charCount);
  const isDone = charCount >= PARSING_TEXT.length;

  return (
    <div
      className="w-full max-w-sm mx-auto rounded-xl bg-gray-950 border border-gray-800 px-5 py-4 font-mono text-xs text-success-400 whitespace-pre-wrap leading-relaxed"
      aria-live="polite"
      aria-label="AI parsing progress"
    >
      {displayed}
      {!isDone && <span className="animate-pulse">▮</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// NoteCard — editable repair-order field
// ---------------------------------------------------------------------------

type NoteCardAccent = "danger" | "brand" | "success";

interface NoteCardProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  accent: NoteCardAccent;
  placeholder?: string;
}

const ACCENT_MAP: Record<
  NoteCardAccent,
  { label: string; border: string; bg: string }
> = {
  danger: {
    label: "text-danger-400",
    border: "border-danger-500/40",
    bg: "bg-danger-500/5",
  },
  brand: {
    label: "text-brand-400",
    border: "border-brand-400/40",
    bg: "bg-brand-400/5",
  },
  success: {
    label: "text-success-400",
    border: "border-success-500/40",
    bg: "bg-success-500/5",
  },
};

/**
 * A single editable card representing one repair-order field
 * (Complaint, Cause, or Correction).
 */
function NoteCard({ label, value, onChange, accent, placeholder }: NoteCardProps) {
  const styles = ACCENT_MAP[accent];
  const id = `vlf-card-${label.toLowerCase()}`;

  return (
    <div
      className={[
        "rounded-2xl border-2 overflow-hidden",
        styles.border,
        styles.bg,
      ].join(" ")}
    >
      <div className="px-5 pt-4 pb-1">
        <label
          htmlFor={id}
          className={[
            "block text-xs font-black uppercase tracking-widest",
            styles.label,
          ].join(" ")}
        >
          {label}
        </label>
      </div>
      <div className="px-5 pb-4">
        <textarea
          id={id}
          rows={3}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={[
            "w-full rounded-lg bg-gray-900 border border-gray-800 resize-none",
            "px-4 py-3 text-sm text-white placeholder:text-gray-600",
            "focus:outline-none focus:border-brand-400",
            "focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950",
            "transition-colors duration-150",
          ].join(" ")}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// VoiceLoggerFab — main export
// ---------------------------------------------------------------------------

/**
 * A floating "Push to Talk" action button that guides a technician through:
 *
 * 1. **Recording** — pulsing red FAB + animated waveform panel.
 * 2. **Parsing** — simulated AI processing with a terminal typing effect.
 * 3. **Output** — three editable repair-order cards (Complaint / Cause / Correction).
 * 4. **Save** — calls `onSave` with the completed note, which should be a
 *    Server Action that persists the data to Supabase.
 *
 * ### Integration example
 * ```tsx
 * // In a Server or Client Component that has access to the work order:
 * import { VoiceLoggerFab } from "@/components/voice-logger-fab";
 * import { saveVoiceNote }   from "./actions"; // "use server" action
 *
 * <VoiceLoggerFab
 *   onSave={(note) => saveVoiceNote(workOrderId, note)}
 * />
 * ```
 */
export function VoiceLoggerFab({ onSave }: VoiceLoggerFabProps) {
  const [state, setState] = useState<LoggerState>("idle");
  const [note, setNote] = useState<ParsedVoiceNote | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const recordTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Recording controls ────────────────────────────────────────────────────

  const startRecording = useCallback(() => {
    setNote(null);
    setSaved(false);
    setSaveError(null);
    setState("recording");
    setPanelOpen(true);
    // Auto-stop after RECORDING_AUTO_STOP_MS to simulate a real session.
    recordTimerRef.current = setTimeout(
      () => setState("parsing"),
      RECORDING_AUTO_STOP_MS,
    );
  }, []);

  const stopRecording = useCallback(() => {
    if (recordTimerRef.current) clearTimeout(recordTimerRef.current);
    setState("parsing");
  }, []);

  const handleFabPress = useCallback(() => {
    if (state === "idle") startRecording();
    else if (state === "recording") stopRecording();
  }, [state, startRecording, stopRecording]);

  // ── Parsing complete ──────────────────────────────────────────────────────

  const handleParsingComplete = useCallback(() => {
    const parsed = parseMockTranscript(MOCK_TRANSCRIPT);
    setNote(parsed);
    setState("done");
  }, []);

  // ── Save ──────────────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    if (!note) return;
    setSaving(true);
    setSaveError(null);
    const result = await onSave(note);
    setSaving(false);
    if (result.error) {
      setSaveError(result.error);
    } else {
      setSaved(true);
    }
  }, [note, onSave]);

  // ── Reset ─────────────────────────────────────────────────────────────────

  const handleReset = useCallback(() => {
    if (recordTimerRef.current) clearTimeout(recordTimerRef.current);
    setState("idle");
    setNote(null);
    setPanelOpen(false);
    setSaved(false);
    setSaveError(null);
  }, []);

  // ── Derived flags ─────────────────────────────────────────────────────────

  const isRecording = state === "recording";
  const isParsing = state === "parsing";
  const isDone = state === "done";
  const fabHidden = isParsing || isDone;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Bottom-sheet panel ──────────────────────────────────────────────── */}
      {panelOpen && (
        <>
          {/* Backdrop (only when cards are shown so the user can close by tapping away) */}
          {isDone && (
            <div
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
              onClick={handleReset}
              aria-hidden="true"
            />
          )}

          {/* Sheet */}
          <div
            role={isDone ? "dialog" : undefined}
            aria-modal={isDone ? true : undefined}
            aria-label={isDone ? "Voice note parsed — review and save" : undefined}
            className={[
              "fixed bottom-0 left-0 right-0 z-50",
              "flex flex-col",
              "max-h-[90dvh] overflow-y-auto",
              "rounded-t-3xl bg-gray-900 border-t-2",
              isRecording ? "border-danger-500/60" : "border-brand-400/40",
              "shadow-[0_-8px_40px_rgba(250,204,21,0.12)]",
              "animate-[vlfSlideUp_0.3s_cubic-bezier(0.32,0.72,0,1)_both]",
              // Desktop: float as a centred panel
              "sm:left-1/2 sm:-translate-x-1/2 sm:w-full sm:max-w-2xl sm:bottom-4 sm:rounded-3xl sm:border-2",
              isRecording ? "sm:border-danger-500/60" : "sm:border-brand-400/40",
            ].join(" ")}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-4 pb-2 flex-shrink-0">
              <div className="h-1 w-10 rounded-full bg-gray-700" />
            </div>

            <div className="px-5 pb-8 space-y-5">
              {/* ── Recording state ──────────────────────────────────────── */}
              {isRecording && (
                <div className="flex flex-col items-center gap-5 py-6">
                  <div className="text-danger-400">
                    <Waveform />
                  </div>
                  <p className="text-sm font-black uppercase tracking-widest text-danger-400 animate-pulse">
                    ● Listening…
                  </p>
                  <p className="text-xs text-gray-500">
                    Tap the mic button to stop early
                  </p>
                </div>
              )}

              {/* ── Parsing state ─────────────────────────────────────────── */}
              {isParsing && (
                <div className="flex flex-col items-center gap-5 py-4">
                  <h2 className="text-sm font-black uppercase tracking-widest text-brand-400">
                    AI Processing
                  </h2>
                  <TerminalTyper onComplete={handleParsingComplete} />
                </div>
              )}

              {/* ── Done state — editable repair-order cards ──────────────── */}
              {isDone && note && (
                <>
                  {/* Sheet header */}
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-xl font-black text-white">
                        Voice Note
                      </h2>
                      <p className="mt-0.5 text-xs text-gray-500 font-mono truncate max-w-[240px]">
                        &ldquo;{note.rawTranscript}&rdquo;
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleReset}
                      aria-label="Close voice note panel"
                      className="flex items-center justify-center h-9 w-9 rounded-full text-gray-500 hover:text-white hover:bg-gray-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
                    >
                      {/* × icon */}
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="h-5 w-5"
                        aria-hidden="true"
                      >
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>

                  {/* Repair-order field cards */}
                  <div className="space-y-4">
                    <NoteCard
                      label="Complaint"
                      value={note.complaint}
                      onChange={(v) =>
                        setNote((n) => n && { ...n, complaint: v })
                      }
                      accent="danger"
                      placeholder="Customer-reported symptom"
                    />
                    <NoteCard
                      label="Cause"
                      value={note.cause}
                      onChange={(v) =>
                        setNote((n) => n && { ...n, cause: v })
                      }
                      accent="brand"
                      placeholder="Root cause identified by technician"
                    />
                    <NoteCard
                      label="Correction"
                      value={note.correction}
                      onChange={(v) =>
                        setNote((n) => n && { ...n, correction: v })
                      }
                      accent="success"
                      placeholder="Repair or service performed"
                    />
                  </div>

                  {/* Save error */}
                  {saveError && (
                    <p
                      role="alert"
                      className="text-sm text-danger-400 font-medium text-center"
                    >
                      {saveError}
                    </p>
                  )}

                  {/* Save / Done button */}
                  {saved ? (
                    <div className="rounded-xl bg-success-500/10 border border-success-500/30 px-5 py-4 text-center">
                      <p className="text-success-400 font-bold text-base">
                        ✓ Voice note saved to work order
                      </p>
                      <button
                        type="button"
                        onClick={handleReset}
                        className="mt-3 w-full min-h-[48px] rounded-xl bg-gray-800 text-white font-semibold hover:bg-gray-700 active:scale-[0.98] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
                      >
                        Done
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={saving}
                      className={[
                        "w-full min-h-[56px] rounded-2xl",
                        "bg-brand-400 text-gray-950 font-black text-base uppercase tracking-wider",
                        "shadow-[0_0_24px_4px_rgba(250,204,21,0.35)]",
                        "hover:bg-brand-300 hover:shadow-[0_0_32px_8px_rgba(250,204,21,0.5)]",
                        "active:scale-[0.98]",
                        "disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none",
                        "transition-all duration-200",
                        "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900",
                      ].join(" ")}
                    >
                      {saving ? "Saving…" : "Save to Work Order →"}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── Floating Action Button ───────────────────────────────────────────── */}
      <button
        type="button"
        aria-label={isRecording ? "Stop recording" : "Start voice-to-text note"}
        onClick={handleFabPress}
        disabled={fabHidden}
        className={[
          // Position — floats above the mobile nav bar
          "fixed z-50",
          "bottom-[calc(env(safe-area-inset-bottom)+72px)] right-5",
          "sm:bottom-8 sm:right-8",
          // Shape & size
          "flex items-center justify-center h-16 w-16 rounded-full",
          // Color & glow — yellow at rest, red + pulsing when recording
          isRecording
            ? "bg-danger-500 shadow-[0_0_0_6px_rgba(244,63,94,0.25),0_0_32px_rgba(244,63,94,0.55)] animate-pulse"
            : "bg-brand-400 shadow-[0_0_24px_8px_rgba(250,204,21,0.4)]",
          // Hover (only when idle)
          !isRecording
            ? "hover:shadow-[0_0_32px_12px_rgba(250,204,21,0.55)] hover:scale-105"
            : "",
          "active:scale-95",
          // Hidden states
          fabHidden ? "opacity-0 pointer-events-none" : "opacity-100",
          "transition-all duration-200",
          "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950",
        ].join(" ")}
      >
        {isRecording ? (
          /* Stop icon */
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="h-7 w-7 text-white"
            aria-hidden="true"
          >
            <rect x="6" y="6" width="12" height="12" rx="2" />
          </svg>
        ) : (
          /* Microphone icon */
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="h-7 w-7 text-gray-950"
            aria-hidden="true"
          >
            <path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3zm6 10a1 1 0 0 1 2 0 8 8 0 0 1-7 7.93V22h2a1 1 0 0 1 0 2H9a1 1 0 0 1 0-2h2v-2.07A8 8 0 0 1 4 12a1 1 0 0 1 2 0 6 6 0 0 0 12 0z" />
          </svg>
        )}
      </button>

      {/* Slide-up keyframe — namespaced to avoid collision with the intake sheet. */}
      <style>{`
        @keyframes vlfSlideUp {
          from { transform: translateY(100%); }
          to   { transform: translateY(0);    }
        }
        @media (min-width: 640px) {
          @keyframes vlfSlideUp {
            from { transform: translateX(-50%) translateY(100%); opacity: 0; }
            to   { transform: translateX(-50%) translateY(0);    opacity: 1; }
          }
        }
      `}</style>
    </>
  );
}
