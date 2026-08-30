"use client";
/**
 * Web Push subscription management for the current device.
 *
 * The admin's phone must buzz when a sale lands even with the app closed, and
 * that needs three things to line up: a service worker, an OS-level permission
 * grant, and a subscription stored server-side. This hook makes that one
 * button and reports honestly when the browser will not play along.
 */
import * as React from "react";

export type PushState = {
  /** Browser has the APIs at all (iOS needs the app installed first). */
  supported: boolean;
  /** Server has VAPID keys configured. */
  configured: boolean;
  permission: NotificationPermission | "unsupported";
  subscribed: boolean;
  busy: boolean;
  error: string | null;
  /** iOS only shows push to installed PWAs. */
  needsInstall: boolean;
};

function base64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export function usePush() {
  const [state, setState] = React.useState<PushState>({
    supported: false,
    configured: false,
    permission: "unsupported",
    subscribed: false,
    busy: true,
    error: null,
    needsInstall: false,
  });
  const publicKey = React.useRef<string>("");

  const refresh = React.useCallback(async () => {
    if (typeof window === "undefined") return;

    const supported =
      "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

    if (!supported) {
      setState((s) => ({
        ...s,
        supported: false,
        busy: false,
        permission: "unsupported",
        needsInstall: isIOS && !standalone,
      }));
      return;
    }

    try {
      const res = await fetch("/api/push", { cache: "no-store" });
      const info = res.ok
        ? ((await res.json()) as { configured: boolean; publicKey: string })
        : { configured: false, publicKey: "" };
      publicKey.current = info.publicKey;

      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();

      setState({
        supported: true,
        configured: info.configured,
        permission: Notification.permission,
        subscribed: Boolean(existing),
        busy: false,
        error: null,
        needsInstall: isIOS && !standalone,
      });
    } catch (err) {
      setState((s) => ({
        ...s,
        supported: true,
        busy: false,
        error: err instanceof Error ? err.message : "Could not check notifications",
      }));
    }
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  // The browser can drop a subscription; the worker asks us to redo it.
  React.useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === "sw-resubscribe-push") void enable();
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const enable = React.useCallback(async () => {
    setState((s) => ({ ...s, busy: true, error: null }));
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState((s) => ({
          ...s,
          busy: false,
          permission,
          error:
            permission === "denied"
              ? "Notifications are blocked. Turn them on for this app in your phone settings."
              : null,
        }));
        return false;
      }

      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();

      if (!sub) {
        if (!publicKey.current) throw new Error("Push is not configured on the server.");
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64ToUint8Array(publicKey.current) as BufferSource,
        });
      }

      const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh: string; auth: string } };
      const res = await fetch("/api/push", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "subscribe",
          endpoint: json.endpoint,
          keys: json.keys,
        }),
      });
      if (!res.ok) throw new Error("The server refused the subscription.");

      setState((s) => ({ ...s, busy: false, subscribed: true, permission: "granted" }));
      return true;
    } catch (err) {
      setState((s) => ({
        ...s,
        busy: false,
        error: err instanceof Error ? err.message : "Could not turn on notifications",
      }));
      return false;
    }
  }, []);

  const disable = React.useCallback(async () => {
    setState((s) => ({ ...s, busy: true, error: null }));
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "unsubscribe", endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setState((s) => ({ ...s, busy: false, subscribed: false }));
    } catch (err) {
      setState((s) => ({
        ...s,
        busy: false,
        error: err instanceof Error ? err.message : "Could not turn notifications off",
      }));
    }
  }, []);

  const sendTest = React.useCallback(async () => {
    const res = await fetch("/api/push", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "test" }),
    });
    return res.ok ? ((await res.json()) as { ok: boolean; sent: number }) : { ok: false, sent: 0 };
  }, []);

  return { ...state, enable, disable, sendTest, refresh };
}
