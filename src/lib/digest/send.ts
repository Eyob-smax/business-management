import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { digestRuns } from "@/db/schema";
import { getSettings } from "@/lib/settings";
import { businessDateOf, type DayKey } from "@/lib/dates";
import { listAdminIds, sendPushToUsers } from "@/lib/push";
import { buildDigest, type DigestPayload } from "./build";
import { sendEmail, sendTelegram, type ChannelId, type ChannelResult } from "./channels";

/**
 * Sends the nightly summary and records what happened.
 *
 * Idempotency works the same way as the offline sync path: a UNIQUE index on
 * (module, business_date, channel) means a cron that fires twice, a retry
 * after a timeout, or somebody pressing "Send now" cannot produce two
 * identical 9pm messages. The row is claimed BEFORE the provider is called, so
 * two concurrent invocations cannot both get through.
 *
 * A channel that fails releases its claim, so the next run genuinely retries
 * rather than recording a permanent false success.
 */

export type DigestOutcome = {
  businessDate: DayKey;
  skipped: boolean;
  reason?: string;
  results: ChannelResult[];
  payload?: DigestPayload;
};

/** Try to claim (day, channel). False means somebody already sent this one. */
async function claim(businessDate: DayKey, channel: string, module: "restaurant" | "shop") {
  const rows = await db
    .insert(digestRuns)
    .values({ module, businessDate, channel })
    .onConflictDoNothing()
    .returning({ id: digestRuns.id });
  return rows[0]?.id ?? null;
}

async function finish(id: string, result: { sent: number; failed: number; error?: string; preview?: string }) {
  await db
    .update(digestRuns)
    .set({
      sentCount: result.sent,
      failedCount: result.failed,
      error: result.error ?? null,
      preview: result.preview ?? null,
    })
    .where(eq(digestRuns.id, id));
}

/** Give the slot back so a later run can retry this channel. */
async function release(id: string) {
  await db.delete(digestRuns).where(eq(digestRuns.id, id));
}

export async function sendDailyDigest({
  businessDate,
  module = "restaurant",
  force = false,
}: {
  /** Defaults to the trading day that has just ended. */
  businessDate?: DayKey;
  module?: "restaurant" | "shop";
  /** Ignore the already-sent guard and the empty-day rule (the Test button). */
  force?: boolean;
} = {}): Promise<DigestOutcome> {
  const { business, digest } = await getSettings();
  const day =
    businessDate ?? businessDateOf(new Date(), business.timezone, business.dayCutoffHour);

  if (!digest.enabled && !force) {
    return { businessDate: day, skipped: true, reason: "Daily summary is switched off.", results: [] };
  }

  const payload = await buildDigest(day, module);

  if (!payload.hasSales && digest.skipEmptyDays && !force) {
    return {
      businessDate: day,
      skipped: true,
      reason: "No sales today, and empty days are set to be skipped.",
      results: [],
      payload,
    };
  }

  const results: ChannelResult[] = [];

  /* ---- push (free, already built, no provider) ---- */
  if (digest.channels.push) {
    const result = await runChannel("push", day, module, force, async () => {
      const admins = await listAdminIds();
      if (admins.length === 0) {
        return { channel: "push" as ChannelId, configured: false, sent: 0, failed: 0, error: "No active admins." };
      }
      const res = await sendPushToUsers(admins, {
        title: payload.text.push.title,
        body: payload.text.push.body,
        url: "/admin",
        kind: "info",
        tag: `digest-${day}`,
      });
      return {
        channel: "push" as ChannelId,
        configured: true,
        sent: res.sent,
        failed: res.failed,
        preview: payload.text.push.body,
      };
    });
    if (result) results.push(result);
  }

  if (digest.channels.telegram) {
    // Recipients come from the environment, not from settings - see
    // lib/telegram/access.ts.
    const result = await runChannel("telegram", day, module, force, () =>
      sendTelegram(payload),
    );
    if (result) results.push(result);
  }

  if (digest.channels.email) {
    const result = await runChannel("email", day, module, force, () =>
      sendEmail(digest.emails, payload),
    );
    if (result) results.push(result);
  }


  return { businessDate: day, skipped: false, results, payload };
}

/**
 * Claim, send, record. Returns null when the channel was already sent today
 * (and this is not a forced test), which is the normal no-op case.
 */
async function runChannel(
  channel: ChannelId | "push",
  day: DayKey,
  module: "restaurant" | "shop",
  force: boolean,
  run: () => Promise<ChannelResult>,
): Promise<ChannelResult | null> {
  let claimId: string | null = null;

  if (!force) {
    claimId = await claim(day, channel, module);
    if (!claimId) return null; // already sent - the whole point of the index
  }

  let result: ChannelResult;
  try {
    result = await run();
  } catch (err) {
    result = {
      channel: channel as ChannelId,
      configured: true,
      sent: 0,
      failed: 0,
      error: err instanceof Error ? err.message : "unknown error",
    };
  }

  if (claimId) {
    // Nothing actually went out, so do not let the claim block tomorrow's retry.
    if (result.sent === 0) await release(claimId);
    else await finish(claimId, result);
  }

  return result;
}

/** Delivery history for the Settings screen. */
export async function recentDigestRuns(limit = 12) {
  return db
    .select()
    .from(digestRuns)
    .where(eq(digestRuns.module, "restaurant"))
    .orderBy(desc(digestRuns.createdAt))
    .limit(limit);
}

/** Was a given day already delivered on a given channel? */
export async function wasSent(day: DayKey, channel: string) {
  const rows = await db
    .select({ id: digestRuns.id })
    .from(digestRuns)
    .where(
      and(
        eq(digestRuns.businessDate, day),
        eq(digestRuns.channel, channel),
        eq(digestRuns.module, "restaurant"),
      ),
    )
    .limit(1);
  return rows.length > 0;
}
