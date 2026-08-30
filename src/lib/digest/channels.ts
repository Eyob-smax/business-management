import "server-only";
import type { DigestPayload } from "./build";

/**
 * Delivery channels for the nightly summary.
 *
 * Each one is a plain function with the same shape, so `send.ts` does not care
 * which are configured. Credentials come from environment variables; a channel
 * with no credentials reports itself unconfigured instead of failing at
 * midnight.
 *
 * ── On "free" ──────────────────────────────────────────────────────────────
 * Telegram is the only one of these that is genuinely free forever: no card,
 * no per-message cost, no monthly cap, and it is widely used in Ethiopia.
 * Email free tiers are real but capped per month. SMS to Ethiopian numbers has
 * no free tier anywhere - every provider is trial credit and then per-message
 * billing - so the SMS channel exists for people who accept that cost, and the
 * app never pretends otherwise.
 */

export type ChannelId = "telegram" | "email" | "sms";

export type ChannelResult = {
  channel: ChannelId;
  configured: boolean;
  sent: number;
  failed: number;
  error?: string;
  /** What was actually delivered, trimmed, for the history table. */
  preview?: string;
};

const ok = (channel: ChannelId, sent: number, failed: number, preview?: string): ChannelResult => ({
  channel,
  configured: true,
  sent,
  failed,
  preview,
});

const unconfigured = (channel: ChannelId, error: string): ChannelResult => ({
  channel,
  configured: false,
  sent: 0,
  failed: 0,
  error,
});

/* ---------------------------------------------------------------- telegram */

/**
 * Telegram Bot API. Free, unlimited, no card.
 *
 * Setup: message @BotFather, /newbot, copy the token into TELEGRAM_BOT_TOKEN.
 * Each recipient sends the bot one message (or adds it to a family group);
 * their chat id then appears from getUpdates, and goes in Settings.
 */
export async function sendTelegram(
  chatIds: string[],
  payload: DigestPayload,
): Promise<ChannelResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return unconfigured("telegram", "TELEGRAM_BOT_TOKEN is not set.");
  if (chatIds.length === 0) {
    return unconfigured("telegram", "No Telegram chat IDs saved in Settings.");
  }

  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const chatId of chatIds) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: payload.text.telegramHtml,
          parse_mode: "HTML",
          disable_web_page_preview: true,
        }),
      });

      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        description?: string;
      };

      if (res.ok && body.ok) {
        sent++;
      } else {
        failed++;
        errors.push(`${chatId}: ${body.description ?? res.status}`);
      }
    } catch (err) {
      failed++;
      errors.push(`${chatId}: ${err instanceof Error ? err.message : "network error"}`);
    }
  }

  return {
    ...ok("telegram", sent, failed, payload.text.telegramHtml.slice(0, 900)),
    error: errors.length ? errors.join("; ").slice(0, 300) : undefined,
  };
}

/* ------------------------------------------------------------------- email */

/**
 * Email via Resend. Free tier is 3,000 messages a month / 100 a day, which is
 * far more than one nightly summary needs.
 *
 * RESEND_API_KEY plus DIGEST_EMAIL_FROM (a verified sender, e.g.
 * "Business Manager <reports@yourdomain.com>"). Without a verified domain
 * Resend only delivers to your own account address.
 */
export async function sendEmail(
  recipients: string[],
  payload: DigestPayload,
): Promise<ChannelResult> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.DIGEST_EMAIL_FROM;

  if (!key) return unconfigured("email", "RESEND_API_KEY is not set.");
  if (!from) return unconfigured("email", "DIGEST_EMAIL_FROM is not set.");
  if (recipients.length === 0) {
    return unconfigured("email", "No email addresses saved in Settings.");
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: recipients,
        subject: payload.text.emailSubject,
        html: payload.text.emailHtml,
        text: payload.text.sms,
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return {
        channel: "email",
        configured: true,
        sent: 0,
        failed: recipients.length,
        error: `Resend ${res.status}: ${detail.slice(0, 200)}`,
      };
    }

    return ok("email", recipients.length, 0, payload.text.emailSubject);
  } catch (err) {
    return {
      channel: "email",
      configured: true,
      sent: 0,
      failed: recipients.length,
      error: err instanceof Error ? err.message : "network error",
    };
  }
}

/* --------------------------------------------------------------------- sms */

/**
 * SMS via Twilio's REST API.
 *
 * Deliberately the least-recommended channel: there is no free tier for
 * Ethiopian numbers. Twilio's $15 signup credit covers roughly 250 messages at
 * their Ethiopia rate, so a single nightly recipient runs free for about eight
 * months and then costs real money. Trial accounts can only send to verified
 * numbers and prefix every message.
 *
 * Any Twilio-compatible gateway works by pointing TWILIO_API_BASE elsewhere.
 */
export async function sendSms(
  phones: string[],
  payload: DigestPayload,
): Promise<ChannelResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  const base = process.env.TWILIO_API_BASE || "https://api.twilio.com";

  if (!sid || !token) return unconfigured("sms", "TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN are not set.");
  if (!from) return unconfigured("sms", "TWILIO_FROM_NUMBER is not set.");
  if (phones.length === 0) return unconfigured("sms", "No phone numbers saved in Settings.");

  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const to of phones) {
    try {
      const res = await fetch(`${base}/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: "POST",
        headers: {
          authorization: `Basic ${auth}`,
          "content-type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ To: to, From: from, Body: payload.text.sms }),
      });

      if (res.ok) {
        sent++;
      } else {
        failed++;
        const detail = (await res.json().catch(() => ({}))) as { message?: string };
        errors.push(`${to}: ${detail.message ?? res.status}`);
      }
    } catch (err) {
      failed++;
      errors.push(`${to}: ${err instanceof Error ? err.message : "network error"}`);
    }
  }

  return {
    ...ok("sms", sent, failed, payload.text.sms.slice(0, 400)),
    error: errors.length ? errors.join("; ").slice(0, 300) : undefined,
  };
}

/** Which channels have working credentials right now, for the Settings screen. */
export function channelReadiness() {
  return {
    telegram: Boolean(process.env.TELEGRAM_BOT_TOKEN),
    email: Boolean(process.env.RESEND_API_KEY && process.env.DIGEST_EMAIL_FROM),
    sms: Boolean(
      process.env.TWILIO_ACCOUNT_SID &&
        process.env.TWILIO_AUTH_TOKEN &&
        process.env.TWILIO_FROM_NUMBER,
    ),
  };
}
