/**
 * Telegram bot setup helper.
 *
 *   npm run telegram whoami            -> check the token, show the bot's name
 *   npm run telegram ids               -> list chat IDs that have messaged the bot
 *   npm run telegram setup <base-url>  -> register the webhook + command menu
 *   npm run telegram info              -> what Telegram thinks the webhook is
 *   npm run telegram off               -> remove the webhook
 *
 * `ids` only works while no webhook is set (Telegram gives updates to one or
 * the other), so the usual order is: whoami -> ids -> put the IDs in
 * .env.local -> setup.
 */
import {
  deleteWebhook,
  getMe,
  getUpdates,
  getWebhookInfo,
  setMyCommands,
  setWebhook,
} from "../src/lib/telegram/api";
import { BOT_COMMANDS } from "../src/lib/telegram/bot";
import { allowedChatIds, ownerChatId, webhookSecret } from "../src/lib/telegram/access";

const command = (process.argv[2] ?? "").toLowerCase();
const argument = process.argv[3];

function requireToken() {
  if (!process.env.TELEGRAM_BOT_TOKEN?.trim()) {
    console.error(
      "\nTELEGRAM_BOT_TOKEN is not set in .env.local." +
        "\nCreate a bot: message @BotFather in Telegram, send /newbot, paste the token.\n",
    );
    process.exit(1);
  }
}

async function whoami() {
  requireToken();
  const me = await getMe();
  if (!me.ok || !me.result) {
    console.error(`\nTelegram refused the token: ${me.description}\n`);
    process.exit(1);
  }
  console.log(`\n  Bot: ${me.result.first_name} (@${me.result.username})`);
  console.log(`  Owner chat ID:   ${ownerChatId() ?? "(not set)"}`);
  console.log(`  Allowed chats:   ${allowedChatIds().join(", ") || "(none - the bot will answer nobody)"}`);
  console.log(`  Webhook secret:  ${webhookSecret() ? "set" : "(not set)"}\n`);
}

async function ids() {
  requireToken();
  const updates = await getUpdates();

  if (!updates.ok) {
    console.error(`\nCould not read updates: ${updates.description}`);
    console.error("If a webhook is already set, run `npm run telegram off` first.\n");
    process.exit(1);
  }

  const seen = new Map<number, string>();
  for (const u of updates.result ?? []) {
    const chat = u.message?.chat;
    if (!chat) continue;
    const label =
      chat.title ??
      [chat.first_name, chat.username ? `@${chat.username}` : ""].filter(Boolean).join(" ") ??
      chat.type;
    seen.set(chat.id, `${label} (${chat.type})`);
  }

  if (seen.size === 0) {
    console.log(
      "\n  No messages yet." +
        "\n  Open Telegram, find your bot, press Start, then run this again." +
        "\n  For a group: add the bot to the group and send any message there.\n",
    );
    return;
  }

  console.log("\n  Chat IDs that have messaged this bot:\n");
  for (const [id, label] of seen) {
    console.log(`    ${String(id).padEnd(16)} ${label}`);
  }
  console.log("\n  Put the owner's ID in TELEGRAM_OWNER_CHAT_ID,");
  console.log("  and any others in TELEGRAM_ALLOWED_CHAT_IDS (comma separated).\n");
}

async function setup() {
  requireToken();

  const secret = webhookSecret();
  if (!secret) {
    console.error(
      "\nTELEGRAM_WEBHOOK_SECRET is not set in .env.local." +
        "\nWithout it the webhook refuses everything, so the bot would never reply.\n",
    );
    process.exit(1);
  }

  if (!argument) {
    console.error(
      "\nGive me the public base URL of the deployed app, e.g." +
        "\n  npm run telegram setup https://your-app.vercel.app\n",
    );
    process.exit(1);
  }

  const base = argument.replace(/\/+$/, "");
  if (!base.startsWith("https://")) {
    // Telegram will not deliver to plain HTTP or to localhost.
    console.error("\nTelegram only delivers to a public https:// URL.\n");
    process.exit(1);
  }

  if (allowedChatIds().length === 0) {
    console.warn(
      "\n  Warning: no chat IDs are allowlisted, so the bot will answer nobody." +
        "\n  Run `npm run telegram ids` and fill in .env.local.\n",
    );
  }

  const url = `${base}/api/telegram/webhook`;
  const hook = await setWebhook(url, secret);
  if (!hook.ok) {
    console.error(`\nsetWebhook failed: ${hook.description}\n`);
    process.exit(1);
  }

  const menu = await setMyCommands(BOT_COMMANDS);

  console.log(`\n  Webhook set to ${url}`);
  console.log(`  Command menu: ${menu.ok ? "registered" : `failed - ${menu.description}`}`);
  console.log("\n  Send /today to the bot to check it.\n");
}

async function info() {
  requireToken();
  const res = await getWebhookInfo();
  if (!res.ok) {
    console.error(`\nFailed: ${res.description}\n`);
    process.exit(1);
  }
  console.log("");
  for (const [key, value] of Object.entries(res.result ?? {})) {
    console.log(`  ${key.padEnd(28)} ${JSON.stringify(value)}`);
  }
  console.log("");
}

async function off() {
  requireToken();
  const res = await deleteWebhook();
  console.log(res.ok ? "\n  Webhook removed.\n" : `\n  Failed: ${res.description}\n`);
}

async function main() {
  switch (command) {
    case "whoami":
      return whoami();
    case "ids":
      return ids();
    case "setup":
      return setup();
    case "info":
      return info();
    case "off":
      return off();
    default:
      console.log(
        [
          "",
          "  npm run telegram whoami            check the token",
          "  npm run telegram ids               list chat IDs that messaged the bot",
          "  npm run telegram setup <base-url>  register the webhook + command menu",
          "  npm run telegram info              inspect the current webhook",
          "  npm run telegram off               remove the webhook",
          "",
        ].join("\n"),
      );
  }
}

main().catch((err) => {
  console.error("\nFailed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
