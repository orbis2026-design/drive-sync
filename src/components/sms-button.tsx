"use client";

/**
 * NativeSmsButton (Issue #47) — Zero-Cost Native SMS Handoff
 *
 * Opens the device's native SMS app pre-populated with `phoneNumber` and
 * `messageBody`.  No Twilio account or API keys are required — the message
 * is sent from the mechanic's own phone plan.
 *
 * iOS uses   "sms:<number>?body=<encoded>"
 * Android uses "sms:<number>?body=<encoded>" as well (modern Android).
 * Some older Android builds require "&body=" — we detect the platform and
 * choose the correct delimiter automatically.
 *
 * Props:
 *   phoneNumber  — recipient E.164 or local number (non-numeric chars stripped)
 *   messageBody  — plain-text message (spaces and newlines are URL-encoded)
 *   label        — button label (defaults to "Send via SMS")
 *   className    — extra Tailwind classes forwarded to the <a> element
 */

import { useMemo } from "react";

interface NativeSmsButtonProps {
  phoneNumber: string;
  messageBody: string;
  label?: string;
  className?: string;
}

/**
 * Detect whether we're on an Android device.
 * Returns false in SSR / non-browser environments.
 */
function isAndroid(): boolean {
  if (typeof navigator === "undefined") return false;
  return /android/i.test(navigator.userAgent);
}

/**
 * Build the sms: deep-link URL.
 *
 * iOS & modern Android:  sms:<number>?body=<encoded>
 * Some older Android:    sms:<number>&body=<encoded>
 *
 * We default to "?" (the RFC 5724 standard) and use "&" only when we
 * positively detect an Android user agent.
 */
function buildSmsUrl(phoneNumber: string, messageBody: string): string {
  const cleanPhone = phoneNumber.replace(/[^\d+]/g, "");
  const encoded = encodeURIComponent(messageBody);
  const delimiter = isAndroid() ? "&" : "?";
  return `sms:${cleanPhone}${delimiter}body=${encoded}`;
}

export function NativeSmsButton({
  phoneNumber,
  messageBody,
  label = "Send via SMS",
  className = "",
}: NativeSmsButtonProps) {
  // Memoised so the URL is only recomputed when inputs change.
  const href = useMemo(
    () => buildSmsUrl(phoneNumber, messageBody),
    [phoneNumber, messageBody]
  );

  return (
    <a
      href={href}
      aria-label={`Send SMS to ${phoneNumber}`}
      className={[
        "inline-flex items-center justify-center gap-2",
        "rounded-2xl bg-brand-400 text-gray-950",
        "font-black text-xl uppercase tracking-widest",
        "min-h-[80px] w-full",
        "shadow-[0_0_40px_10px_rgba(250,204,21,0.50)]",
        "hover:bg-brand-300 hover:shadow-[0_0_56px_16px_rgba(250,204,21,0.70)]",
        "active:scale-[0.98]",
        "transition-all duration-300",
        "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span aria-hidden="true">📱</span>
      {label}
    </a>
  );
}
