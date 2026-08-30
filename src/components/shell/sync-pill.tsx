"use client";
/**
 * The trust indicator.
 *
 * Staff will only stop keeping a paper backup if the app is honest about where
 * their data is. Four states, each with words rather than just a colour:
 *   saved here   - queued on the phone, nothing sent yet
 *   sending      - a sync attempt is in flight
 *   all saved    - the server has confirmed everything
 *   offline      - no network, and that is fine
 */
import * as React from "react";
import { useTranslations } from "next-intl";
import { Check, CloudOff, RefreshCw, TriangleAlert, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { relativeTime } from "@/lib/dates";
import { useSync } from "@/components/providers/sync-provider";
import { Sheet } from "@/components/ui/overlay";
import { Button, Row } from "@/components/ui/primitives";
import { QuarantineList } from "./quarantine-list";

export function SyncPill({ className }: { className?: string }) {
  const t = useTranslations("Sync");
  const sync = useSync();
  const [open, setOpen] = React.useState(false);

  const state = !sync.online
    ? "offline"
    : sync.syncing
      ? "syncing"
      : sync.quarantined > 0
        ? "attention"
        : sync.pending > 0
          ? "pending"
          : "clear";

  const config = {
    offline: {
      icon: <CloudOff className="size-3.5" />,
      label: sync.pending > 0 ? t("savedHere", { count: sync.pending }) : t("offline"),
      cls: "bg-warn-soft text-warn",
    },
    syncing: {
      icon: <RefreshCw className="size-3.5 animate-spin" />,
      label: t("sending"),
      cls: "bg-info-soft text-info",
    },
    pending: {
      icon: <Upload className="size-3.5" />,
      label: t("toSend", { count: sync.pending }),
      cls: "bg-info-soft text-info",
    },
    attention: {
      icon: <TriangleAlert className="size-3.5" />,
      label: t("needsYou", { count: sync.quarantined }),
      cls: "bg-loss-soft text-loss",
    },
    clear: {
      icon: <Check className="size-3.5" />,
      label: t("allSaved"),
      cls: "bg-profit-soft text-profit",
    },
  }[state];

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-bold whitespace-nowrap transition active:scale-95",
          config.cls,
          className,
        )}
        aria-label={t("statusLabel")}
      >
        {config.icon}
        <span>{config.label}</span>
      </button>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={t("yourData")}
        subtitle={t("yourDataSubtitle")}
        size="md"
        footer={
          <Button
            block
            variant="primary"
            loading={sync.syncing}
            disabled={!sync.online || sync.pending === 0}
            icon={<RefreshCw className="size-4" />}
            onClick={() => void sync.flush()}
          >
            {sync.pending === 0 ? t("nothingWaiting") : t("sendNowCount", { count: sync.pending })}
          </Button>
        }
      >
        <div className="divide-y divide-line">
          <div className="pb-3">
            <Row
              label={t("connection")}
              value={sync.online ? t("online") : t("offline")}
              tone={sync.online ? "profit" : undefined}
            />
            <Row
              label={t("waitingHere")}
              value={sync.pending === 0 ? t("none") : String(sync.pending)}
            />
            <Row
              label={t("lastSync")}
              value={sync.lastSyncAt ? relativeTime(sync.lastSyncAt) : t("notYet")}
              tone={sync.lastSyncAt ? undefined : "muted"}
            />
            {sync.lastError ? (
              <Row label={t("lastMessage")} value={sync.lastError} tone="muted" />
            ) : null}
          </div>

          <div className="py-4">
            <p className="text-[13px] leading-relaxed text-ink-2">
              {sync.pending === 0
                ? t("allInDatabase")
                : t("storedOnPhone")}
            </p>
          </div>

          <QuarantineList />
        </div>
      </Sheet>
    </>
  );
}
