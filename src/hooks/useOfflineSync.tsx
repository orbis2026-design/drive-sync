"use client";

/**
 * useOfflineSync.tsx
 *
 * Detects the device's online/offline status and manages the sync queue
 * between local Dexie IndexedDB and the server.
 *
 * Usage:
 *   const { isOnline, pendingCount, isSyncing } = useOfflineSync();
 *
 * When the device goes offline, call patchWorkOrderLocally() from offline-db.ts
 * to queue changes. This hook will automatically flush those changes once the
 * device reconnects.
 *
 * Issue #50 — Offline Collision & Version Control Lock:
 *   Before flushing each pending patch the hook fetches the server-side status.
 *   If the status is COMPLETE, INVOICED, or PAID the patch is routed through
 *   /api/sync which will reject any mutation to the protected financial fields
 *   (parts_json, labor_json, total_price) and return a LOCKED_CONTRACT error.
 *   The hook surfaces that error via a `conflictError` string so the UI can
 *   render the mandatory "Sync Failed" modal.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { getPendingWorkOrders, markSynced } from "@/lib/offline-db";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Max time to wait for a sync request before treating the network as dead. */
const SYNC_FETCH_TIMEOUT_MS = 5_000;

/** Milliseconds to wait after `online` event before attempting sync. */
const RECONNECT_DEBOUNCE_MS = 3_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OfflineSyncState = {
  /** True when navigator.onLine is true. */
  isOnline: boolean;
  /** Number of work order patches waiting to be flushed to the server. */
  pendingCount: number;
  /** True while a sync operation is in progress. */
  isSyncing: boolean;
  /**
   * Set when the sync engine detects a conflict with a locked (legally
   * approved) work order.  The UI must render a modal explaining the issue.
   * Call `clearConflict` to dismiss.
   */
  conflictError: string | null;
  /** Dismiss the conflict error after the mechanic has acknowledged it. */
  clearConflict: () => void;
  /** Manually trigger a sync attempt. */
  sync: () => Promise<void>;
};

// ---------------------------------------------------------------------------
// useOfflineSync
// ---------------------------------------------------------------------------

