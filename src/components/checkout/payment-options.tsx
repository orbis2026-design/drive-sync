"use client";

/**
 * payment-options.tsx — Checkout Payment Options Component
 *
 * Displays available payment methods for a work-order quote, including:
 *   • Standard card payment
 *   • BNPL (Affirm / Klarna) when total ≥ $250
 *   • Stripe Terminal (Tap-to-Pay) section with reader connection status
 *
 * Props:
 *   totalCents  — Invoice total in cents (integer, no floating-point)
 *   workOrderId — WorkOrder ID sent to /api/stripe/payment-intent
 *   quoteTitle  — Human-readable label shown above the payment buttons
 */

import { useState } from "react";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minimum total in cents to show BNPL financing options ($250). */
const BNPL_THRESHOLD_CENTS = 25_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format cents to a USD dollar string without the "$" symbol. */
function formatDollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

// ---------------------------------------------------------------------------
// Icons (inline SVG to avoid extra dependencies)
// ---------------------------------------------------------------------------

function SparkleIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className="w-3.5 h-3.5"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M9 4.5a.75.75 0 01.721.544l.813 2.846a3.75 3.75 0 002.576 2.576l2.846.813a.75.75 0 010 1.442l-2.846.813a3.75 3.75 0 00-2.576 2.576l-.813 2.846a.75.75 0 01-1.442 0l-.813-2.846a3.75 3.75 0 00-2.576-2.576l-2.846-.813a.75.75 0 010-1.442l2.846-.813A3.75 3.75 0 007.466 7.89l.813-2.846A.75.75 0 019 4.5zM18 1.5a.75.75 0 01.728.568l.258 1.036c.236.94.97 1.674 1.91 1.91l1.036.258a.75.75 0 010 1.456l-1.036.258c-.94.236-1.674.97-1.91 1.91l-.258 1.036a.75.75 0 01-1.456 0l-.258-1.036a2.625 2.625 0 00-1.91-1.91l-1.036-.258a.75.75 0 010-1.456l1.036-.258a2.625 2.625 0 001.91-1.91l.258-1.036A.75.75 0 0118 1.5z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function CreditCardIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className="w-5 h-5"
      aria-hidden="true"
    >
      <path d="M4.5 3.75a3 3 0 00-3 3v.75h21v-.75a3 3 0 00-3-3h-15z" />
      <path
        fillRule="evenodd"
        d="M22.5 9.75h-21v7.5a3 3 0 003 3h15a3 3 0 003-3v-7.5zm-18 3.75a.75.75 0 01.75-.75h6a.75.75 0 010 1.5h-6a.75.75 0 01-.75-.75zm.75 2.25a.75.75 0 000 1.5h3a.75.75 0 000-1.5h-3z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function DevicePhoneMobileIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className="w-5 h-5"
      aria-hidden="true"
    >
      <path d="M10.5 18.75a.75.75 0 000 1.5h3a.75.75 0 000-1.5h-3z" />
      <path
        fillRule="evenodd"
        d="M8.625 3A3.375 3.375 0 005.25 6.375v11.25A3.375 3.375 0 008.625 21h6.75a3.375 3.375 0 003.375-3.375V6.375A3.375 3.375 0 0015.375 3h-6.75zM7.5 6.375c0-1.035.84-1.875 1.875-1.875h.375A.75.75 0 0110.5 5.25v.375c0 .207.168.375.375.375h2.25a.375.375 0 00.375-.375V5.25a.75.75 0 01.75-.75h.375c1.035 0 1.875.84 1.875 1.875v11.25c0 1.035-.84 1.875-1.875 1.875h-6.75A1.875 1.875 0 017.5 17.625V6.375z"
        clipRule="evenodd"
      />
    </svg>
  );
}


interface FinancingBadgeProps {
  totalCents: number;
}

