"use client";
/**
 * Settings.
 *
 * costingMode gets the most space on purpose - it is the one setting that
 * silently changes every profit number in the app, so each option spells out
 * what it does in words the owner would use.
 */
import * as React from "react";
import { useActionState } from "react";
import { BellRing, Database, HardDriveDownload, Info, Save, Send, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/money";
import type { BusinessSettings, NotifySettings } from "@/lib/settings";
import { saveBusinessSettings, saveNotifySettings } from "@/app/actions/settings";
import type { ActionResult } from "@/app/actions/_result";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Field,
  Input,
  Select,
  Toggle,
} from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { usePush } from "@/hooks/use-push";
import { useSync } from "@/components/providers/sync-provider";
import { InstallHint } from "@/components/pwa/install-hint";

const COSTING_OPTIONS: {
  value: BusinessSettings["costingMode"];
  title: string;
  body: string;
}[] = [
  {
    value: "auto",
    title: "Estimates, corrected by real spending",
    body: "Use your per-plate cost estimates day to day. On any day covered by an expense you marked as “this is what the food actually cost”, use that real figure instead. Recommended.",
  },
  {
    value: "item",
    title: "Per-plate estimates only",
    body: "Food cost always comes from the estimate on each dish. Expenses - including ones marked as replacing estimates - are treated as ordinary running costs on top.",
  },
  {
    value: "period",
    title: "Recorded spending only",
    body: "Ignore the per-plate estimates entirely for overall profit. Only money you actually recorded as an expense counts as cost. Per-dish profit still uses the estimates, because nothing else exists per dish.",
  },
];

const TIMEZONES = [
  "Africa/Addis_Ababa",
  "Africa/Nairobi",
  "Africa/Lagos",
  "Africa/Cairo",
  "Africa/Johannesburg",
  "Europe/London",
  "America/New_York",
  "Asia/Dubai",
];

const CURRENCIES = ["ETB", "USD", "EUR", "KES", "NGN", "GBP"];

