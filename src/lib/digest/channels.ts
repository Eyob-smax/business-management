import "server-only";
import { sendMessage } from "@/lib/telegram/api";
import { digestChatIds } from "@/lib/telegram/access";
import { isMailConfigured, missingMailConfig, sendMail } from "@/lib/mail";
import type { DigestPayload } from "./build";

/**
 * Delivery channels for the nightly summary.
 *
 * Two, both free:
 *
 *   telegram  free forever, no card, no monthly cap, works well on Ethiopian
 *             networks, and the same bot answers questions on demand
 *   email     optional, over SMTP (nodemailer), useful if you want a written
 *             record you can search later
 *
 * SMS was removed deliberately: no provider offers a free tier to Ethiopian
 * numbers - every one is trial credit and then per-message billing - and
 * Telegram does the same job for nothing.
 *
 * Recipients for Telegram come from environment variables, not the database,
 * so chat identity is deployment configuration rather than something editable
 * from a screen.
 */

export type ChannelId = "telegram" | "email";

export type ChannelResult = {
  channel: ChannelId;
  configured: boolean;
  sent: number;
  failed: number;
  error?: string;
  /** What was actually delivered, trimmed, for the history table. */
  preview?: string;
};

const unconfigured = (channel: ChannelId, error: string): ChannelResult => ({
  channel,
  configured: false,
  sent: 0,
  failed: 0,
  error,
});

/* ---------------------------------------------------------------- telegram */

/**
 * Recipients are TELEGRAM_DIGEST_CHAT_IDS, falling back to the full allowlist,
 * so "everyone who can use the bot also gets the nightly summary" is the
 * default and needs no extra configuration.
 */
export async function sendTelegram(payload: DigestPayload): Promise<ChannelResult> {
  if (!process.env.TELEGRAM_BOT_TOKEN?.trim()) {
    return unconfigured("telegram", "TELEGRAM_BOT_TOKEN is not set.");
  }

  const chatIds = digestChatIds();
  if (chatIds.length === 0) {
    return unconfigured(
      "telegram",
      "No chat IDs. Set TELEGRAM_OWNER_CHAT_ID (and optionally TELEGRAM_DIGEST_CHAT_IDS).",
    );
  }

  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const chatId of chatIds) {
    const res = await sendMessage(chatId, payload.text.telegramHtml);
    if (res.ok) sent++;
    else {
      failed++;
      errors.push(`${chatId}: ${res.error}`);
    }
  }

  return {
    channel: "telegram",
    configured: true,
    sent,
    failed,
    preview: payload.text.telegramHtml.slice(0, 900),
    error: errors.length ? errors.join("; ").slice(0, 300) : undefined,
  };
}

/* ------------------------------------------------------------------- email */

/**
 * Email over SMTP, through the same nodemailer transport the password reset
 * uses. Optional - useful if you want a written record you can search later.
 */
export async function sendEmail(
  recipients: string[],
  payload: DigestPayload,
): Promise<ChannelResult> {
  if (!isMailConfigured()) {
    return unconfigured("email", `Email is not set up (${missingMailConfig().join(", ")}).`);
  }
  if (recipients.length === 0) {
    return unconfigured("email", "No email addresses saved in Settings.");
  }

  const sent = await sendMail({
    to: recipients,
    subject: payload.text.emailSubject,
    html: payload.text.emailHtml,
    text: payload.text.plain,
  });

  if (!sent.ok) {
    return {
      channel: "email",
      configured: true,
      sent: 0,
      failed: recipients.length,
      error: sent.error,
    };
  }

  return {
    channel: "email",
    configured: true,
    sent: recipients.length,
    failed: 0,
    preview: payload.text.emailSubject,
  };
}

/** Which channels have working credentials right now, for the Settings screen. */
export function channelReadiness() {
  return {
    telegram: Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim()) && digestChatIds().length > 0,
    email: isMailConfigured(),
  };
}
