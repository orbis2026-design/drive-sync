"use client";

import { useState, useCallback } from "react";
import { submitBooking } from "./actions";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TimeWindow {
  label: string;
  startHour: number;
  endHour: number;
}

const TIME_WINDOWS: TimeWindow[] = [
  { label: "Morning (8 AM – 12 PM)", startHour: 8, endHour: 12 },
  { label: "Afternoon (12 PM – 4 PM)", startHour: 12, endHour: 16 },
  { label: "Evening (4 PM – 7 PM)", startHour: 16, endHour: 19 },
];

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface SlotChoice {
  date: Date;
  window: TimeWindow;
}

// ---------------------------------------------------------------------------
// Helper: generate next 7 days
// ---------------------------------------------------------------------------
function getNext7Days(): Date[] {
  const days: Date[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    days.push(d);
  }
  return days;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StepIndicator({ step }: { step: number }) {
  const steps = ["Contact", "Schedule", "Confirm"];
  return (
    <div className="flex items-center justify-center gap-2 px-6 py-5">
      {steps.map((label, idx) => {
        const num = idx + 1;
        const active = num === step;
        const done = num < step;
        return (
          <div key={label} className="flex items-center gap-2">
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black ${
                active
                  ? "bg-blue-600 text-white"
                  : done
                    ? "bg-blue-200 text-blue-700"
                    : "bg-gray-200 text-gray-400"
              }`}
            >
              {done ? "✓" : num}
            </div>
            <span
              className={`text-xs font-semibold hidden sm:block ${
                active ? "text-blue-600" : "text-gray-400"
              }`}
            >
              {label}
            </span>
            {idx < steps.length - 1 && (
              <div className="w-8 h-px bg-gray-200" />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function BookingClient({
  tenantId,
  shopName,
}: {
  tenantId: string;
  shopName: string;
}) {
  const [step, setStep] = useState(1);

  // Step 1 — contact
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [description, setDescription] = useState("");

  // Step 2 — slot
  const [selectedSlot, setSelectedSlot] = useState<SlotChoice | null>(null);

  // Result
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmedId, setConfirmedId] = useState<string | null>(null);

  const days = getNext7Days();

  // ---------- Step 1 Validation ----------
  const step1Valid =
    firstName.trim() && lastName.trim() && phone.trim() && description.trim();

  // ---------- Submit ----------
  const handleSubmit = useCallback(async () => {
    if (!selectedSlot) return;
    setSubmitting(true);
    setError(null);

    const windowStart = new Date(selectedSlot.date);
    windowStart.setHours(selectedSlot.window.startHour, 0, 0, 0);

    const result = await submitBooking({
      tenantId,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      phone: phone.trim(),
      email: email.trim() || undefined,
      description: description.trim(),
      windowStart: windowStart.toISOString(),
    });

    setSubmitting(false);
    if (result.error) {
      setError(result.error);
    } else if (result.workOrderId) {
      setConfirmedId(result.workOrderId);
    }
  }, [
    tenantId,
    firstName,
    lastName,
    phone,
    email,
    description,
    selectedSlot,
  ]);

  // ---------- Success screen ----------
  if (confirmedId) {
    const ref = confirmedId.slice(0, 8).toUpperCase(); // display-only truncation; full UUID used for all lookups
    return (
      <div className="flex flex-col items-center gap-6 px-6 py-12 text-center">
        <div className="text-6xl">✅</div>
        <div>
          <h2 className="text-2xl font-black text-gray-900 mb-2">
            Booking Confirmed!
          </h2>
          <p className="text-gray-600 text-sm leading-relaxed">
            {shopName} will reach out shortly to confirm your appointment.
          </p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-2xl px-6 py-4 w-full">
          <p className="text-xs text-blue-600 font-bold uppercase tracking-widest mb-1">
            Reference Number
          </p>
          <p className="text-2xl font-black text-blue-700 font-mono">{ref}</p>
        </div>
        {selectedSlot && (
          <div className="text-sm text-gray-600">
            <p className="font-semibold">
              {selectedSlot.date.toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </p>
            <p>{selectedSlot.window.label}</p>
          </div>
        )}
      </div>
    );
  }

  // ---------- Step 1 ----------
  const inputCls =
    "w-full rounded-xl border border-gray-300 bg-white text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 px-4 py-3 text-sm";
  const labelCls = "text-xs font-bold uppercase tracking-widest text-gray-500";

  return (
    <div className="flex flex-col">
      <StepIndicator step={step} />

      {/* ── Step 1: Contact Info ───────────────────────────────────── */}
      {step === 1 && (
        <div className="px-6 pb-8 flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className={labelCls}>First Name</label>
              <input
                type="text"
                placeholder="Jane"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className={inputCls}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelCls}>Last Name</label>
              <input
                type="text"
                placeholder="Doe"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className={labelCls}>Phone Number</label>
            <input
              type="tel"
              placeholder="(555) 867-5309"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={inputCls}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className={labelCls}>Email (optional)</label>
            <input
              type="email"
              placeholder="jane@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputCls}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className={labelCls}>Describe the Issue</label>
            <textarea
              rows={3}
              placeholder="My car makes a grinding noise when I brake…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={`${inputCls} resize-none`}
            />
          </div>

          <button
            type="button"
            disabled={!step1Valid}
            onClick={() => setStep(2)}
            className="w-full bg-blue-600 text-white font-black uppercase tracking-wide rounded-xl py-4 hover:bg-blue-500 active:scale-95 transition-transform disabled:opacity-40 disabled:cursor-not-allowed mt-2"
          >
            Choose a Time →
          </button>
        </div>
      )}

      {/* ── Step 2: Service Window ─────────────────────────────────── */}
      {step === 2 && (
        <div className="px-6 pb-8 flex flex-col gap-5">
          <p className={labelCls}>Select a Service Window</p>

          <div className="flex flex-col gap-3">
            {days.map((day) => (
              <div key={day.toISOString()} className="flex flex-col gap-2">
                <p className="text-sm font-bold text-gray-700">
                  {DAY_NAMES[day.getDay()]},{" "}
                  {day.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {TIME_WINDOWS.map((w) => {
                    const isSelected =
                      selectedSlot?.date.toDateString() ===
                        day.toDateString() &&
                      selectedSlot.window.label === w.label;
                    return (
                      <button
                        key={w.label}
                        type="button"
                        onClick={() => setSelectedSlot({ date: day, window: w })}
                        className={`rounded-xl border px-3 py-3 text-sm font-semibold text-left transition-all ${
                          isSelected
                            ? "bg-blue-600 border-blue-600 text-white"
                            : "bg-white border-gray-200 text-gray-700 hover:border-blue-400"
                        }`}
                      >
                        {w.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-3 mt-2">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="flex-1 border border-gray-300 text-gray-700 font-bold uppercase tracking-wide rounded-xl py-3 hover:bg-gray-50 active:scale-95 transition-transform text-sm"
            >
              ← Back
            </button>
            <button
              type="button"
              disabled={!selectedSlot}
              onClick={() => setStep(3)}
              className="flex-1 bg-blue-600 text-white font-black uppercase tracking-wide rounded-xl py-3 hover:bg-blue-500 active:scale-95 transition-transform disabled:opacity-40 disabled:cursor-not-allowed text-sm"
            >
              Review →
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: Confirmation ───────────────────────────────────── */}
      {step === 3 && (
        <div className="px-6 pb-8 flex flex-col gap-5">
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 flex flex-col gap-3">
            <p className={`${labelCls} text-blue-600`}>Booking Summary</p>

            <div className="flex flex-col gap-2 text-sm text-gray-800">
              <div className="flex justify-between">
                <span className="text-gray-500">Name</span>
                <span className="font-semibold">
                  {firstName} {lastName}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Phone</span>
                <span className="font-semibold">{phone}</span>
              </div>
              {email && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Email</span>
                  <span className="font-semibold">{email}</span>
                </div>
              )}
              <div className="border-t border-blue-200 pt-2 mt-1">
                <p className="text-gray-500">Issue</p>
                <p className="font-semibold mt-0.5">{description}</p>
              </div>
              {selectedSlot && (
                <div className="border-t border-blue-200 pt-2 mt-1">
                  <p className="text-gray-500">Appointment Window</p>
                  <p className="font-semibold mt-0.5">
                    {selectedSlot.date.toLocaleDateString("en-US", {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                    })}
                  </p>
                  <p className="text-gray-600">{selectedSlot.window.label}</p>
                </div>
              )}
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-600 text-sm">
              ⚠️ {error}
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="flex-1 border border-gray-300 text-gray-700 font-bold uppercase tracking-wide rounded-xl py-3 hover:bg-gray-50 active:scale-95 transition-transform text-sm"
            >
              ← Back
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={handleSubmit}
              className="flex-1 bg-blue-600 text-white font-black uppercase tracking-wide rounded-xl py-3 hover:bg-blue-500 active:scale-95 transition-transform disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              {submitting ? "Booking…" : "Confirm Booking"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
