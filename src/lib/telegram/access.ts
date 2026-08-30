import "server-only";

/**
 * Who the bot will talk to.
 *
 * This bot reads out revenue, cost and profit, so the allowlist is the whole
 * security boundary. A Telegram bot username is public and anyone can press
 * Start on it, which means the default has to be "refuse", never "allow".
 *
 * Identity lives in environment variables rather than in the database, because
 * it is deployment configuration and because it must not be editable from a
 * screen an attacker might reach.
 *
 *   TELEGRAM_OWNER_CHAT_ID     the owner. Always allowed. Gets the alerts.
 *   TELEGRAM_ALLOWED_CHAT_IDS  comma-separated extras (family, a group chat).
 *   TELEGRAM_DIGEST_CHAT_IDS   who receives the nightly summary. Defaults to
 *                              everyone allowed above.
 */

function parseIds(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(/[,;\s]+/)
    .map((v) => v.trim())
    // Chat IDs are integers; group IDs are negative.
    .filter((v) => /^-?\d+$/.test(v));
}

export function ownerChatId(): string | null {
  return parseIds(process.env.TELEGRAM_OWNER_CHAT_ID)[0] ?? null;
}

/** Every chat the bot will answer. Owner is always included. */
export function allowedChatIds(): string[] {
  const owner = ownerChatId();
  const extras = parseIds(process.env.TELEGRAM_ALLOWED_CHAT_IDS);
  return [...new Set([...(owner ? [owner] : []), ...extras])];
}

/** Who gets the nightly summary. Falls back to the full allowlist. */
export function digestChatIds(): string[] {
  const explicit = parseIds(process.env.TELEGRAM_DIGEST_CHAT_IDS);
  return explicit.length ? explicit : allowedChatIds();
}

/**
 * Note the closed default: with no allowlist configured the bot answers
 * nobody, rather than answering everybody.
 */
export function isAllowed(chatId: string | number): boolean {
  const allowed = allowedChatIds();
  if (allowed.length === 0) return false;
  return allowed.includes(String(chatId));
}

/** Guards the webhook itself, before any update is even parsed. */
export function webhookSecret(): string | null {
  return process.env.TELEGRAM_WEBHOOK_SECRET?.trim() || null;
}

export function telegramReadiness() {
  return {
    token: Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim()),
    webhookSecret: Boolean(webhookSecret()),
    owner: Boolean(ownerChatId()),
    allowedCount: allowedChatIds().length,
    digestCount: digestChatIds().length,
  };
}
