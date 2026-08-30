"use client";

import * as React from "react";

/**
 * Whether the browser thinks it has a connection.
 *
 * Starts optimistic on purpose: on the server and on the very first client
 * render there is no answer yet, and rendering "needs internet" for a frame on
 * a perfectly good connection is worse than the reverse.
 *
 * `navigator.onLine` only knows whether there is *a* network, not whether the
 * server is reachable. That is enough here - anything that actually matters
 * goes through the outbox, which finds out for real.
 */
export function useOnline(): boolean {
  const [online, setOnline] = React.useState(true);

  React.useEffect(() => {
    const read = () => setOnline(navigator.onLine);
    read();
    window.addEventListener("online", read);
    window.addEventListener("offline", read);
    return () => {
      window.removeEventListener("online", read);
      window.removeEventListener("offline", read);
    };
  }, []);

  return online;
}