/** Green gradient badge shown when BNPL financing is available. */
function FinancingBadge({ totalCents }: FinancingBadgeProps) {
  const installmentCents = Math.ceil(totalCents / 4);

  return (
    <div className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-emerald-500 to-green-400 px-3 py-1 text-xs font-semibold text-white shadow-sm">
      <SparkleIcon />
      <span>Financing Available</span>
      <span className="opacity-80">·</span>
      <span>4 × ${formatDollars(installmentCents)} interest-free</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Terminal connection status
// ---------------------------------------------------------------------------

type TerminalStatus = "disconnected" | "connecting" | "connected";

interface TerminalSectionProps {
  onConnectTerminal: () => void;
  status: TerminalStatus;
}

function TerminalSection({ onConnectTerminal, status }: TerminalSectionProps) {
  const statusConfig: Record<
    TerminalStatus,
    { label: string; dotClass: string }
  > = {
    disconnected: {
      label: "No reader connected",
      dotClass: "bg-zinc-500",
    },
    connecting: {
      label: "Connecting…",
      dotClass: "bg-yellow-400 animate-pulse",
    },
    connected: {
      label: "Reader ready",
      dotClass: "bg-emerald-400",
    },
  };

  const { label, dotClass } = statusConfig[status];

  return (
    <div className="rounded-xl border border-zinc-700 bg-zinc-800/60 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-zinc-200">
          <DevicePhoneMobileIcon />
          <span>Stripe Terminal</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-zinc-400">
          <span className={`inline-block h-2 w-2 rounded-full ${dotClass}`} />
          {label}
        </div>
      </div>

      <p className="mb-3 text-xs text-zinc-400">
        Tap-to-Pay with M2 or WisePad 3 reader
      </p>

      <button
        type="button"
        onClick={onConnectTerminal}
        disabled={status === "connected"}
        aria-label={status === "connected" ? "Stripe Terminal reader connected" : "Connect Stripe Terminal reader"}
        className="w-full rounded-lg border border-zinc-600 bg-zinc-700 px-4 py-2.5 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-600 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {status === "connected" ? "Reader Connected ✓" : "Connect Reader"}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export interface PaymentOptionsProps {
  /** Invoice total in cents (integer). */
  totalCents: number;
  /** WorkOrder ID passed to the PaymentIntent API. */
  workOrderId: string;
  /** Human-readable quote / work-order title. */
  quoteTitle: string;
  /** Called when a payment completes successfully. */
  onPaymentSuccess?: (paymentIntentId: string) => void;
  /** Called when a payment fails. */
  onPaymentError?: (message: string) => void;
}

/**
 * PaymentOptions — displays available payment methods for a quote.
 *
 * Renders a card payment button, optional BNPL buttons (Affirm / Klarna) when
 * `totalCents >= 25_000`, and a Stripe Terminal section for Tap-to-Pay.
 */
export function PaymentOptions({
  totalCents,
  workOrderId,
  quoteTitle,
  onPaymentSuccess,
  onPaymentError,
}: PaymentOptionsProps) {
  const [isLoading, setIsLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [terminalStatus, setTerminalStatus] =
    useState<TerminalStatus>("disconnected");

  const showBnpl = totalCents >= BNPL_THRESHOLD_CENTS;

  // -------------------------------------------------------------------------
  // Initiate a payment via the PaymentIntent route
  // -------------------------------------------------------------------------

  async function handlePay(mode: "card" | "affirm" | "klarna" | "terminal") {
    setIsLoading(mode);
    setError(null);

    try {
      const res = await fetch("/api/stripe/payment-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workOrderId,
          terminalMode: mode === "terminal",
        }),
      });

      const data = (await res.json()) as {
        clientSecret?: string;
        paymentIntentId?: string;
        error?: string;
      };

      if (!res.ok || !data.clientSecret || !data.paymentIntentId) {
        throw new Error(data.error ?? "Failed to create payment intent");
      }

      const { clientSecret, paymentIntentId } = data;
      const appUrl =
        typeof window !== "undefined" ? window.location.origin : "";

      if (mode === "terminal") {
        // Terminal payments are handled by the SDK connected in handleConnectTerminal.
        // Surface the client secret so the terminal can collect and process.
        const terminalSdk = (
          window as Window & { __stripeTerminal?: { collectPaymentMethod: (s: string) => Promise<{ paymentIntent?: { id: string }; error?: { message: string } }>; processPayment: (pi: { id: string }) => Promise<{ paymentIntent?: { status: string; id: string }; error?: { message: string } }> } }
        ).__stripeTerminal;

        if (!terminalSdk) {
          throw new Error(
            "Stripe Terminal reader not connected. Please connect a reader first.",
          );
        }

        const collectResult = await terminalSdk.collectPaymentMethod(clientSecret);
        if (collectResult.error) {
          throw new Error(collectResult.error.message);
        }
        if (!collectResult.paymentIntent) {
          throw new Error("No payment intent returned from terminal.");
        }

        const processResult = await terminalSdk.processPayment(collectResult.paymentIntent);
        if (processResult.error) {
          throw new Error(processResult.error.message);
        }
        if (processResult.paymentIntent?.status === "requires_capture" ||
            processResult.paymentIntent?.status === "succeeded") {
          onPaymentSuccess?.(processResult.paymentIntent.id);
          return;
        }
        throw new Error("Terminal payment did not complete.");
      }

      // For online payments, attempt to load @stripe/stripe-js dynamically.
      // Using Function('return import(...)') avoids compile-time module resolution errors.
      type StripeConfirmResult = {
        paymentIntent?: { status: string; id: string };
        error?: { message: string };
      };
      type StripeJsInstance = {
        confirmCardPayment?: (
          s: string,
          opts?: object,
        ) => Promise<StripeConfirmResult>;
        confirmAffirmPayment?: (
          s: string,
          opts: object,
        ) => Promise<StripeConfirmResult>;
        confirmKlarnaPayment?: (
          s: string,
          opts: object,
        ) => Promise<StripeConfirmResult>;
      } | null;

      let stripeJs: StripeJsInstance = null;
      try {
        const stripeJsModuleName = "@stripe/stripe-js";
        // eslint-disable-next-line @typescript-eslint/no-implied-eval
        const mod = (await new Function(
          "m",
          "return import(m)",
        )(stripeJsModuleName)) as {
          loadStripe?: (key: string) => Promise<StripeJsInstance>;
        };
        const publishableKey =
          process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";
        if (mod.loadStripe && publishableKey) {
          stripeJs = await mod.loadStripe(publishableKey);
        }
      } catch {
        // @stripe/stripe-js not installed — fall back to redirect flow.
        stripeJs = null;
      }

      if (!stripeJs) {
        // Fallback: open a Stripe-hosted checkout session.
        const checkoutRes = await fetch("/api/stripe/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workOrderId }),
        });
        const checkoutData = (await checkoutRes.json()) as {
          url?: string;
          error?: string;
        };
        if (checkoutData.url) {
          window.location.href = checkoutData.url;
          return;
        }
        throw new Error(
          checkoutData.error ??
            "Stripe.js SDK not available. Please install @stripe/stripe-js.",
        );
      }

      let result: StripeConfirmResult | undefined;

      if (mode === "card") {
        result = await stripeJs.confirmCardPayment?.(clientSecret);
      } else if (mode === "affirm") {
        result = await stripeJs.confirmAffirmPayment?.(clientSecret, {
          return_url: `${appUrl}/quotes/${workOrderId}?payment=affirm`,
        });
      } else if (mode === "klarna") {
        result = await stripeJs.confirmKlarnaPayment?.(clientSecret, {
          return_url: `${appUrl}/quotes/${workOrderId}?payment=klarna`,
        });
      }

      if (result?.error) {
        throw new Error(result.error.message);
      }

      if (result?.paymentIntent?.status === "succeeded") {
        onPaymentSuccess?.(result.paymentIntent.id ?? paymentIntentId);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Payment failed";
      setError(message);
      onPaymentError?.(message);
    } finally {
      setIsLoading(null);
    }
  }

  async function handleConnectTerminal() {
    setTerminalStatus("connecting");
    setError(null);

    try {
      // Fetch a connection token from our API route.
      const tokenRes = await fetch("/api/stripe/terminal/connection-token", {
        method: "POST",
      });
      const tokenData = (await tokenRes.json()) as {
        secret?: string;
        error?: string;
      };

      if (!tokenRes.ok || !tokenData.secret) {
        throw new Error(
          tokenData.error ??
            "Stripe Terminal SDK not configured. Set STRIPE_TERMINAL_CONNECTION_TOKEN_URL in Settings → Integrations.",
        );
      }

      // Attempt to load the Stripe Terminal JS SDK dynamically.
      type TerminalReader = { id: string; label: string; device_type: string };
      type StripeTerminalInstance = {
        discoverReaders: (opts: {
          simulated?: boolean;
        }) => Promise<{ discoveredReaders?: TerminalReader[] }>;
        connectReader: (
          reader: TerminalReader,
        ) => Promise<{ reader?: object; error?: { message: string } }>;
      };
      type StripeTerminalFactory = {
        create: (opts: {
          onFetchConnectionToken: () => Promise<string>;
          onUnexpectedReaderDisconnect: () => void;
        }) => StripeTerminalInstance;
      };

      let StripeTerminal: StripeTerminalFactory | null = null;
      try {
        const terminalModuleName = "@stripe/terminal-js";
        // eslint-disable-next-line @typescript-eslint/no-implied-eval
        const mod = (await new Function(
          "m",
          "return import(m)",
        )(terminalModuleName)) as
          | { default?: StripeTerminalFactory }
          | StripeTerminalFactory;
        StripeTerminal =
          (mod as { default?: StripeTerminalFactory }).default ??
          (mod as StripeTerminalFactory);
      } catch {
        StripeTerminal = null;
      }

      if (!StripeTerminal) {
        throw new Error(
          "Stripe Terminal SDK not installed. Run: npm install @stripe/terminal-js",
        );
      }

      const connectionSecret = tokenData.secret;
      const terminal = StripeTerminal.create({
        onFetchConnectionToken: async () => connectionSecret,
        onUnexpectedReaderDisconnect: () => {
          setTerminalStatus("disconnected");
        },
      });

      const discoverResult = await terminal.discoverReaders({ simulated: false });
      const readers = discoverResult.discoveredReaders ?? [];

      if (readers.length === 0) {
        throw new Error(
          "No Stripe Terminal readers found. Ensure your reader is powered on and connected to the same network.",
        );
      }

      const connectResult = await terminal.connectReader(readers[0]);
      if (connectResult.error) {
        throw new Error(connectResult.error.message);
      }

      // Expose the terminal instance globally so handlePay can use it.
      (window as Window & { __stripeTerminal?: unknown }).__stripeTerminal = terminal;
      setTerminalStatus("connected");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to connect Stripe Terminal reader.";
      setError(message);
      setTerminalStatus("disconnected");
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-zinc-700 bg-zinc-900 p-5 shadow-lg">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <h3 className="text-base font-semibold text-zinc-100">{quoteTitle}</h3>
        <p className="text-sm text-zinc-400">
          Total:{" "}
          <span className="font-medium text-zinc-200">
            ${formatDollars(totalCents)}
          </span>
        </p>
      </div>

      {/* Financing badge */}
      {showBnpl && <FinancingBadge totalCents={totalCents} />}

      {/* Error message */}
      {error && (
        <p className="rounded-lg bg-red-900/40 px-3 py-2 text-sm text-red-400">
          {error}
        </p>
      )}

      {/* Card payment */}
      <button
        type="button"
        onClick={() => handlePay("card")}
        disabled={isLoading !== null}
        aria-label="Pay with credit or debit card"
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-md transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <CreditCardIcon />
        {isLoading === "card" ? "Processing…" : "Pay with Card"}
      </button>

      {/* BNPL buttons */}
      {showBnpl && (
        <div className="flex flex-col gap-2">
          <p className="text-center text-xs font-medium uppercase tracking-wide text-zinc-500">
            Pay Later
          </p>

          {/* Affirm */}
          <button
            type="button"
            onClick={() => handlePay("affirm")}
            disabled={isLoading !== null}
            aria-label={`Pay with Affirm — 4 interest-free payments of $${formatDollars(Math.ceil(totalCents / 4))}`}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-600 bg-zinc-800 px-4 py-3 text-sm font-semibold text-zinc-100 transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading === "affirm" ? (
              "Processing…"
            ) : (
              <>
                <span className="font-bold text-sky-300">Affirm</span>
                <span className="text-zinc-400 text-xs font-normal">
                  · 4 interest-free payments of ${formatDollars(Math.ceil(totalCents / 4))}
                </span>
              </>
            )}
          </button>

          {/* Klarna */}
          <button
            type="button"
            onClick={() => handlePay("klarna")}
            disabled={isLoading !== null}
            aria-label="Pay with Klarna — buy now, pay later"
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-600 bg-zinc-800 px-4 py-3 text-sm font-semibold text-zinc-100 transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading === "klarna" ? (
              "Processing…"
            ) : (
              <>
                <span className="font-bold text-pink-300">Klarna</span>
                <span className="text-zinc-400 text-xs font-normal">
                  · Buy now, pay later
                </span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Stripe Terminal */}
      <TerminalSection
        onConnectTerminal={handleConnectTerminal}
        status={terminalStatus}
      />
    </div>
  );
}
