"use client";
/**
 * On-device database (IndexedDB).
 *
 * This is the source of truth while there is no network. A sale exists here
 * the instant the staff hits Save - before any request is attempted - so
 * losing signal, force-quitting the app, or the battery dying cannot lose it.
 *
 * Stores
 *   outbox      operations waiting to reach the server (keyed by clientId)
 *   quarantine  operations the server permanently refused - kept for a human
 *   ledger      this device's own record of its sales, readable offline
 *   cache       menu / settings snapshots so the app opens cold with no network
 *   meta        sync bookkeeping (last sync, device id, clock skew)
 *
 * The service worker reads `outbox` directly too, so keep the shape boring.
 */
import { openDB, type DBSchema, type IDBPDatabase } from "idb";

export const DB_NAME = "bm-offline";
export const DB_VERSION = 1;

export type OpKind = "sale" | "note" | "expense";

export type OutboxRecord = {
  clientId: string;
  kind: OpKind;
  payload: unknown;
  createdAt: number;
  attempts: number;
  /** Epoch ms; the sync engine skips records until this time (backoff). */
  nextAttemptAt: number;
  lastError?: string;
  /** Human label for the pending-items list. */
  summary: string;
};

export type QuarantineRecord = OutboxRecord & {
  reason: string;
  rejectedAt: number;
};

export type LedgerLine = {
  menuItemId: string | null;
  name: string;
  emoji: string;
  categoryName?: string | null;
  qty: number;
  unitPriceCents: number;
  unitCostCents: number;
};

export type LedgerRecord = {
  clientId: string;
  soldAt: string;
  businessDate: string;
  totalCents: number;
  costCents: number;
  discountCents: number;
  itemCount: number;
  paymentMethod: string;
  tableLabel?: string | null;
  customerNote?: string | null;
  lines: LedgerLine[];
  status: "pending" | "synced" | "rejected";
  staffName: string;
  /**
   * Who recorded it. Absent on rows written before this field existed, which
   * readers treat as "mine" rather than hiding history that is probably theirs.
   */
  staffId?: string;
  syncedAt?: number;
};

export type CacheRecord = { key: string; data: unknown; at: number };
export type MetaRecord = { key: string; value: unknown };

interface BMSchema extends DBSchema {
  outbox: {
    key: string;
    value: OutboxRecord;
    indexes: { by_createdAt: number; by_next: number };
  };
  quarantine: { key: string; value: QuarantineRecord; indexes: { by_rejectedAt: number } };
  ledger: {
    key: string;
    value: LedgerRecord;
    indexes: { by_businessDate: string; by_status: string };
  };
  cache: { key: string; value: CacheRecord };
  meta: { key: string; value: MetaRecord };
}

let dbPromise: Promise<IDBPDatabase<BMSchema>> | null = null;

export function getDB() {
  if (typeof indexedDB === "undefined") {
    throw new Error("IndexedDB unavailable (server or unsupported browser).");
  }
  dbPromise ??= openDB<BMSchema>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("outbox")) {
        const s = db.createObjectStore("outbox", { keyPath: "clientId" });
        s.createIndex("by_createdAt", "createdAt");
        s.createIndex("by_next", "nextAttemptAt");
      }
      if (!db.objectStoreNames.contains("quarantine")) {
        const s = db.createObjectStore("quarantine", { keyPath: "clientId" });
        s.createIndex("by_rejectedAt", "rejectedAt");
      }
      if (!db.objectStoreNames.contains("ledger")) {
        const s = db.createObjectStore("ledger", { keyPath: "clientId" });
        s.createIndex("by_businessDate", "businessDate");
        s.createIndex("by_status", "status");
      }
      if (!db.objectStoreNames.contains("cache")) {
        db.createObjectStore("cache", { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta", { keyPath: "key" });
      }
    },
    blocked() {
      console.warn("[offline-db] upgrade blocked by another open tab");
    },
  });
  return dbPromise;
}

/* -------------------------------------------------------------- cache & meta */

export async function cacheSet(key: string, data: unknown) {
  const db = await getDB();
  await db.put("cache", { key, data, at: Date.now() });
}

export async function cacheGet<T>(key: string): Promise<{ data: T; at: number } | null> {
  const db = await getDB();
  const row = await db.get("cache", key);
  return row ? { data: row.data as T, at: row.at } : null;
}

export async function metaSet(key: string, value: unknown) {
  const db = await getDB();
  await db.put("meta", { key, value });
}

export async function metaGet<T>(key: string): Promise<T | null> {
  const db = await getDB();
  const row = await db.get("meta", key);
  return row ? (row.value as T) : null;
}

/** Stable per-install id, so admins can tell two staff phones apart. */
export async function getDeviceId(): Promise<string> {
  const existing = await metaGet<string>("deviceId");
  if (existing) return existing;
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `dev_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  await metaSet("deviceId", id);
  return id;
}

/** Drop synced ledger rows older than `days` so storage stays bounded. */
export async function pruneLedger(days = 30) {
  const db = await getDB();
  const cutoff = Date.now() - days * 86_400_000;
  const tx = db.transaction("ledger", "readwrite");
  let cursor = await tx.store.openCursor();
  while (cursor) {
    const r = cursor.value;
    if (r.status === "synced" && (r.syncedAt ?? 0) < cutoff) await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
}
