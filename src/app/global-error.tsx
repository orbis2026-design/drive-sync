"use client";

// global-error.tsx is rendered by Next.js when the root layout itself throws.
// It receives the error and a reset function so users can recover.

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  function handleClearCache() {
    if ("caches" in window) {
      caches.keys().then((names) => {
        names.forEach((name) => caches.delete(name));
      });
    }
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((reg) => reg.unregister());
      });
    }
    reset();
  }

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          backgroundColor: "#09090b",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          padding: "1.5rem",
          textAlign: "center",
        }}
      >
        {/* Wrench icon */}
        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: "50%",
            backgroundColor: "#1c1c1e",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: "1.5rem",
            border: "1px solid #27272a",
          }}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="#f59e0b"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            width="40"
            height="40"
            aria-hidden="true"
          >
            <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
          </svg>
        </div>

        <h1
          style={{
            color: "#ffffff",
            fontSize: "1.5rem",
            fontWeight: 900,
            marginBottom: "0.5rem",
          }}
        >
          We dropped a wrench.
        </h1>
        <p
          style={{
            color: "#71717a",
            fontSize: "0.875rem",
            maxWidth: 320,
            lineHeight: 1.6,
            marginBottom: "2rem",
          }}
        >
          Something unexpected broke under the hood. The error has been logged
          and our team will investigate.
          {error.digest && (
            <span
              style={{
                display: "block",
                marginTop: "0.5rem",
                fontFamily: "monospace",
                fontSize: "0.75rem",
                color: "#52525b",
              }}
            >
              Error ID: {error.digest}
            </span>
          )}
        </p>

        <div
          style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", justifyContent: "center" }}
        >
          <button
            onClick={reset}
            style={{
              backgroundColor: "#ffffff",
              color: "#09090b",
              border: "none",
              borderRadius: 16,
              padding: "0.75rem 1.5rem",
              fontSize: "0.875rem",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Reload App
          </button>
          <button
            onClick={handleClearCache}
            style={{
              backgroundColor: "transparent",
              color: "#a1a1aa",
              border: "1px solid #27272a",
              borderRadius: 16,
              padding: "0.75rem 1.5rem",
              fontSize: "0.875rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Clear Cache
          </button>
        </div>
      </body>
    </html>
  );
}