export function SettingsForm({
  business,
  notify,
}: {
  business: BusinessSettings;
  notify: NotifySettings;
}) {
  const { toast } = useToast();
  const push = usePush();
  const sync = useSync();

  const [bizState, bizAction, bizPending] = useActionState<ActionResult | null, FormData>(
    saveBusinessSettings,
    null,
  );
  const [notifyState, notifyAction, notifyPending] = useActionState<ActionResult | null, FormData>(
    saveNotifySettings,
    null,
  );

  const [costingMode, setCostingMode] = React.useState(business.costingMode);
  const [onSale, setOnSale] = React.useState(notify.onSale);
  const [onNote, setOnNote] = React.useState(notify.onNote);
  const [onOffline, setOnOffline] = React.useState(notify.onOfflineBatch);
  const [onVoid, setOnVoid] = React.useState(notify.onVoid);

  React.useEffect(() => {
    if (!bizState) return;
    toast(
      bizState.ok
        ? { tone: "success", title: bizState.message ?? "Saved" }
        : { tone: "error", title: bizState.error ?? "Could not save" },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bizState]);

  React.useEffect(() => {
    if (!notifyState) return;
    toast(
      notifyState.ok
        ? { tone: "success", title: notifyState.message ?? "Saved" }
        : { tone: "error", title: notifyState.error ?? "Could not save" },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifyState]);

  return (
    <div className="space-y-5">
      {/* Business */}
      <Card className="pb-4">
        <CardHeader title="The business" subtitle="Names, money and the trading day" />
        <form action={bizAction} className="space-y-4 px-4 pt-4">
          <Field label="Restaurant name" required>
            <Input name="restaurantName" defaultValue={business.restaurantName} required maxLength={60} />
          </Field>
          <Field label="Mobile shop name" required>
            <Input name="shopName" defaultValue={business.shopName} required maxLength={60} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Currency">
              <Select name="currency" defaultValue={business.currency}>
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Timezone">
              <Select name="timezone" defaultValue={business.timezone}>
                {[...new Set([business.timezone, ...TIMEZONES])].map((t) => (
                  <option key={t} value={t}>
                    {t.replace(/_/g, " ")}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field
            label="A new trading day starts at"
            hint="Sales rung up before this hour count towards the night before. Useful if you serve past midnight."
          >
            <Select name="dayCutoffHour" defaultValue={String(business.dayCutoffHour)}>
              {Array.from({ length: 13 }, (_, h) => (
                <option key={h} value={h}>
                  {h === 0 ? "Midnight" : `${h}:00`}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Warn me when a dish keeps less than"
            hint="Dishes below this margin are flagged in red."
          >
            <Input
              name="lowMarginPct"
              type="number"
              min={0}
              max={90}
              defaultValue={String(business.lowMarginPct)}
              prefix="%"
            />
          </Field>

          {/* Costing */}
          <div>
            <span className="mb-2 block text-[13px] font-semibold text-ink-2">
              How should profit be worked out?
            </span>
            <input type="hidden" name="costingMode" value={costingMode} />
            <div className="space-y-2">
              {COSTING_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setCostingMode(o.value)}
                  className={cn(
                    "w-full rounded-[14px] border p-3.5 text-left transition active:scale-[0.99]",
                    costingMode === o.value
                      ? "border-brand bg-brand-soft"
                      : "border-line bg-surface hover:bg-surface-2",
                  )}
                >
                  <p className="flex items-center gap-2 text-[13.5px] font-bold text-ink">
                    <span
                      className={cn(
                        "size-4 shrink-0 rounded-full border-2",
                        costingMode === o.value ? "border-brand bg-brand" : "border-line-strong",
                      )}
                    />
                    {o.title}
                    {o.value === "auto" ? <Badge tone="brand">default</Badge> : null}
                  </p>
                  <p className="mt-1.5 pl-6 text-[12.5px] leading-relaxed text-ink-2">{o.body}</p>
                </button>
              ))}
            </div>
          </div>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            block
            loading={bizPending}
            icon={<Save className="size-4" />}
          >
            Save settings
          </Button>
        </form>
      </Card>

      {/* Notifications */}
      <Card className="pb-4">
        <CardHeader
          icon={<BellRing className="size-4" />}
          title="Notifications"
          subtitle="What should reach your phone, and when"
        />

        <div className="px-4 pt-3">
          {!push.supported ? (
            <p className="rounded-[12px] bg-surface-2 p-3.5 text-[12.5px] leading-relaxed text-ink-2">
              {push.needsInstall
                ? "On iPhone, add this app to your home screen first, then open it from there to allow notifications."
                : "This browser cannot show notifications. Everything is still recorded in the bell menu."}
            </p>
          ) : push.subscribed ? (
            <div className="flex items-center justify-between gap-3 rounded-[12px] bg-profit-soft p-3.5">
              <p className="text-[12.5px] font-semibold text-profit">
                This device will receive notifications.
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
                        ? { tone: "success", title: "Test sent" }
                        : { tone: "error", title: "Could not send" },
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
          ) : (
            <div className="rounded-[12px] border border-brand/25 bg-brand-soft p-3.5">
              <p className="text-[13px] font-semibold text-brand-ink">
                Notifications are off on this device
              </p>
              {push.error ? (
                <p className="mt-1 text-[12px] font-medium text-loss">{push.error}</p>
              ) : null}
              <Button
                size="sm"
                variant="primary"
                className="mt-2.5"
                loading={push.busy}
                disabled={!push.configured}
                onClick={async () => {
                  const okay = await push.enable();
                  if (okay) toast({ tone: "success", title: "Notifications are on" });
                }}
              >
                Turn them on
              </Button>
            </div>
          )}
        </div>

        <form action={notifyAction} className="space-y-1 px-4 pt-2">
          <input type="hidden" name="onSale" value={onSale ? "on" : ""} />
          <input type="hidden" name="onNote" value={onNote ? "on" : ""} />
          <input type="hidden" name="onOfflineBatch" value={onOffline ? "on" : ""} />
          <input type="hidden" name="onVoid" value={onVoid ? "on" : ""} />

          <Toggle
            checked={onSale}
            onChange={setOnSale}
            label="When a sale is recorded"
            description="One notification per batch that arrives, not one per plate."
          />
          <div className="h-px bg-line" />
          <Toggle
            checked={onOffline}
            onChange={setOnOffline}
            label="When offline sales come in late"
            description="Tells you a phone reconnected and sent work it had been holding."
          />
          <div className="h-px bg-line" />
          <Toggle
            checked={onNote}
            onChange={setOnNote}
            label="When somebody leaves a note"
            description="Problems always notify, whatever this is set to."
          />
          <div className="h-px bg-line" />
          <Toggle
            checked={onVoid}
            onChange={setOnVoid}
            label="When an order is cancelled"
          />

          <div className="pt-3">
            <Field
              label="Only tell me about single sales of at least"
              hint={`Set to ${formatMoney(0)} to be told about every sale. Batches always notify.`}
            >
              <Input
                name="saleMin"
                defaultValue={(notify.saleMinCents / 100).toFixed(2)}
                inputMode="decimal"
                prefix="Br"
              />
            </Field>
          </div>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            block
            className="mt-3"
            loading={notifyPending}
            icon={<Save className="size-4" />}
          >
            Save notification settings
          </Button>
        </form>
      </Card>

      {/* This device */}
      <Card className="pb-4">
        <CardHeader
          icon={<Database className="size-4" />}
          title="This device"
          subtitle="Offline storage and app install"
        />
        <div className="space-y-3 px-4 pt-3">
          <div className="flex items-center justify-between gap-3 rounded-[12px] bg-surface-2 p-3.5">
            <div>
              <p className="text-[13px] font-semibold text-ink">Waiting to be sent</p>
              <p className="nums mt-0.5 text-[12px] text-ink-3">
                {sync.pending} record{sync.pending === 1 ? "" : "s"}
                {sync.quarantined > 0 ? ` - ${sync.quarantined} rejected` : ""}
              </p>
            </div>
            <Button
              size="sm"
              variant="secondary"
              loading={sync.syncing}
              disabled={!sync.online || sync.pending === 0}
              icon={<HardDriveDownload className="size-3.5" />}
              onClick={() => void sync.flush()}
            >
              Send now
            </Button>
          </div>

          <InstallHint />

          <Button
            variant="ghost"
            block
            className="justify-start text-ink-2"
            icon={<Trash2 className="size-4" />}
            onClick={async () => {
              if (sync.pending > 0) {
                toast({
                  tone: "error",
                  title: "Send your waiting records first",
                  body: "Clearing now would throw away work that has not reached the database.",
                });
                return;
              }
              try {
                const keys = await caches.keys();
                await Promise.all(keys.filter((k) => k.startsWith("bm-")).map((k) => caches.delete(k)));
                toast({ tone: "success", title: "Offline pages cleared", body: "Reloading..." });
                setTimeout(() => window.location.reload(), 700);
              } catch {
                toast({ tone: "error", title: "Could not clear the cache" });
              }
            }}
          >
            Clear cached pages on this device
          </Button>

          <p className="flex items-start gap-2 text-[11.5px] leading-relaxed text-ink-3">
            <Info className="mt-px size-3.5 shrink-0" />
            Clearing only removes copies of pages. Sales waiting to be sent are kept separately and
            are never touched by this.
          </p>
        </div>
      </Card>
    </div>
  );
}
