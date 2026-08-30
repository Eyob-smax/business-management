"use client";
/**
 * The sync engine.
 *
 * A single instance per tab. It drains the outbox whenever there is any reason
 * to believe it might succeed: the browser came online, the app regained
 * focus, a new op was queued, a timer fired, or the service worker woke up in
 * the background. Concurrent runs are impossible by construction (`running`),
 * and every op is idempotent server-side, so an over-eager trigger is free.
 */
import {
  dueRecords,
  markDone,
  markRetry,
  markRejected,
  pendingCount,
  quarantineCount,
  ledgerSetStatus,
} from "./outbox";
import { getDeviceId, metaGet, metaSet } from "./db";

export type SyncStatus = {
  online: boolean;
  syncing: boolean;
  /** Ops still waiting to reach the server. */
  pending: number;
  /** Ops the server refused; a human needs to look at them. */
  quarantined: number;
  lastSyncAt: number | null;
  lastError: string | null;
  /** Set when the session cookie expired - the UI prompts a re-login. */
  needsAuth: boolean;
  /**
   * An admin has paused this person's ability to record. The queue is kept
   * untouched and keeps retrying quietly, because access is usually restored.
   */
  writeBlocked: boolean;
  blockedMessage: string | null;
};

type Listener = (s: SyncStatus) => void;

const CHANNEL = "bm-sync";
const BATCH = 100;

let status: SyncStatus = {
  online: typeof navigator === "undefined" ? true : navigator.onLine,
  syncing: false,
  pending: 0,
  quarantined: 0,
  lastSyncAt: null,
  lastError: null,
  needsAuth: false,
  writeBlocked: false,
  blockedMessage: null,
};

const listeners = new Set<Listener>();
let running = false;
let started = false;
let timer: ReturnType<typeof setInterval> | null = null;
let channel: BroadcastChannel | null = null;

function emit(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch };
  for (const l of listeners) l(status);
}

export function getStatus() {
  return status;
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  listener(status);
  return () => listeners.delete(listener);
}

async function refreshCounts() {
  try {
    const [pending, quarantined] = await Promise.all([pendingCount(), quarantineCount()]);
    emit({ pending, quarantined });
  } catch {
    /* IndexedDB not ready yet - counts refresh on the next tick. */
  }
}

/* ------------------------------------------------------------------- draining */

type OpResult = {
  clientId: string;
  kind: string;
  verdict: "applied" | "duplicate" | "retry" | "rejected";
  reason?: string;
};

/**
 * Push everything currently due. Returns the number of ops confirmed.
 * Never throws - a failed sync is a normal state, not an error path.
 */
