"use client";
/**
 * In-app notification centre.
 *
 * Every push has a row behind it, so this list is the reliable record even
 * when the OS swallowed the notification or permission was never granted. It
 * also hosts the "turn on notifications" switch, which is where an admin will
 * naturally look for it.
 */
import * as React from "react";
import Link from "next/link";
import { Bell, BellRing, Check, Send } from "lucide-react";
import { relativeTime } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { Badge, Button, EmptyState, Spinner } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/overlay";
import { useToast } from "@/components/ui/toast";
import { usePush } from "@/hooks/use-push";

type Item = {
  id: string;
  kind: string;
  title: string;
  body: string;
  url: string | null;
  readAt: string | null;
  createdAt: string;
};

export function NotificationBell() {
  const [open, setOpen] = React.useState(false);
  const [items, setItems] = React.useState<Item[] | null>(null);
  const [unread, setUnread] = React.useState(0);
  const { toast } = useToast();
  const push = usePush();

  const load = React.useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const json = (await res.json()) as { unread: number; items: Item[] };
      setItems(json.items);
      setUnread(json.unread);
    } catch {
      /* offline - the bell simply shows what it last knew */
    }
  }, []);

  React.useEffect(() => {
    void load();
    const t = setInterval(load, 60_000);
    const onVisible = () => document.visibilityState === "visible" && void load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  React.useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const markAllRead = async () => {
    await fetch("/api/notifications", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "read-all" }),
    });
    setUnread(0);
    setItems((prev) =>
      prev?.map((i) => ({ ...i, readAt: i.readAt ?? new Date().toISOString() })) ?? null,
    );
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        className="relative inline-flex size-9 items-center justify-center rounded-full text-ink-2 transition active:scale-95"
      >
        {unread > 0 ? <BellRing className="size-[19px]" /> : <Bell className="size-[19px]" />}
        {unread > 0 ? (
          <span className="nums absolute top-0.5 right-0.5 flex min-w-4 items-center justify-center rounded-full bg-loss px-1 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Notifications"
        subtitle={unread ? `${unread} unread` : "You are up to date"}
        size="md"
        footer={
          <div className="flex gap-2">
            <Button
              variant="secondary"
              block
              disabled={unread === 0}
              icon={<Check className="size-4" />}
              onClick={markAllRead}
            >
              Mark all read
            </Button>
          </div>
        }
      >
        <PushSwitch />

        {items === null ? (
          <div className="flex justify-center py-10 text-ink-3">
            <Spinner className="size-5" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={<Bell className="size-6" />}
            title="Nothing yet"
            body="When staff record a sale or leave a note, it will show up here."
          />
        ) : (
          <ul className="divide-y divide-line">
            {items.map((n) => {
              const inner = (
                <div className="flex gap-3 py-3.5">
                  <span
                    className={cn(
                      "mt-1.5 size-2 shrink-0 rounded-full",
                      n.readAt ? "bg-transparent" : "bg-brand",
                    )}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        "text-[14px] leading-snug",
                        n.readAt ? "font-medium text-ink-2" : "font-bold text-ink",
                      )}
                    >
                      {n.title}
                    </p>
                    <p className="mt-0.5 text-[12.5px] leading-snug text-ink-3">{n.body}</p>
                    <p className="mt-1 text-[11px] text-ink-3">{relativeTime(n.createdAt)}</p>
                  </div>
                  {n.kind === "sale" ? <Badge tone="profit">sale</Badge> : null}
                  {n.kind === "note" ? <Badge tone="info">note</Badge> : null}
                </div>
              );

              return (
                <li key={n.id}>
                  {n.url ? (
                    <Link href={n.url} onClick={() => setOpen(false)} className="block">
                      {inner}
                    </Link>
                  ) : (
                    inner
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Sheet>
    </>
  );

  function PushSwitch() {
    if (!push.supported) {
      return (
        <div className="mb-3 rounded-[14px] bg-surface-2 p-3.5 text-[12.5px] leading-relaxed text-ink-2">
          {push.needsInstall
            ? "To get notifications on iPhone, first add this app to your home screen, then open it from there."
            : "This browser cannot show notifications. The list below still records everything."}
        </div>
      );
    }

    if (push.subscribed) {
      return (
        <div className="mb-3 flex items-center justify-between gap-3 rounded-[14px] bg-profit-soft p-3.5">
          <p className="text-[12.5px] leading-snug font-semibold text-profit">
            Phone notifications are on for this device.
          </p>
          <div className="flex shrink-0 gap-1.5">
            <Button
              size="sm"
              variant="ghost"
              icon={<Send className="size-3.5" />}
              onClick={async () => {
                const r = await push.sendTest();
                toast(
                  r.ok
                    ? { tone: "success", title: "Test sent", body: "Check your notification tray." }
                    : { tone: "error", title: "Could not send the test" },
                );
              }}
            >
              Test
            </Button>
            <Button size="sm" variant="ghost" onClick={() => void push.disable()}>
              Turn off
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div className="mb-3 rounded-[14px] border border-brand/25 bg-brand-soft p-3.5">
        <p className="text-[13px] font-semibold text-brand-ink">
          Get told the moment a sale is recorded
        </p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-brand-ink/85">
          Works even when the app is closed. One notification per batch, not one per plate.
        </p>
        {push.error ? (
          <p className="mt-2 text-[12px] font-medium text-loss">{push.error}</p>
        ) : null}
        <Button
          size="sm"
          variant="primary"
          className="mt-3"
          loading={push.busy}
          disabled={!push.configured}
          icon={<BellRing className="size-3.5" />}
          onClick={async () => {
            const ok = await push.enable();
            if (ok) toast({ tone: "success", title: "Notifications are on" });
          }}
        >
          {push.configured ? "Turn on notifications" : "Not configured on server"}
        </Button>
      </div>
    );
  }
}
