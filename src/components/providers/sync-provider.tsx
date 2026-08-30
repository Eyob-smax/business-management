"use client";
/**
 * Owns the sync engine for the tab and shares its status with the UI.
 *
 * The status is deliberately visible everywhere (header pill, sell button,
 * shift list): staff need to trust that an order they cannot see on the server
 * is still safely on the phone, otherwise they will write it on paper too.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  getStatus,
  startSyncEngine,
  subscribe,
  syncNow,
  announceEnqueued,
  registerBackgroundSync,
  type SyncStatus,
} from "@/lib/offline/sync";
import { enqueue } from "@/lib/offline/outbox";
import { pruneLedger, type OpKind } from "@/lib/offline/db";
import { useToast } from "@/components/ui/toast";

type SyncContextValue = SyncStatus & {
  /** Queue an operation and immediately attempt to send it. */
  queue: (kind: OpKind, payload: unknown, summary: string, clientId?: string) => Promise<void>;
  /** Force a sync attempt (the "Sync now" button). */
  flush: () => Promise<number>;
};

const SyncContext = React.createContext<SyncContextValue | null>(null);

export function useSync() {
  const ctx = React.useContext(SyncContext);
  if (!ctx) throw new Error("useSync must be used inside <SyncProvider>");
  return ctx;
}

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = React.useState<SyncStatus>(getStatus);
  const t = useTranslations("Sync");
  const { toast } = useToast();
  const router = useRouter();
  const wasOffline = React.useRef(false);
  const prevPending = React.useRef(0);

  React.useEffect(() => {
    const unsubscribe = subscribe(setStatus);
    const stop = startSyncEngine();
    void pruneLedger(45).catch(() => {});
    return () => {
      unsubscribe();
      stop();
    };
  }, []);

  // Announce the transitions that matter, and only those.
  React.useEffect(() => {
    if (!status.online && !wasOffline.current) {
      wasOffline.current = true;
      toast({
        tone: "offline",
        title: t("offlineToastTitle"),
        body: t("offlineToastBody"),
      });
    }
    if (status.online && wasOffline.current) {
      wasOffline.current = false;
      toast({ tone: "success", title: t("backOnlineTitle"), body: t("backOnlineBody") });
    }
  }, [status.online, toast, t]);

  React.useEffect(() => {
    if (prevPending.current > 0 && status.pending === 0 && status.lastSyncAt) {
      toast({
        tone: "success",
        title: t("syncedTitle"),
        body: t("syncedBody", { count: prevPending.current }),
      });
      // Server components now have newer data than what we rendered.
      router.refresh();
    }
    prevPending.current = status.pending;
  }, [status.pending, status.lastSyncAt, toast, router, t]);

  const wasBlocked = React.useRef(false);
  React.useEffect(() => {
    if (status.writeBlocked && !wasBlocked.current) {
      wasBlocked.current = true;
      toast({
        tone: "error",
        title: t("pausedTitle"),
        body: status.blockedMessage ?? t("pausedBody"),
        duration: 10000,
      });
    }
    if (!status.writeBlocked && wasBlocked.current) {
      wasBlocked.current = false;
      toast({ tone: "success", title: t("resumedTitle") });
    }
  }, [status.writeBlocked, status.blockedMessage, toast, t]);

  React.useEffect(() => {
    if (status.needsAuth) {
      toast({
        tone: "error",
        title: t("signInAgainTitle"),
        body: t("signInAgainBody"),
        duration: 8000,
      });
    }
  }, [status.needsAuth, toast, t]);

  const queue = React.useCallback<SyncContextValue["queue"]>(
    async (kind, payload, summary, clientId) => {
      await enqueue(kind, payload, summary, clientId);
      announceEnqueued();
      void registerBackgroundSync();
      void syncNow("enqueue");
    },
    [],
  );

  const flush = React.useCallback(() => syncNow("manual"), []);

  const value = React.useMemo<SyncContextValue>(
    () => ({ ...status, queue, flush }),
    [status, queue, flush],
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}
