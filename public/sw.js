/* eslint-disable no-restricted-globals */
/**
 * Service worker.
 *
 * Three jobs:
 *   1. Keep the app openable with no network (app-shell + runtime caches).
 *   2. Show push notifications so admins hear about sales with the app closed.
 *   3. Drain the IndexedDB outbox in the background, even after the app is
 *      closed, via the Background Sync API.
 *
 * Job 3 means this file talks to IndexedDB directly rather than through the
 * app's helpers - so the store names and record shape here must stay in step
 * with src/lib/offline/db.ts.
 */

const VERSION = "v1";
const SHELL_CACHE = `bm-shell-${VERSION}`;
const PAGE_CACHE = `bm-pages-${VERSION}`;
const ASSET_CACHE = `bm-assets-${VERSION}`;
const DATA_CACHE = `bm-data-${VERSION}`;

const OFFLINE_URL = "/offline";

/** Minimal set that must be available cold, with no network at all. */
const SHELL_URLS = [
  OFFLINE_URL,
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

/* ------------------------------------------------------------------ install */

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // Individually, so one 404 cannot abort the whole install.
      await Promise.all(
        SHELL_URLS.map((url) =>
          cache.add(new Request(url, { cache: "reload" })).catch(() => {}),
        ),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL_CACHE, PAGE_CACHE, ASSET_CACHE, DATA_CACHE]);
      for (const key of await caches.keys()) {
        if (key.startsWith("bm-") && !keep.has(key)) await caches.delete(key);
      }
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.disable();
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
  if (event.data?.type === "SYNC_NOW") event.waitUntil(drainOutbox("message"));
});

/* -------------------------------------------------------------------- fetch */

/** Never let a cached response outlive its usefulness by more than this. */
const DATA_MAX_AGE_MS = 12 * 60 * 60 * 1000;

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // writes go through the outbox, not the cache

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // The sync endpoint and auth flows must always hit the network.
  if (url.pathname.startsWith("/api/sync") || url.pathname.startsWith("/api/push")) return;

  if (req.mode === "navigate") {
    event.respondWith(handleNavigation(req));
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    event.respondWith(networkFirst(req, DATA_CACHE));
    return;
  }

  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    /\.(?:css|js|woff2?|png|jpg|jpeg|svg|webp|ico)$/.test(url.pathname)
  ) {
    event.respondWith(cacheFirst(req, ASSET_CACHE));
    return;
  }

  event.respondWith(networkFirst(req, PAGE_CACHE));
});

/**
 * Pages: network first (so numbers are fresh), fall back to the last good copy
 * of that page, then to the offline shell. A staff phone that opens the app in
 * a dead spot still gets a working sell screen.
 */
async function handleNavigation(req) {
  const cache = await caches.open(PAGE_CACHE);
  try {
    const fresh = await fetch(req);
    if (fresh && fresh.ok) cache.put(req, fresh.clone()).catch(() => {});
    return fresh;
  } catch {
    const cached = await cache.match(req, { ignoreSearch: false });
    if (cached) return cached;

    // Any cached page under the same first path segment is better than nothing.
    const url = new URL(req.url);
    const sibling = (await cache.keys()).find((k) => {
      const ku = new URL(k.url);
      return ku.pathname.split("/")[1] === url.pathname.split("/")[1];
    });
    if (sibling) {
      const res = await cache.match(sibling);
      if (res) return res;
    }

    const shell = await caches.open(SHELL_CACHE);
    return (
      (await shell.match(OFFLINE_URL)) ??
      new Response("Offline", { status: 503, headers: { "content-type": "text/plain" } })
    );
  }
}

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone()).catch(() => {});
    return res;
  } catch {
    return new Response("", { status: 504 });
  }
}

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res && res.ok) {
      const stamped = new Response(res.clone().body, res);
      cache.put(req, res.clone()).catch(() => {});
      return stamped;
    }
    const hit = await cache.match(req);
    return hit ?? res;
  } catch {
    const hit = await cache.match(req);
    if (hit) {
      const age = Date.now() - Date.parse(hit.headers.get("date") || "") || 0;
      if (!Number.isFinite(age) || age < DATA_MAX_AGE_MS) return hit;
      return hit;
    }
    return new Response(JSON.stringify({ offline: true }), {
      status: 503,
      headers: { "content-type": "application/json" },
    });
  }
}

/* ------------------------------------------------------------ background sync */

self.addEventListener("sync", (event) => {
  if (event.tag === "bm-outbox-sync") event.waitUntil(drainOutbox("sync"));
});

self.addEventListener("periodicsync", (event) => {
  if (event.tag === "bm-outbox-periodic") event.waitUntil(drainOutbox("periodic"));
});

const DB_NAME = "bm-offline";
const DB_VERSION = 1;

function openOfflineDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    // Never run schema upgrades from here; the app owns the schema.
    req.onupgradeneeded = () => reject(new Error("db-not-initialised"));
  });
}

function idbAll(db, store) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

function idbDelete(db, store, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function idbPut(db, store, value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Push the queue to the server without the app being open. Deliberately
 * conservative: on anything unexpected it leaves the record alone, because the
 * app itself will retry later and a queued op is never lost by waiting.
 */
async function drainOutbox(reason) {
  let db;
  try {
    db = await openOfflineDB();
  } catch {
    return; // app has never run on this device yet
  }

  let pending;
  try {
    pending = await idbAll(db, "outbox");
  } catch {
    return;
  }
  if (!pending.length) return;

  const now = Date.now();
  const due = pending
    .filter((r) => (r.nextAttemptAt || 0) <= now)
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(0, 100);
  if (!due.length) return;

  let res;
  try {
    res = await fetch("/api/sync", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      cache: "no-store",
      body: JSON.stringify({
        clientTime: new Date().toISOString(),
        ops: due.map((r) => ({ kind: r.kind, clientId: r.clientId, payload: r.payload })),
      }),
    });
  } catch {
    return; // still offline; the sync event will fire again
  }

  if (!res.ok) return;

  let json;
  try {
    json = await res.json();
  } catch {
    return;
  }

  let applied = 0;
  for (const r of json.results || []) {
    try {
      if (r.verdict === "applied" || r.verdict === "duplicate") {
        await idbDelete(db, "outbox", r.clientId);
        await markLedgerSynced(db, r.clientId);
        applied++;
      } else if (r.verdict === "rejected") {
        const rec = due.find((d) => d.clientId === r.clientId);
        if (rec) {
          await idbPut(db, "quarantine", {
            ...rec,
            reason: r.reason || "Rejected by server",
            rejectedAt: Date.now(),
          });
          await idbDelete(db, "outbox", r.clientId);
        }
      } else {
        const rec = due.find((d) => d.clientId === r.clientId);
        if (rec) {
          const attempts = (rec.attempts || 0) + 1;
          await idbPut(db, "outbox", {
            ...rec,
            attempts,
            lastError: r.reason || "retry",
            nextAttemptAt: Date.now() + Math.min(300000, 2000 * 2 ** attempts),
          });
        }
      }
    } catch {
      /* leave the record for the app to handle */
    }
  }

  const clients = await self.clients.matchAll({ includeUncontrolled: true });
  for (const c of clients) c.postMessage({ type: "sw-sync-complete", applied, reason });

  // Tell the staff their offline work made it through, if nobody is looking.
  if (applied > 0 && clients.length === 0) {
    await self.registration.showNotification("Sales synced", {
      body: `${applied} offline record${applied > 1 ? "s" : ""} sent to the office.`,
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-72.png",
      tag: "bm-sync",
      silent: true,
    });
  }
}

/* --------------------------------------------------------------------- push */

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "Update", body: event.data ? event.data.text() : "" };
  }

  const title = payload.title || "Business Manager";
  const options = {
    body: payload.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/badge-72.png",
    tag: payload.tag || "bm",
    renotify: Boolean(payload.urgent),
    vibrate: payload.urgent ? [80, 40, 80] : undefined,
    silent: false,
    timestamp: payload.at || Date.now(),
    data: { url: payload.url || "/admin", kind: payload.kind || "info", ...(payload.data || {}) },
    actions:
      payload.kind === "sale"
        ? [
            { action: "open-log", title: "See sales" },
            { action: "dismiss", title: "Dismiss" },
          ]
        : payload.kind === "note"
          ? [
              { action: "open-notes", title: "Read note" },
              { action: "dismiss", title: "Dismiss" },
            ]
          : undefined,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  if (event.action === "dismiss") return;

  const target =
    event.action === "open-log"
      ? "/admin/log"
      : event.action === "open-notes"
        ? "/admin/notes"
        : event.notification.data?.url || "/admin";

  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of all) {
        if (client.url.includes(new URL(target, self.location.origin).pathname)) {
          return client.focus();
        }
      }
      const existing = all[0];
      if (existing) {
        await existing.focus();
        return existing.navigate(target).catch(() => self.clients.openWindow(target));
      }
      return self.clients.openWindow(target);
    })(),
  );
});

/** Chrome can drop a subscription; re-register through an open client. */
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ includeUncontrolled: true });
      for (const c of clients) c.postMessage({ type: "sw-resubscribe-push" });
    })(),
  );
});

async function markLedgerSynced(db, clientId) {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction("ledger", "readwrite");
      const store = tx.objectStore("ledger");
      const get = store.get(clientId);
      get.onsuccess = () => {
        const rec = get.result;
        if (rec) store.put({ ...rec, status: "synced", syncedAt: Date.now() });
        resolve();
      };
      get.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}
