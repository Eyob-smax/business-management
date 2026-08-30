import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { sendDailyDigest } from "@/lib/digest/send";
import { getSettings } from "@/lib/settings";
import { hourOf } from "@/lib/dates";

/**
 * Nightly summary trigger.
 *
 * Called by a scheduler (Vercel Cron, cron-job.org, or anything that can make
 * an HTTP request). Safe to call as often as you like: the send path claims a
 * unique (day, channel) row before contacting any provider, so extra calls are
 * no-ops rather than duplicate messages.
 *
 * Auth: `Authorization: Bearer <CRON_SECRET>`, or `?key=<CRON_SECRET>` for
 * schedulers that cannot set headers. Vercel Cron sends the bearer form
 * automatically when CRON_SECRET is set as an environment variable.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Fanning out to several providers can outlast the default limit. */
export const maxDuration = 60;

function authorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;

  // Without a secret configured the endpoint is closed, not open. An unguarded
  // trigger would let anyone spend the SMS budget.
  if (!secret) return false;

  const url = new URL(request.url);
  const supplied =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    url.searchParams.get("key") ??
    "";

  const a = Buffer.from(supplied);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function handle(request: Request) {
  if (!authorised(request)) {
    return NextResponse.json(
      {
        error: process.env.CRON_SECRET
          ? "bad-secret"
          : "CRON_SECRET is not set on the server, so this endpoint is disabled.",
      },
      { status: 401, headers: { "cache-control": "no-store" } },
    );
  }

  const url = new URL(request.url);
  const { business, digest } = await getSettings();

  /**
   * Schedulers work in UTC and free plans often only allow a coarse schedule,
   * so the endpoint is happy to be called more often than needed and decides
   * for itself whether it is late enough locally. `force=1` skips the check
   * for manual runs, and an explicit `?date=` backfills a specific day.
   */
  const force = url.searchParams.get("force") === "1";
  const explicitDate = url.searchParams.get("date") ?? undefined;

  if (!force && !explicitDate) {
    const localHour = hourOf(new Date(), business.timezone);
    if (localHour < digest.hourLocal) {
      return NextResponse.json(
        {
          skipped: true,
          reason: `It is ${localHour}:00 in ${business.timezone}; the summary goes out at ${digest.hourLocal}:00.`,
        },
        { headers: { "cache-control": "no-store" } },
      );
    }
  }

  try {
    const outcome = await sendDailyDigest({
      businessDate: explicitDate,
      force: url.searchParams.get("resend") === "1",
    });

    return NextResponse.json(
      {
        businessDate: outcome.businessDate,
        skipped: outcome.skipped,
        reason: outcome.reason,
        results: outcome.results.map((r) => ({
          channel: r.channel,
          configured: r.configured,
          sent: r.sent,
          failed: r.failed,
          error: r.error,
        })),
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (err) {
    console.error("[digest] failed", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "digest failed" },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }
}

export const GET = handle;
export const POST = handle;
