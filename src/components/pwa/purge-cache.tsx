"use client";
/**
 * Clears cached PAGE and DATA responses when the sign-in screen is shown.
 *
 * The service worker keeps the last good copy of each page so the app opens
 * offline. Those copies are rendered for a specific person, so if a phone
 * changes hands - staff signs out, admin signs in, or the other way round -
 * the next offline load must not serve the previous person's screens.
 * Reaching the login page is exactly that boundary.
 *
 * Deliberately narrow: only the Cache API entries for pages and API responses
 * are removed. The app shell stays (so /offline still works with no network),
 * and IndexedDB is never touched - it holds sales that have not reached the
 * database yet, and losing those is the one thing this app must never do.
 */
import * as React from "react";

export function PurgePrivateCache() {
  React.useEffect(() => {
    if (typeof caches === "undefined") return;

    void (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(
          keys
            .filter((k) => k.startsWith("bm-pages-") || k.startsWith("bm-data-"))
            .map((k) => caches.delete(k)),
        );
      } catch {
        // Private mode, or storage blocked - nothing cached to leak anyway.
      }
    })();
  }, []);

  return null;
}
