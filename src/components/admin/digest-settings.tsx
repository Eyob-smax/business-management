"use client";
/**
 * Nightly summary settings.
 *
 * Each channel says plainly what it costs, because "free SMS" is the thing
 * people assume exists and it does not for Ethiopian numbers. A channel whose
 * server credentials are missing is shown as unavailable with the exact
 * variable name to set, rather than letting an admin switch on something that
 * would quietly fail at 9pm.
 */
import * as React from "react";
import { useActionState } from "react";
import { CircleCheck, Info, Mail, MessageCircle, Save, Send, Smartphone, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { relativeTime } from "@/lib/dates";
import type { DigestSettings } from "@/lib/settings";
import { saveDigestSettings, sendDigestNow } from "@/app/actions/settings";
import type { ActionResult } from "@/app/actions/_result";
import { Badge, Button, Card, CardHeader, Field, Input, Select, Textarea, Toggle } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";

export type ChannelReadiness = { telegram: boolean; email: boolean; sms: boolean };

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
  runs,
  timezone,
}: {
  digest: DigestSettings;
  readiness: ChannelReadiness;
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
        : { tone: "error", title: state.error ?? "Could not save", duration: 7000 },
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
        <input type="hidden" name="chSms" value={channels.sms ? "on" : ""} />

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

        {/* ---- channels ---- */}
        <div className="space-y-2.5">
          <p className="text-[12px] font-bold tracking-[0.05em] text-ink-3 uppercase">
            Where to send it
          </p>

          <ChannelBlock
            icon={<Smartphone className="size-4" />}
            title="Phone notification"
            cost="Free"
            costTone="profit"
            note="Goes to every admin who turned notifications on. Costs nothing and needs no setup."
            available
            checked={channels.push}
            onChange={(v) => setChannel("push", v)}
          />

          <ChannelBlock
            icon={<MessageCircle className="size-4" />}
            title="Telegram"
            cost="Free, unlimited"
            costTone="profit"
            note="The best option here: no card, no monthly cap, and it works well on Ethiopian networks. Create a bot with @BotFather, put the token in TELEGRAM_BOT_TOKEN, then each person messages the bot once so you can get their chat ID."
            available={readiness.telegram}
            missing="TELEGRAM_BOT_TOKEN"
            checked={channels.telegram}
            onChange={(v) => setChannel("telegram", v)}
          >
            <Field label="Chat IDs" hint="One per line. A negative number is a group.">
              <Textarea
                name="telegramChatIds"
                rows={2}
                defaultValue={digest.telegramChatIds.join("\n")}
                placeholder="123456789"
              />
            </Field>
          </ChannelBlock>

          <ChannelBlock
            icon={<Mail className="size-4" />}
            title="Email"
            cost="Free up to 3,000/month"
            costTone="profit"
            note="Uses Resend. Good if you want a written record you can search later."
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

          <ChannelBlock
            icon={<Send className="size-4" />}
            title="SMS"
            cost="Not free"
            costTone="warn"
            note="There is no free tier for SMS to Ethiopian numbers from any provider. Twilio's signup credit covers roughly 250 messages, then it is about 6 US cents each. Telegram above does the same job for nothing."
            available={readiness.sms}
            missing="TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM_NUMBER"
            checked={channels.sms}
            onChange={(v) => setChannel("sms", v)}
          >
            <Field label="Phone numbers" hint="With country code, one per line.">
              <Textarea
                name="phones"
                rows={2}
                defaultValue={digest.phones.join("\n")}
                placeholder="+251911234567"
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
          &ldquo;Send now&rdquo; ignores the once-a-night rule so you can test it. The real 9pm
          send happens even if nobody has the app open, and can only go out once per day per
          channel.
        </p>
      </form>

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

function ChannelBlock({
  icon,
  title,
  cost,
  costTone,
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
  costTone: "profit" | "warn";
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
            <Badge tone={costTone}>{cost}</Badge>
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
