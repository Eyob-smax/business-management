"use client";
/**
 * Nightly summary settings.
 *
 * Telegram recipients are NOT editable here on purpose - they live in the
 * environment (see lib/telegram/access.ts), because the chat allowlist is also
 * the bot's entire security boundary and should not be changeable from a
 * screen. This card shows how many are configured so an admin can tell the
 * difference between "nobody set it up" and "it is working".
 */
import * as React from "react";
import { useActionState } from "react";
import {
  Bot,
  CircleCheck,
  Info,
  Mail,
  MessageCircle,
  Save,
  Send,
  Smartphone,
  TriangleAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { relativeTime } from "@/lib/dates";
import type { DigestSettings } from "@/lib/settings";
import { saveDigestSettings, sendDigestNow } from "@/app/actions/settings";
import type { ActionResult } from "@/app/actions/_result";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Field,
  Input,
  Select,
  Textarea,
  Toggle,
} from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";

export type ChannelReadiness = { telegram: boolean; email: boolean };

export type TelegramStatus = {
  token: boolean;
  webhookSecret: boolean;
  owner: boolean;
  allowedCount: number;
  digestCount: number;
};

export type DigestRun = {
  id: string;
  businessDate: string;
  channel: string;
  sentCount: number;
  failedCount: number;
  error: string | null;
  createdAt: string;
};

