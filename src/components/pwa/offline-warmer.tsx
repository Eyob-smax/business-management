"use client";
/**
 * Downloads the app for offline use, quietly, in the background.
 *
 * The old behaviour was that a screen worked offline only if you had happened
 * to open it while you still had signal. Nobody plans for that. This hands the
 * service worker every page the signed-in person can reach - filter variants
 * included - and lets it save each one along with the code it needs to render.
 *
 * Rules it lives by:
 *   - never on a metered or data-saver connection;
 *   - at most once every half hour per device, because each page is a real
 *     server render and the database behind it is not free;
 *   - always again the moment the connection comes back.
 *
 * Every part of it is allowed to fail silently. It is a head start, not a
 * guarantee.
 */
import * as React from "react";
import { useLocale } from "next-intl";

const AGAIN_AFTER_MS = 30 * 60 * 1000;
const STORAGE_KEY = "bm:warmed-at";

type Connection = { saveData?: boolean; effectiveType?: string };

/** Downloading two dozen pages over 2G, or on someone's last megabyte, is rude. */
function connectionAllows(): boolean {
  const nav = navigator as Navigator & { connection?: Connection };
  const c = nav.connection;
  if (!c) return true;
  if (c.saveData) return false;
  return c.effectiveType !== "slow-2g" && c.effectiveType !== "2g";
}

function warmedRecently(key: string): boolean {
  try {
    const at = Number(localStorage.getItem(`${STORAGE_KEY}:${key}`) ?? 0);
    return Number.isFinite(at) && Date.now() - at < AGAIN_AFTER_MS;
  } catch {
    return false; // private mode: warm every time rather than never
  }
}

function markWarmed(key: string) {
  try {
    localStorage.setItem(`${STORAGE_KEY}:${key}`, String(Date.now()));
  } catch {
    /* nothing to remember it with; no harm done */
  }
}

export function OfflineWarmer({ paths }: { paths: string[] }) {
  const locale = useLocale();

  React.useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    // localePrefix is "always", so every cached URL carries its locale and the
    // Amharic and English copies of a page never collide in the cache.
    const urls = paths.map((p) =>
      p.startsWith("/") ? `/${locale}${p}` : `/${locale}/${p}`,
    );
    const key = `${locale}:${paths.length}`;

    let cancelled = false;

    const warm = async (force = false) => {
      if (cancelled || !navigator.onLine) return;
      if (!connectionAllows()) return;
      if (!force && warmedRecently(key)) return;

      try {
        const reg = await navigator.serviceWorker.ready;
        const worker = reg.active;
        if (!worker) return;
        markWarmed(key);
        worker.postMessage({ type: "WARM_PAGES", urls });
      } catch {
        /* no worker yet - the next trigger will find one */
      }
    };

    // Let the page settle first; this is background work, not the main event.
    const timer = setTimeout(() => void warm(), 2500);

    // Coming back online is the one moment worth ignoring the throttle for:
    // whatever failed while the signal was gone is still missing.
    const onOnline = () => void warm(true);
    window.addEventListener("online", onOnline);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      window.removeEventListener("online", onOnline);
    };
  }, [paths, locale]);

  return null;
}
