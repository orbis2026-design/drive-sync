"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center py-24 px-6 text-center">
      <div className="w-16 h-16 rounded-full bg-gray-900 border border-gray-800 flex items-center justify-center mb-5">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="#f59e0b"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-8 h-8"
          aria-hidden="true"
        >
          <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
        </svg>
      </div>

      <h2 className="text-xl font-black text-white mb-2">
        Something went wrong.
      </h2>
      <p className="text-gray-400 text-sm max-w-xs leading-relaxed mb-1">
        An unexpected error occurred. The error has been logged and our team is
        on it.
      </p>
      {error.digest && (
        <p className="text-gray-700 font-mono text-xs mb-4">
          Error ID: {error.digest}
        </p>
      )}

      <button
        onClick={reset}
        className="mt-6 bg-white text-black font-bold rounded-2xl px-6 py-3 text-sm hover:bg-gray-100 transition-colors"
      >
        Try Again
      </button>
    </div>
  );
}