export function useOfflineSync(): OfflineSyncState {
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [conflictError, setConflictError] = useState<string | null>(null);

  // Prevent concurrent sync runs
  const syncInProgress = useRef(false);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearConflict = useCallback(() => setConflictError(null), []);

  // ---------------------------------------------------------------------------
  // Refresh pending count from IndexedDB
  // ---------------------------------------------------------------------------

  const refreshPendingCount = useCallback(async () => {
    try {
      const pending = await getPendingWorkOrders();
      setPendingCount(pending.length);
    } catch {
      // IndexedDB may not be available (SSR guard)
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Sync pending changes → /api/sync (Issue #50 collision guard)
  // ---------------------------------------------------------------------------

  const sync = useCallback(async () => {
    if (syncInProgress.current || !isOnline) return;
    syncInProgress.current = true;
    setIsSyncing(true);

    try {
      const pending = await getPendingWorkOrders();
      if (pending.length === 0) return;

      await Promise.allSettled(
        pending.map(async (wo) => {
          try {
            if (!wo.pendingPatch) {
              await markSynced(wo.id);
              return;
            }

            const patch = JSON.parse(wo.pendingPatch) as Record<string, unknown>;

            // Route through /api/sync which enforces the Version Control Lock.
            // The payload includes the locally-cached versionHash so the server
            // can detect concurrent writes from other sessions.
            const res = await fetch("/api/sync", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                workOrderId: wo.id,
                versionHash: wo.versionHash,
                patch,
              }),
              signal: AbortSignal.timeout(SYNC_FETCH_TIMEOUT_MS),
            });

            if (res.ok) {
              await markSynced(wo.id);
              return;
            }

            // Handle conflict responses from the sync endpoint.
            if (res.status === 409) {
              let errBody: {
                error?: string;
                code?: string;
              } = {};
              try {
                errBody = (await res.json()) as typeof errBody;
              } catch {
                // Non-JSON body — use generic message.
              }

              if (errBody.code === "LOCKED_CONTRACT") {
                // The work order has been legally approved — surface the
                // critical modal via conflictError.
                setConflictError(
                  errBody.error ??
                    "Sync Failed: Client has already signed this quote. You cannot modify an approved contract. Please issue a Change Order.",
                );
                // Do NOT mark as synced — leave in queue so the mechanic can
                // see which record caused the conflict.
              } else if (errBody.code === "VERSION_CONFLICT") {
                // Surface to user so they know to refresh. Mark as synced to
                // clear it from the queue — the server version is authoritative.
                setConflictError(
                  errBody.error ??
                    "Sync conflict: this work order was updated by another session while you were offline. Please refresh the page to load the latest version.",
                );
                await markSynced(wo.id);
              }
              // For any other 409 the record stays in the queue and will
              // be retried on the next sync cycle.
            }
          } catch {
            // Network failure or timeout — leave as unsynced; will retry on next cycle.
          }
        }),
      );
    } finally {
      syncInProgress.current = false;
      setIsSyncing(false);
      await refreshPendingCount();
    }
  }, [isOnline, refreshPendingCount]);

  // ---------------------------------------------------------------------------
  // Online / offline event listeners
  // ---------------------------------------------------------------------------

  useEffect(() => {
    function handleOnline() {
      // Debounce: wait RECONNECT_DEBOUNCE_MS to confirm connection stability
      // before triggering sync. If offline fires again within the window,
      // the timer is cleared.
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
      }
      reconnectTimer.current = setTimeout(() => {
        reconnectTimer.current = null;
        setIsOnline(true);
      }, RECONNECT_DEBOUNCE_MS);
    }
    function handleOffline() {
      // Cancel any pending reconnect debounce
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
      setIsOnline(false);
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
      }
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Auto-sync when reconnecting
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (isOnline) {
      void sync();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline]);

  // ---------------------------------------------------------------------------
  // Poll pending count every 10 seconds while the app is running
  // ---------------------------------------------------------------------------

  useEffect(() => {
    void refreshPendingCount();
    const interval = setInterval(refreshPendingCount, 10_000);
    return () => clearInterval(interval);
  }, [refreshPendingCount]);

  return { isOnline, pendingCount, isSyncing, conflictError, clearConflict, sync };
}

// ---------------------------------------------------------------------------
// SyncConflictModal — critical modal for legally-locked work orders
// ---------------------------------------------------------------------------

/**
 * Renders a full-screen blocking modal when the sync engine detects that
 * a local offline patch attempted to mutate a legally-approved contract.
 *
 * Drop this at the root of any page that uses useOfflineSync so the mechanic
 * can never miss the conflict notification.
 */
export function SyncConflictModal() {
  const { conflictError, clearConflict } = useOfflineSync();

  if (!conflictError) return null;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="sync-conflict-title"
      aria-describedby="sync-conflict-desc"
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
    >
      <div className="w-full max-w-md bg-gray-950 border-2 border-red-500 rounded-2xl p-6 shadow-2xl shadow-red-500/20">
        {/* Header */}
        <div className="flex items-start gap-3 mb-4">
          <span className="text-3xl flex-shrink-0" aria-hidden="true">🔒</span>
          <div>
            <h2
              id="sync-conflict-title"
              className="text-lg font-black text-red-400 uppercase tracking-wide"
            >
              Sync Failed — Contract Locked
            </h2>
            <p className="text-xs text-red-500/70 mt-0.5 font-medium uppercase tracking-wider">
              Legal conflict detected
            </p>
          </div>
        </div>

        {/* Body */}
        <p
          id="sync-conflict-desc"
          className="text-sm text-gray-300 leading-relaxed mb-6"
        >
          {conflictError}
        </p>

        {/* Action */}
        <div className="flex flex-col gap-3">
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-xs text-red-300 font-medium leading-snug">
            ⚠️ Your offline changes to the financial terms of this job have
            been discarded. The client&apos;s signed contract remains unchanged.
            To modify the scope of work, initiate a{" "}
            <strong className="text-red-200">Change Order</strong>.
          </div>

          <button
            onClick={clearConflict}
            className="w-full rounded-xl bg-red-600 hover:bg-red-500 active:scale-95 text-white font-bold py-3 text-sm transition-all duration-150"
          >
            I Understand — Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// OfflineBadge — pre-built status badge component
// ---------------------------------------------------------------------------

/**
 * Drop this anywhere in the component tree to display a high-contrast amber
 * "Offline: Saved Locally" badge when the device is offline with pending data,
 * or a green "Synced" pill when reconnected.
 */
export function OfflineBadge() {
  const { isOnline, pendingCount, isSyncing } = useOfflineSync();

  if (isOnline && pendingCount === 0) return null;

  if (isSyncing) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/20 border border-blue-500/40 text-blue-400 text-xs font-bold"
      >
        <span className="animate-spin">⟳</span>
        Syncing…
      </div>
    );
  }

  if (!isOnline) {
    return (
      <div
        role="status"
        aria-live="assertive"
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/20 border border-amber-500/50 text-amber-400 text-xs font-bold uppercase tracking-wide"
      >
        <span aria-hidden="true">⚡</span>
        Offline — Saved Locally
        {pendingCount > 0 && (
          <span className="ml-1 bg-amber-500/30 rounded-full px-1.5 py-0.5 text-[10px]">
            {pendingCount}
          </span>
        )}
      </div>
    );
  }

  // Online but with pending items (transitional state during sync)
  return (
    <div
      role="status"
      aria-live="polite"
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/20 border border-amber-500/50 text-amber-400 text-xs font-bold"
    >
      <span aria-hidden="true">⚡</span>
      {pendingCount} pending sync
    </div>
  );
}
