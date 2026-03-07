/**
 * offline-db.ts — Dexie.js IndexedDB schema for offline-first support.
 *
 * Mirrors the active WorkOrders and TenantVehicles from the server so the
 * mechanic can continue logging repairs with zero cellular service. Changes
 * are queued here and flushed to Supabase via Server Actions when the device
 * reconnects (managed by the useOfflineSync hook).
 */

import Dexie, { type Table } from "dexie";

// ---------------------------------------------------------------------------
// Types — mirror the server-side Prisma models
// ---------------------------------------------------------------------------

export type OfflineWorkOrderStatus =
  | "INTAKE"
  | "ACTIVE"
  | "PENDING_APPROVAL"
  | "COMPLETE"
  | "INVOICED"
  | "PAID";

/** A locally-stored work order with sync metadata. */
export interface OfflineWorkOrder {
  /** Matches server WorkOrder.id (cuid). */
  id: string;
  tenantId: string;
  clientId: string;
  vehicleId: string;
  status: OfflineWorkOrderStatus;
  title: string;
  description: string;
  notes?: string;
  laborCents: number;
  partsCents: number;
  /** Epoch ms of last local modification. */
  updatedAt: number;
  /** 1 once this record has been successfully synced to the server, 0 if pending. */
  synced: 0 | 1;
  /** JSON-serialised partial update payload waiting to be flushed. */
  pendingPatch?: string;
}

/** A locally-cached vehicle row. */
export interface OfflineTenantVehicle {
  id: string;
  tenantId: string;
  clientId: string;
  make: string;
  model: string;
  year: number;
  mileageIn?: number;
  oilType?: string;
  tireSize?: string;
  /** Epoch ms of last cache refresh. */
  cachedAt: number;
}

// ---------------------------------------------------------------------------
// DriveSyncDB — Dexie database class
// ---------------------------------------------------------------------------

class DriveSyncDB extends Dexie {
  workOrders!: Table<OfflineWorkOrder, string>;
  vehicles!: Table<OfflineTenantVehicle, string>;

  constructor() {
    super("DriveSyncOffline");

    this.version(1).stores({
      /**
       * Indexed fields: id (primary key), tenantId, status, synced.
       * The `synced` field is stored as 0/1 for Dexie boolean indexing.
       */
      workOrders: "id, tenantId, status, synced",
      vehicles: "id, tenantId, clientId",
    });
  }
}

// Singleton exported for use throughout the app.
export const db = new DriveSyncDB();

// ---------------------------------------------------------------------------
// Helper utilities
// ---------------------------------------------------------------------------

/**
 * Upsert a work order into the local IndexedDB cache.
 * Call this whenever the server returns fresh data so the offline store stays
 * current.
 */
export async function cacheWorkOrder(
  wo: Omit<OfflineWorkOrder, "synced" | "pendingPatch">,
): Promise<void> {
  await db.workOrders.put({ ...wo, synced: 1 });
}

/**
 * Record a local modification to a work order. Marks the record as unsynced
 * and stores the partial patch for later flushing.
 */
export async function patchWorkOrderLocally(
  id: string,
  patch: Partial<
    Pick<
      OfflineWorkOrder,
      "status" | "notes" | "laborCents" | "partsCents" | "description"
    >
  >,
): Promise<void> {
  const existing = await db.workOrders.get(id);
  const merged = existing
    ? { ...existing, ...patch }
    : { id, ...patch, synced: 0 as const };

  await db.workOrders.put({
    ...(merged as OfflineWorkOrder),
    updatedAt: Date.now(),
    synced: 0,
    pendingPatch: JSON.stringify(patch),
  });
}

/**
 * Return all work orders that have not yet been synced to the server.
 */
export async function getPendingWorkOrders(): Promise<OfflineWorkOrder[]> {
  // Dexie stores booleans as 0/1 in IndexedDB indices.
  return db.workOrders.where("synced").equals(0).toArray();
}

/**
 * Mark a work order as successfully synced.
 */
export async function markSynced(id: string): Promise<void> {
  await db.workOrders.update(id, { synced: 1, pendingPatch: undefined });
}

/**
 * Upsert a vehicle into the local cache.
 */
export async function cacheVehicle(
  vehicle: OfflineTenantVehicle,
): Promise<void> {
  await db.vehicles.put(vehicle);
}
