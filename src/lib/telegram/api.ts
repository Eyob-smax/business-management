import "server-only";

/**
 * Thin wrapper over the Telegram Bot API.
 *
 * Everything the app sends or answers goes through here, so retries, error
 * shapes and HTML escaping are decided once.
 */

const API = "https://api.telegram.org";

export function botToken(): string | null {
  return process.env.TELEGRAM_BOT_TOKEN?.trim() || null;
}

export const isTelegramConfigured = () => Boolean(botToken());

type TelegramResponse<T> = { ok: boolean; result?: T; description?: string };

async function call<T>(method: string, body: unknown): Promise<TelegramResponse<T>> {
  const token = botToken();
  if (!token) return { ok: false, description: "TELEGRAM_BOT_TOKEN is not set." };

  try {
    const res = await fetch(`${API}/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    return (await res.json()) as TelegramResponse<T>;
  } catch (err) {
    return {
      ok: false,
      description: err instanceof Error ? err.message : "network error",
    };
  }
}

/** Telegram's HTML mode understands very few tags; everything else must be escaped. */
export function escapeHtml(input: string): string {
  return input.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export type InlineButton = { text: string; callback_data: string };

export type SendOptions = {
  /** Rows of buttons shown under the message. */
  keyboard?: InlineButton[][];
  disablePreview?: boolean;
  silent?: boolean;
};

/**
 * Telegram rejects messages over 4096 characters, so long reports are split on
 * line boundaries rather than truncated - a report that stops mid-sentence is
 * worse than two messages.
 */
function chunk(text: string, limit = 3900): string[] {
  if (text.length <= limit) return [text];

  const out: string[] = [];
  let current = "";
  for (const line of text.split("\n")) {
    if (current.length + line.length + 1 > limit) {
      out.push(current);
      current = "";
    }
    current += (current ? "\n" : "") + line;
  }
  if (current) out.push(current);
  return out;
}

export async function sendMessage(
  chatId: string | number,
  html: string,
  options: SendOptions = {},
): Promise<{ ok: boolean; error?: string }> {
  const parts = chunk(html);

  for (const [index, part] of parts.entries()) {
    const isLast = index === parts.length - 1;
    const res = await call<unknown>("sendMessage", {
      chat_id: chatId,
      text: part,
      parse_mode: "HTML",
      link_preview_options: { is_disabled: options.disablePreview ?? true },
      disable_notification: options.silent ?? false,
      // Buttons belong on the final part only.
      ...(isLast && options.keyboard
        ? { reply_markup: { inline_keyboard: options.keyboard } }
        : {}),
    });

    if (!res.ok) return { ok: false, error: res.description ?? "send failed" };
  }

  return { ok: true };
}

/** Replaces the text of an existing message - used by the inline buttons. */
export async function editMessage(
  chatId: string | number,
  messageId: number,
  html: string,
  options: SendOptions = {},
): Promise<{ ok: boolean; error?: string }> {
  // An edit cannot be split, so anything long is sent as a fresh message.
  if (html.length > 3900) return sendMessage(chatId, html, options);

  const res = await call<unknown>("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text: html,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    ...(options.keyboard ? { reply_markup: { inline_keyboard: options.keyboard } } : {}),
  });

  // "message is not modified" means the user tapped the same button twice.
  if (!res.ok && !/not modified/i.test(res.description ?? "")) {
    return { ok: false, error: res.description ?? "edit failed" };
  }
  return { ok: true };
}

/** Stops the spinner on a tapped inline button. */
export async function answerCallback(callbackId: string, text?: string) {
  await call("answerCallbackQuery", {
    callback_query_id: callbackId,
    ...(text ? { text, show_alert: false } : {}),
  });
}

/* ------------------------------------------------------------ webhook admin */

export async function setWebhook(url: string, secret: string) {
  return call<boolean>("setWebhook", {
    url,
    secret_token: secret,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: true,
  });
}

export async function deleteWebhook() {
  return call<boolean>("deleteWebhook", { drop_pending_updates: true });
}

export async function getWebhookInfo() {
  return call<Record<string, unknown>>("getWebhookInfo", {});
}

export async function getMe() {
  return call<{ id: number; username?: string; first_name?: string }>("getMe", {});
}

/** Used by the setup script to discover chat IDs before a webhook is set. */
export async function getUpdates() {
  return call<
    {
      message?: {
        chat: { id: number; type: string; title?: string; username?: string; first_name?: string };
      };
    }[]
  >("getUpdates", {});
}

/** Makes the command list appear in Telegram's own menu button. */
export async function setMyCommands(commands: { command: string; description: string }[]) {
  return call<boolean>("setMyCommands", { commands });
}