export function DigestSettingsCard({
  digest,
  readiness,
  telegram,
  runs,
  timezone,
}: {
  digest: DigestSettings;
  readiness: ChannelReadiness;
  telegram: TelegramStatus;
  runs: DigestRun[];
  timezone: string;
}) {
  const { toast } = useToast();
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(
    saveDigestSettings,
    null,
  );

  const [enabled, setEnabled] = React.useState(digest.enabled);
  const [skipEmpty, setSkipEmpty] = React.useState(digest.skipEmptyDays);
  const [channels, setChannels] = React.useState(digest.channels);
  const [sending, setSending] = React.useState(false);

  React.useEffect(() => {
    if (!state) return;
    toast(
      state.ok
        ? { tone: "success", title: state.message ?? "Saved" }
        : { tone: "error", title: state.error ?? "Could not save", duration: 8000 },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const setChannel = (key: keyof typeof channels, value: boolean) =>
    setChannels((prev) => ({ ...prev, [key]: value }));

  return (
    <Card className="pb-4">
      <CardHeader
        icon={<Send className="size-4" />}
        title="Nightly summary"
        subtitle="Revenue, cost, profit and the best dishes, sent every night"
      />

      <form action={action} className="space-y-4 px-4 pt-3">
        <input type="hidden" name="enabled" value={enabled ? "on" : ""} />
        <input type="hidden" name="skipEmptyDays" value={skipEmpty ? "on" : ""} />
        <input type="hidden" name="chPush" value={channels.push ? "on" : ""} />
        <input type="hidden" name="chTelegram" value={channels.telegram ? "on" : ""} />
        <input type="hidden" name="chEmail" value={channels.email ? "on" : ""} />

        <div className="rounded-[14px] border border-line px-3 py-1">
          <Toggle
            checked={enabled}
            onChange={setEnabled}
            label="Send a summary every night"
            description="One message with the day's takings, costs, profit and best sellers."
          />
          <div className="h-px bg-line" />
          <Toggle
            checked={skipEmpty}
            onChange={setSkipEmpty}
            label="Stay quiet on days with no sales"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Send at" hint={`Local time in ${timezone.replace(/_/g, " ")}`}>
            <Select name="hourLocal" defaultValue={String(digest.hourLocal)}>
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {h === 0 ? "Midnight" : `${String(h).padStart(2, "0")}:00`}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Dishes to name" hint="Best sellers listed">
            <Input
              name="topDishes"
              type="number"
              min={1}
              max={10}
              defaultValue={String(digest.topDishes)}
            />
          </Field>
        </div>

        <div className="space-y-2.5">
          <p className="text-[12px] font-bold tracking-[0.05em] text-ink-3 uppercase">
            Where to send it
          </p>

          <ChannelBlock
            icon={<Smartphone className="size-4" />}
            title="Phone notification"
            cost="Free"
            note="Goes to every admin who turned notifications on. No setup needed."
            available
            checked={channels.push}
            onChange={(v) => setChannel("push", v)}
          />

          <ChannelBlock
            icon={<MessageCircle className="size-4" />}
            title="Telegram"
            cost="Free, unlimited"
            note={
              telegram.digestCount > 0
                ? `Going to ${telegram.digestCount} chat${telegram.digestCount === 1 ? "" : "s"}. The same bot also answers questions on demand.`
                : "The main channel. Recipients are set in the environment, not here."
            }
            available={readiness.telegram}
            missing={
              !telegram.token
                ? "TELEGRAM_BOT_TOKEN"
                : "TELEGRAM_OWNER_CHAT_ID (or TELEGRAM_DIGEST_CHAT_IDS)"
            }
            checked={channels.telegram}
            onChange={(v) => setChannel("telegram", v)}
          />

          <ChannelBlock
            icon={<Mail className="size-4" />}
            title="Email"
            cost="Free up to 3,000/month"
            note="Optional, via Resend. Useful if you want a written record you can search later."
            available={readiness.email}
            missing="RESEND_API_KEY and DIGEST_EMAIL_FROM"
            checked={channels.email}
            onChange={(v) => setChannel("email", v)}
          >
            <Field label="Email addresses" hint="One per line.">
              <Textarea
                name="emails"
                rows={2}
                defaultValue={digest.emails.join("\n")}
                placeholder="owner@example.com"
              />
            </Field>
          </ChannelBlock>
        </div>

        <div className="flex gap-2.5">
          <Button
            type="submit"
            variant="primary"
            size="lg"
            block
            loading={pending}
            icon={<Save className="size-4" />}
          >
            Save
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="lg"
            loading={sending}
            icon={<Send className="size-4" />}
            onClick={async () => {
              setSending(true);
              const res = await sendDigestNow();
              setSending(false);
              toast(
                res.ok
                  ? { tone: "success", title: res.message ?? "Sent" }
                  : { tone: "error", title: res.error ?? "Could not send", duration: 9000 },
              );
            }}
          >
            Send now
          </Button>
        </div>

        <p className="flex items-start gap-2 text-[11.5px] leading-relaxed text-ink-3">
          <Info className="mt-px size-3.5 shrink-0" />
          &ldquo;Send now&rdquo; ignores the once-a-night rule so you can test it. The real send
          happens even with nobody in the app, and can only go out once per day per channel.
        </p>
      </form>

      {/* ---- the bot ---- */}
      <div className="mt-4 border-t border-line px-4 pt-4">
        <p className="flex items-center gap-2 text-[13px] font-bold text-ink">
          <Bot className="size-4 text-ink-3" />
          Telegram bot
        </p>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-2">
          The same bot answers questions any time: today&rsquo;s takings, the week, best dishes,
          costs, notes, what is sold out. It can only <strong>read</strong> — recording sales,
          prices, expenses and access all stay in this app.
        </p>

        <ul className="mt-3 space-y-1.5 text-[12px]">
          <StatusRow ok={telegram.token} label="Bot token" missing="TELEGRAM_BOT_TOKEN" />
          <StatusRow
            ok={telegram.webhookSecret}
            label="Webhook secret"
            missing="TELEGRAM_WEBHOOK_SECRET"
          />
          <StatusRow ok={telegram.owner} label="Owner chat" missing="TELEGRAM_OWNER_CHAT_ID" />
          <StatusRow
            ok={telegram.allowedCount > 0}
            label={`${telegram.allowedCount} chat${telegram.allowedCount === 1 ? "" : "s"} allowed to use the bot`}
            missing="TELEGRAM_ALLOWED_CHAT_IDS"
          />
        </ul>

        <p className="mt-2.5 text-[11.5px] leading-relaxed text-ink-3">
          Set up with{" "}
          <code className="rounded bg-surface-2 px-1 py-0.5">npm run telegram ids</code> then{" "}
          <code className="rounded bg-surface-2 px-1 py-0.5">
            npm run telegram setup https://your-app
          </code>
          .
        </p>
      </div>

      {runs.length > 0 ? (
        <div className="mt-4 border-t border-line px-4 pt-3">
          <p className="text-[12px] font-bold tracking-[0.05em] text-ink-3 uppercase">
            Recently sent
          </p>
          <ul className="mt-2 space-y-1.5">
            {runs.map((r) => (
              <li key={r.id} className="flex items-center gap-2 text-[12px]">
                {r.error ? (
                  <TriangleAlert className="size-3.5 shrink-0 text-loss" />
                ) : (
                  <CircleCheck className="size-3.5 shrink-0 text-profit" />
                )}
                <span className="font-semibold text-ink capitalize">{r.channel}</span>
                <span className="nums text-ink-3">{r.businessDate}</span>
                <span className="text-ink-3">
                  {r.sentCount} sent{r.failedCount > 0 ? `, ${r.failedCount} failed` : ""}
                </span>
                <span className="ml-auto shrink-0 text-ink-3">{relativeTime(r.createdAt)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}

function StatusRow({ ok, label, missing }: { ok: boolean; label: string; missing: string }) {
  return (
    <li className="flex items-start gap-2">
      {ok ? (
        <CircleCheck className="mt-px size-3.5 shrink-0 text-profit" />
      ) : (
        <TriangleAlert className="mt-px size-3.5 shrink-0 text-warn" />
      )}
      <span className={ok ? "text-ink-2" : "text-warn"}>
        {label}
        {!ok ? <> — set <code className="font-mono">{missing}</code></> : null}
      </span>
    </li>
  );
}

function ChannelBlock({
  icon,
  title,
  cost,
  note,
  available,
  missing,
  checked,
  onChange,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  cost: string;
  note: string;
  available: boolean;
  missing?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-[14px] border p-3.5 transition",
        checked && available ? "border-brand/40 bg-brand-soft/40" : "border-line",
        !available && "opacity-70",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-[13.5px] font-bold text-ink">
            <span className="text-ink-3">{icon}</span>
            {title}
            <Badge tone="profit">{cost}</Badge>
          </p>
          <p className="mt-1.5 text-[12px] leading-relaxed text-ink-2">{note}</p>
          {!available && missing ? (
            <p className="mt-1.5 text-[11.5px] leading-snug font-medium text-warn">
              Not available yet — set {missing} on the server.
            </p>
          ) : null}
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={checked}
          aria-label={`Use ${title}`}
          disabled={!available}
          onClick={() => onChange(!checked)}
          className={cn(
            "relative mt-0.5 h-7 w-12 shrink-0 rounded-full transition-colors duration-200",
            checked && available ? "bg-brand" : "bg-line-strong",
            !available && "cursor-not-allowed",
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 size-6 rounded-full bg-white shadow transition-transform duration-200",
              checked && available ? "translate-x-[1.4rem]" : "translate-x-0.5",
            )}
          />
        </button>
      </div>

      {checked && available && children ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}