export async function syncNow(reason = "manual"): Promise<number> {
  if (running) return 0;
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    emit({ online: false });
    await refreshCounts();
    return 0;
  }

  running = true;
  emit({ syncing: true, lastError: null });
  let confirmed = 0;

  try {
    const deviceId = await getDeviceId();

    // Keep going while there is more due work, so one call drains a big queue.
    for (let round = 0; round < 20; round++) {
      const batch = await dueRecords(BATCH);
      if (batch.length === 0) break;

      const body = JSON.stringify({
        deviceId,
        clientTime: new Date().toISOString(),
        ops: batch.map((r) => ({
          kind: r.kind,
          clientId: r.clientId,
          payload: r.payload,
        })),
      });

      let res: Response;
      try {
        res = await fetch("/api/sync", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body,
          credentials: "same-origin",
          // Sync must not be served from the HTTP cache, ever.
          cache: "no-store",
        });
      } catch (err) {
        // Network died mid-flight. The ops are still queued; back them off.
        const msg = err instanceof Error ? err.message : "network error";
        await Promise.all(batch.map((r) => markRetry(r.clientId, msg)));
        emit({ lastError: "Offline - will retry automatically", online: navigator.onLine });
        break;
      }

      if (res.status === 401) {
        emit({ needsAuth: true, lastError: "Signed out - please sign in again" });
        break;
      }

      if (res.status === 403) {
        // Access was changed while work was queued. Hold everything, back it
        // off so we are not hammering, and say so plainly - the records are
        // still here and will go through the moment access returns.
        let message = "An admin has paused your ability to record.";
        try {
          const detail = (await res.json()) as { message?: string };
          if (detail?.message) message = detail.message;
        } catch {
          /* keep the default wording */
        }
        await Promise.all(batch.map((r) => markRetry(r.clientId, message)));
        emit({ writeBlocked: true, blockedMessage: message, lastError: message });
        break;
      }

      if (!res.ok) {
        const msg = `Server error ${res.status}`;
        await Promise.all(batch.map((r) => markRetry(r.clientId, msg)));
        emit({ lastError: msg });
        break;
      }

      const json = (await res.json()) as { results?: OpResult[]; serverTime?: string };
      const results = json.results ?? [];

      // Anything the server did not mention stays queued for the next round.
      for (const r of results) {
        if (r.verdict === "applied" || r.verdict === "duplicate") {
          await markDone(r.clientId);
          await ledgerSetStatus(r.clientId, "synced").catch(() => {});
          confirmed++;
        } else if (r.verdict === "rejected") {
          await markRejected(r.clientId, r.reason ?? "Rejected by server");
          await ledgerSetStatus(r.clientId, "rejected").catch(() => {});
        } else {
          await markRetry(r.clientId, r.reason ?? "Retry");
        }
      }

      if (json.serverTime) {
        const skew = Date.now() - Date.parse(json.serverTime);
        if (Math.abs(skew) > 120_000) await metaSet("clockSkewMs", skew);
      }

      emit({
        needsAuth: false,
        writeBlocked: false,
        blockedMessage: null,
        lastSyncAt: Date.now(),
      });
      await metaSet("lastSyncAt", Date.now());

      if (batch.length < BATCH) break;
    }
  } finally {
    running = false;
    emit({ syncing: false });
    await refreshCounts();
    if (confirmed > 0) channel?.postMessage({ type: "synced", confirmed, reason });
  }

  return confirmed;
}

/** Ask the browser to finish the job even if the app gets closed. */
export async function registerBackgroundSync() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    const reg = (await navigator.serviceWorker.ready) as ServiceWorkerRegistration & {
      sync?: { register: (tag: string) => Promise<void> };
    };
    await reg.sync?.register("bm-outbox-sync");
  } catch {
    // Background Sync is Chromium-only; the in-app triggers cover the rest.
  }
}

/** Queue an op and immediately try to flush it. */
export async function kick(reason = "enqueue") {
  await refreshCounts();
  void registerBackgroundSync();
  return syncNow(reason);
}

/* ------------------------------------------------------------------ lifecycle */

export function startSyncEngine() {
  if (started || typeof window === "undefined") return () => {};
  started = true;

  const onOnline = () => {
    emit({ online: true });
    void syncNow("online");
  };
  const onOffline = () => emit({ online: false });
  const onVisible = () => {
    if (document.visibilityState === "visible") void syncNow("visible");
  };

  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  document.addEventListener("visibilitychange", onVisible);

  // Steady heartbeat: cheap when the queue is empty (one IndexedDB count).
  timer = setInterval(() => {
    if (status.pending > 0) void syncNow("interval");
    else void refreshCounts();
  }, 20_000);

  if ("BroadcastChannel" in window) {
    channel = new BroadcastChannel(CHANNEL);
    channel.onmessage = (e) => {
      if (e.data?.type === "enqueued") void syncNow("other-tab");
      if (e.data?.type === "synced") void refreshCounts();
    };
  }

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", (e: MessageEvent) => {
      if (e.data?.type === "sw-sync-complete") void refreshCounts();
      if (e.data?.type === "sw-request-sync") void syncNow("sw");
    });
  }

  void metaGet<number>("lastSyncAt").then((v) => v && emit({ lastSyncAt: v }));
  void refreshCounts();
  void syncNow("startup");

  return () => {
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
    document.removeEventListener("visibilitychange", onVisible);
    if (timer) clearInterval(timer);
    channel?.close();
    channel = null;
    started = false;
  };
}

/** Tell other tabs new work exists. */
export function announceEnqueued() {
  channel?.postMessage({ type: "enqueued" });
}
