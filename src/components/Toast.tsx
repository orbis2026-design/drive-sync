"use client";

import { useEffect, useState } from "react";

// ---------------------------------------------------------------------------
// Toast — lightweight, non-intrusive notification
// ---------------------------------------------------------------------------

interface ToastProps {
  message: string;
  /** When true, renders in error styling (red). Default is success (green). */
  variant?: "success" | "error";
  /** Duration in ms before auto-dismiss. Default 2500. */
  duration?: number;
  onDismiss: () => void;
}

export function Toast({
  message,
  variant = "success",
  duration = 2500,
  onDismiss,
}: ToastProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(onDismiss, 200);
    }, duration);
    return () => clearTimeout(timer);
  }, [duration, onDismiss]);

  return (
    <div
      role="status"
      aria-live="polite"
      className={[
        "fixed top-4 left-1/2 -translate-x-1/2 z-[9999]",
        "px-4 py-2 rounded-full text-sm font-bold shadow-xl",
        "transition-opacity duration-200",
        visible ? "opacity-100" : "opacity-0",
        variant === "error" ? "bg-red-600 text-white" : "bg-green-600 text-white",
      ].join(" ")}
    >
      {message}
    </div>
  );
}

// ---------------------------------------------------------------------------
// useToast — hook for managing toast state
// ---------------------------------------------------------------------------

interface ToastState {
  message: string;
  variant: "success" | "error";
}

export function useToast() {
  const [toast, setToast] = useState<ToastState | null>(null);

  function showToast(message: string, variant: "success" | "error" = "success") {
    setToast({ message, variant });
  }

  function dismissToast() {
    setToast(null);
  }

  const toastElement = toast ? (
    <Toast
      message={toast.message}
      variant={toast.variant}
      onDismiss={dismissToast}
    />
  ) : null;

  return { showToast, toastElement };
}
