"use client";
/**
 * Registers the service worker and handles updates.
 *
 * An update is applied on the next launch rather than mid-shift: swapping the
 * controller while someone is halfway through an order is a good way to lose
 * their basket. The waiting worker is activated on the next cold start.
 */
import * as React from "react";
import { RefreshCw } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/primitives";

export function ServiceWorkerRegistrar() {
  const { toast } = useToast();
  const [waiting, setWaiting] = React.useState<ServiceWorker | null>(null);

  React.useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    // Dev builds change on every save; registering there just adds noise.
    if (process.env.NODE_ENV === "development" && !process.env.NEXT_PUBLIC_SW_IN_DEV) return;

    let cancelled = false;

    const register = async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
          updateViaCache: "none",
        });

        if (reg.waiting) setWaiting(reg.waiting);

        reg.addEventListener("updatefound", () => {
          const next = reg.installing;
          next?.addEventListener("statechange", () => {
            if (next.state === "installed" && navigator.serviceWorker.controller && !cancelled) {
              setWaiting(next);
            }
          });
        });

        // Opportunistic periodic sync, where the browser allows it.
        const periodic = (reg as ServiceWorkerRegistration & {
          periodicSync?: { register: (t: string, o: { minInterval: number }) => Promise<void> };
        }).periodicSync;
        await periodic?.register("bm-outbox-periodic", { minInterval: 60 * 60 * 1000 }).catch(() => {});
      } catch (err) {
        console.warn("[sw] registration failed", err);
      }
    };

    void register();
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    if (!waiting) return;
    toast({
      tone: "info",
      title: "An update is ready",
      body: "It will be applied the next time you open the app.",
      duration: 6000,
    });
  }, [waiting, toast]);

  if (!waiting) return null;

  return (
    <div className="pb-safe fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-2">
      <Button
        size="sm"
        variant="soft"
        icon={<RefreshCw className="size-3.5" />}
        onClick={() => {
          waiting.postMessage({ type: "SKIP_WAITING" });
          setTimeout(() => window.location.reload(), 200);
        }}
      >
        Update now
      </Button>
    </div>
  );
}
