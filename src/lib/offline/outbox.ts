"use client";
/**
 * The outbox: append-only queue of work the device owes the server.
 *
 * Rule that everything else depends on - nothing leaves this queue until the
 * server has confirmed it, either as `applied` or as `duplicate`.
 */
import {
  getDB,
  type OpKind,
  type OutboxRecord,
  type QuarantineRecord,
  type LedgerRecord,
} from "./db";
import { newId } from "../utils";

/** Exponential-ish backoff, capped so a long outage still retries every 5 min. */
const BACKOFF_MS = [0, 2_000, 6_000, 15_000, 45_000, 120_000, 300_000];

export const backoffFor = (attempts: number) =>
  BACKOFF_MS[Math.min(attempts, BACKOFF_MS.length - 1)];

export async function enqueue(
  kind: OpKind,
  payload: unknown,
  summary: string,
  clientId = newId(),
): Promise<OutboxRecord> {
  const db = await getDB();
  const record: OutboxRecord = {
    clientId,
    kind,
    payload,
    summary,
    createdAt: Date.now(),
    attempts: 0,
    nextAttemptAt: 0,
  };
  await db.put("outbox", record);
  return record;
}

/** Records due for an attempt now, oldest first. */
export async function dueRecords(limit = 100): Promise<OutboxRecord[]> {
  const db = await getDB();
  const all = await db.getAllFromIndex("outbox", "by_createdAt");
  const now = Date.now();
  return all.filter((r) => r.nextAttemptAt <= now).slice(0, limit);
}

export async function allPending(): Promise<OutboxRecord[]> {
  const db = await getDB();
  return db.getAllFromIndex("outbox", "by_createdAt");
}

export async function pendingCount(): Promise<number> {
  const db = await getDB();
  return db.count("outbox");
}

export async function quarantineCount(): Promise<number> {
  const db = await getDB();
  return db.count("quarantine");
}

export async function listQuarantine(): Promise<QuarantineRecord[]> {
  const db = await getDB();
  const rows = await db.getAllFromIndex("quarantine", "by_rejectedAt");
  return rows.reverse();
}

/** Server confirmed it (applied or duplicate) - safe to forget. */
export async function markDone(clientId: string) {
  const db = await getDB();
  await db.delete("outbox", clientId);
}

/** Transient failure - keep it, but wait before trying again. */
export async function markRetry(clientId: string, error: string) {
  const db = await getDB();
  const rec = await db.get("outbox", clientId);
  if (!rec) return;
  const attempts = rec.attempts + 1;
  await db.put("outbox", {
    ...rec,
    attempts,
    lastError: error,
    nextAttemptAt: Date.now() + backoffFor(attempts),
  });
}

/**
 * Server said this will never apply. Move it out of the queue but NEVER delete
 * it - it lands in quarantine where the UI can show it to a human.
 */
export async function markRejected(clientId: string, reason: string) {
  const db = await getDB();
  const rec = await db.get("outbox", clientId);
  if (!rec) return;
  const tx = db.transaction(["outbox", "quarantine"], "readwrite");
  await tx.objectStore("quarantine").put({ ...rec, reason, rejectedAt: Date.now() });
  await tx.objectStore("outbox").delete(clientId);
  await tx.done;
}

/** Put a quarantined op back in the queue after a human fixed the cause. */
export async function requeueQuarantined(clientId: string) {
  const db = await getDB();
  const rec = await db.get("quarantine", clientId);
  if (!rec) return;
  const tx = db.transaction(["outbox", "quarantine"], "readwrite");
  await tx
    .objectStore("outbox")
    .put({ ...rec, attempts: 0, nextAttemptAt: 0, lastError: undefined });
  await tx.objectStore("quarantine").delete(clientId);
  await tx.done;
}

export async function discardQuarantined(clientId: string) {
  const db = await getDB();
  await db.delete("quarantine", clientId);
}

/* ---------------------------------------------------------------- the ledger */

/** Record the sale in this device's own ledger, so it is visible offline. */
export async function ledgerPut(record: LedgerRecord) {
  const db = await getDB();
  await db.put("ledger", record);
}

export async function ledgerSetStatus(
  clientId: string,
  status: LedgerRecord["status"],
) {
  const db = await getDB();
  const rec = await db.get("ledger", clientId);
  if (!rec) return;
  await db.put("ledger", {
    ...rec,
    status,
    syncedAt: status === "synced" ? Date.now() : rec.syncedAt,
  });
}

export async function ledgerForDate(businessDate: string): Promise<LedgerRecord[]> {
  const db = await getDB();
  const rows = await db.getAllFromIndex("ledger", "by_businessDate", businessDate);
  return rows.sort((a, b) => b.soldAt.localeCompare(a.soldAt));
}

export async function ledgerRecent(limit = 50): Promise<LedgerRecord[]> {
  const db = await getDB();
  const rows = await db.getAll("ledger");
  return rows.sort((a, b) => b.soldAt.localeCompare(a.soldAt)).slice(0, limit);
}

export async function ledgerDelete(clientId: string) {
  const db = await getDB();
  await db.delete("ledger", clientId);
}
