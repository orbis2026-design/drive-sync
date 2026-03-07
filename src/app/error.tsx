"use client";

// error.tsx is rendered by Next.js for segment-level errors (inside layouts).

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function ErrorPage({
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
    reset();
  }

  return (
    <div className="min-h-[100dvh] bg-gray-950 flex flex-col items-center justify-center px-6 py-12 text-center">
      {/* Icon */}
      <div className="w-20 h-20 rounded-full bg-gray-900 border border-gray-800 flex items-center justify-center mb-6">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="#f59e0b"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-10 h-10"
          aria-hidden="true"
        >
          <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
        </svg>
      </div>

      <h1 className="text-2xl font-black text-white mb-2">
        Whoops, we dropped a wrench.
      </h1>
      <p className="text-gray-400 text-sm max-w-xs leading-relaxed mb-1">
        Something broke unexpectedly. The error has been logged and our team
        is on it.
      </p>
      {error.digest && (
        <p className="text-gray-700 font-mono text-xs mb-6">
          Error ID: {error.digest}
        </p>
      )}

      <div className="flex gap-3 mt-6 flex-wrap justify-center">
        <button
          onClick={reset}
          className="bg-white text-black font-bold rounded-2xl px-6 py-3 text-sm hover:bg-gray-100 transition-colors"
        >
          Reload App
        </button>
        <button
          onClick={handleClearCache}
          className="border border-gray-700 text-gray-400 font-semibold rounded-2xl px-6 py-3 text-sm hover:border-gray-600 transition-colors"
        >
          Clear Cache
        </button>
      </div>
    </div>
  );
}
