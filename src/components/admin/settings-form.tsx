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
import { useTranslations } from "next-intl";
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

/** Only the ids live here; the words come from the catalog at render time. */
const COSTING_OPTIONS: { value: BusinessSettings["costingMode"]; key: string }[] = [
  { value: "auto", key: "costingAuto" },
  { value: "item", key: "costingItem" },
  { value: "period", key: "costingPeriod" },
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
  const t = useTranslations("AdminSettings");
  const c = useTranslations("Common");
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
        ? { tone: "success", title: bizState.message ?? c("save") }
        : { tone: "error", title: bizState.error ?? c("couldNotSave") },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bizState]);

  React.useEffect(() => {
    if (!notifyState) return;
    toast(
      notifyState.ok
        ? { tone: "success", title: notifyState.message ?? c("save") }
        : { tone: "error", title: notifyState.error ?? c("couldNotSave") },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifyState]);

  return (
    <div className="space-y-5">
      {/* Business */}
      <Card className="pb-4">
        <CardHeader title={t("businessTitle")} subtitle={t("businessSubtitle")} />
        <form action={bizAction} className="space-y-4 px-4 pt-4">
          <Field label={t("restaurantName")} required>
            <Input name="restaurantName" defaultValue={business.restaurantName} required maxLength={60} />
          </Field>
          <Field label={t("shopName")} required>
            <Input name="shopName" defaultValue={business.shopName} required maxLength={60} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label={t("currency")}>
              <Select name="currency" defaultValue={business.currency}>
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("timezone")}>
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
            label={t("dayStartsAt")}
            hint={t("dayStartsHint")}
          >
            <Select name="dayCutoffHour" defaultValue={String(business.dayCutoffHour)}>
              {Array.from({ length: 13 }, (_, h) => (
                <option key={h} value={h}>
                  {h === 0 ? t("midnight") : `${h}:00`}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label={t("lowMarginLabel")}
            hint={t("lowMarginHint")}
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
              {t("costingQuestion")}
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
                    {t(`${o.key}Title` as never)}
                    {o.value === "auto" ? <Badge tone="brand">{t("default")}</Badge> : null}
                  </p>
                  <p className="mt-1.5 pl-6 text-[12.5px] leading-relaxed text-ink-2">
                    {t(`${o.key}Body` as never)}
                  </p>
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
            {t("saveSettings")}
          </Button>
        </form>
      </Card>

      {/* Notifications */}
      <Card className="pb-4">
        <CardHeader
          icon={<BellRing className="size-4" />}
          title={t("notificationsTitle")}
          subtitle={t("notificationsSubtitle")}
        />

        <div className="px-4 pt-3">
          {!push.supported ? (
            <p className="rounded-[12px] bg-surface-2 p-3.5 text-[12.5px] leading-relaxed text-ink-2">
              {push.needsInstall
                ? t("needsInstall")
                : t("unsupported")}
            </p>
          ) : push.subscribed ? (
            <div className="flex items-center justify-between gap-3 rounded-[12px] bg-profit-soft p-3.5">
              <p className="text-[12.5px] font-semibold text-profit">
                {t("deviceWillReceive")}
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
                        ? { tone: "success", title: t("testSent") }
                        : { tone: "error", title: t("couldNotSend") },
                    );
                  }}
                >
                  {t("test")}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void push.disable()}>
                  {t("turnOff")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="rounded-[12px] border border-brand/25 bg-brand-soft p-3.5">
              <p className="text-[13px] font-semibold text-brand-ink">
                {t("notificationsOff")}
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
                  if (okay) toast({ tone: "success", title: t("notificationsOn") });
                }}
              >
                {t("turnThemOn")}
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
            label={t("onSale")}
            description={t("onSaleHint")}
          />
          <div className="h-px bg-line" />
          <Toggle
            checked={onOffline}
            onChange={setOnOffline}
            label={t("onOffline")}
            description={t("onOfflineHint")}
          />
          <div className="h-px bg-line" />
          <Toggle
            checked={onNote}
            onChange={setOnNote}
            label={t("onNote")}
            description={t("onNoteHint")}
          />
          <div className="h-px bg-line" />
          <Toggle
            checked={onVoid}
            onChange={setOnVoid}
            label={t("onVoid")}
          />

          <div className="pt-3">
            <Field
              label={t("saleMinLabel")}
              hint={t("saleMinHint", { zero: formatMoney(0) })}
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
            {t("saveNotifications")}
          </Button>
        </form>
      </Card>

      {/* This device */}
      <Card className="pb-4">
        <CardHeader
          icon={<Database className="size-4" />}
          title={t("deviceTitle")}
          subtitle={t("deviceSubtitle")}
        />
        <div className="space-y-3 px-4 pt-3">
          <div className="flex items-center justify-between gap-3 rounded-[12px] bg-surface-2 p-3.5">
            <div>
              <p className="text-[13px] font-semibold text-ink">{t("waitingToSend")}</p>
              <p className="nums mt-0.5 text-[12px] text-ink-3">
                {t("recordCount", { count: sync.pending })}
                {sync.quarantined > 0
                  ? t("rejectedSuffix", { count: sync.quarantined })
                  : ""}
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
              {t("sendNow")}
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
                  title: t("sendFirstTitle"),
                  body: t("sendFirstBody"),
                });
                return;
              }
              try {
                const keys = await caches.keys();
                await Promise.all(keys.filter((k) => k.startsWith("bm-")).map((k) => caches.delete(k)));
                toast({ tone: "success", title: t("cacheCleared"), body: t("reloading") });
                setTimeout(() => window.location.reload(), 700);
              } catch {
                toast({ tone: "error", title: t("couldNotClear") });
              }
            }}
          >
            {t("clearCache")}
          </Button>

          <p className="flex items-start gap-2 text-[11.5px] leading-relaxed text-ink-3">
            <Info className="mt-px size-3.5 shrink-0" />
            {t("clearNote")}
          </p>
        </div>
      </Card>
    </div>
  );
}
