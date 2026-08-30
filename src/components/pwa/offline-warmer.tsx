"use client";
/**
 * Warms the page cache for the screens this person actually switches between.
 *
 * Without this, going offline only works for pages already visited in this
 * session - so a waitress who opens the till, loses signal and then taps "My
 * sales" gets the offline screen for a page she uses constantly. Fetching them
 * quietly while there is still signal fixes that.
 *
 * It is a hint, not a guarantee: every fetch is allowed to fail silently, and
 * it re-runs whenever the connection comes back.
 */
import * as React from "react";
import { useLocale } from "next-intl";

export function OfflineWarmer({ paths }: { paths: string[] }) {
  const locale = useLocale();

  React.useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    // localePrefix is "always", so every cached URL carries its locale and the
    // Amharic and English copies of a page never collide in the cache.
    const urls = paths.map((p) => `/${locale}${p}`);

    let cancelled = false;

    const warm = async () => {
      if (cancelled || !navigator.onLine) return;
      try {
        const reg = await navigator.serviceWorker.ready;
        reg.active?.postMessage({ type: "WARM_PAGES", urls });
      } catch {
        /* no worker yet - nothing to warm */
      }
    };

    // Let the page settle first; this is background work, not the main event.
    const timer = setTimeout(warm, 2500);
    window.addEventListener("online", warm);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      window.removeEventListener("online", warm);
    };
  }, [paths, locale]);

  return null;
}
