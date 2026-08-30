import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { handleUpdate, type TelegramUpdate } from "@/lib/telegram/bot";
import { webhookSecret } from "@/lib/telegram/access";

/**
 * Telegram webhook.
 *
 * Two layers of protection, because this URL is necessarily public:
 *
 *  1. `secret_token`, registered with setWebhook and returned by Telegram in
 *     the X-Telegram-Bot-Api-Secret-Token header. Anything without it is
 *     turned away before the body is even parsed.
 *  2. The chat allowlist in lib/telegram/access.ts, checked per update, so a
 *     stranger who somehow got here still learns nothing about the business.
 *
 * It always answers 200. Telegram retries any non-2xx, and a poison update
 * that throws forever would wedge the whole bot behind it.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function secretMatches(request: Request): boolean {
  const expected = webhookSecret();
  // No secret configured means the bot is not set up; refuse rather than open.
  if (!expected) return false;

  const supplied = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (!secretMatches(request)) {
    return NextResponse.json({ ok: false }, { status: 401, headers: { "cache-control": "no-store" } });
  }

  let update: TelegramUpdate;
  try {
    update = (await request.json()) as TelegramUpdate;
  } catch {
    return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  }

  try {
    await handleUpdate(update);
  } catch (err) {
    // handleUpdate already swallows its own errors; this is belt and braces so
    // Telegram is never told to retry.
    console.error("[telegram] webhook", err);
  }

  return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}

/** A plain GET is a convenient "is this deployed?" check. */
export async function GET() {
  return NextResponse.json(
    { ok: true, hint: "Telegram posts here. Configure with: npm run telegram setup <url>" },
    { headers: { "cache-control": "no-store" } },
  );
}
