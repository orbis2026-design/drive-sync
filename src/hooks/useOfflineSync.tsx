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
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { getPendingWorkOrders, markSynced } from "@/lib/offline-db";

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

  // Prevent concurrent sync runs
  const syncInProgress = useRef(false);

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
  // Sync pending changes → Server Actions
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

            // Dynamic import avoids bundling server-only code in the client chunk.
            // In production this would call the appropriate Server Action for each
            // field changed (e.g. updateWorkOrderNotes, updateWorkOrderStatus).
            const res = await fetch(`/api/work-orders/${wo.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(patch),
            });

            if (res.ok) {
              await markSynced(wo.id);
            }
          } catch {
            // Leave as unsynced; will retry on next sync cycle.
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
      setIsOnline(true);
    }
    function handleOffline() {
      setIsOnline(false);
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
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

  return { isOnline, pendingCount, isSyncing, sync };
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
