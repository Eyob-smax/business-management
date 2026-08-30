"use client";
/**
 * The menu, read from IndexedDB and refreshed from the network when possible.
 *
 * Order matters: the cache is rendered FIRST and the network refresh happens
 * behind it. That way the till is usable in the time it takes to read
 * IndexedDB, and a dead connection changes nothing about whether staff can
 * work - it only means the menu is as of the last successful refresh.
 */
import * as React from "react";
import { cacheGet, cacheSet } from "@/lib/offline/db";
import type { MenuSnapshot } from "@/lib/menu-types";

const CACHE_KEY = "menu:restaurant";
/** Older than this and we tell the user the menu might be behind. */
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

export type MenuState = {
  snapshot: MenuSnapshot | null;
  /** When the cached copy was taken. */
  cachedAt: number | null;
  loading: boolean;
  refreshing: boolean;
  stale: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

export function useMenuCache(initial?: MenuSnapshot | null): MenuState {
  const [snapshot, setSnapshot] = React.useState<MenuSnapshot | null>(initial ?? null);
  const [cachedAt, setCachedAt] = React.useState<number | null>(initial ? Date.now() : null);
  const [loading, setLoading] = React.useState(!initial);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const res = await fetch("/api/menu", { cache: "no-store" });
      if (res.status === 401) throw new Error("Signed out");
      if (!res.ok) throw new Error(`Server said ${res.status}`);
      const json = (await res.json()) as MenuSnapshot;
      setSnapshot(json);
      setCachedAt(Date.now());
      await cacheSet(CACHE_KEY, json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not refresh the menu");
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const cached = await cacheGet<MenuSnapshot>(CACHE_KEY);
        if (cached && !cancelled) {
          setSnapshot(cached.data);
          setCachedAt(cached.at);
          setLoading(false);
        }
      } catch {
        /* first run on this device */
      }

      // Seed the cache from the server-rendered copy so a brand-new device
      // still works the moment it goes offline.
      if (initial && !cancelled) await cacheSet(CACHE_KEY, initial).catch(() => {});

      if (!cancelled && navigator.onLine) await refresh();
      else if (!cancelled) setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh]);

  // Pick up menu edits when the app comes back to the foreground.
  React.useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState === "visible" && navigator.onLine) void refresh();
    };
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("online", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("online", onFocus);
    };
  }, [refresh]);

  return {
    snapshot,
    cachedAt,
    loading,
    refreshing,
    stale: cachedAt !== null && Date.now() - cachedAt > STALE_AFTER_MS,
    error,
    refresh,
  };
}
