import { NextResponse } from "next/server";
import { AccessError, AuthError, requireWriteAccess } from "@/lib/auth";
import { WRITE_BLOCKED_CODE } from "@/lib/access";
import { ingestBatch, syncRequestSchema } from "@/lib/sync-server";

/**
 * The only write endpoint the offline queue talks to.
 *
 * It runs on the Node runtime (scrypt, web-push) and is never cached.
 *
 * Three refusals, three different meanings for the device:
 *   401 not signed in    -> keep the queue, ask the person to sign in again
 *   403 write-blocked    -> keep the queue, tell them an admin paused them
 *   5xx server trouble   -> keep the queue, back off, try later
 *
 * None of them ever cause data loss: nothing leaves the outbox without an
 * explicit per-operation verdict.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  // Access is re-read from the database here rather than trusted from the
  // session cookie, so an admin pausing a phone takes effect on its very next
  // sync instead of whenever the 120-day cookie expires.
  let user;
  try {
    user = await requireWriteAccess();
  } catch (err) {
    if (err instanceof AccessError) {
      return NextResponse.json(
        { error: err.code, code: WRITE_BLOCKED_CODE, message: err.message },
        { status: 403, headers: { "cache-control": "no-store" } },
      );
    }
    if (err instanceof AuthError) {
      return NextResponse.json(
        { error: "not-signed-in" },
        { status: 401, headers: { "cache-control": "no-store" } },
      );
    }
    throw err;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid-json" }, { status: 400 });
  }

  const parsed = syncRequestSchema.safeParse(body);
  if (!parsed.success) {
    // The envelope itself is wrong - this is a bug, not bad user data, so say
    // so loudly rather than quietly quarantining a whole batch.
    return NextResponse.json(
      { error: "invalid-batch", detail: parsed.error.issues.slice(0, 5) },
      { status: 400 },
    );
  }

  const { ops } = parsed.data;
  if (ops.length === 0) {
    return NextResponse.json(
      { results: [], serverTime: new Date().toISOString(), applied: 0, duplicates: 0, retry: 0, rejected: 0 },
      { headers: { "cache-control": "no-store" } },
    );
  }

  try {
    const outcome = await ingestBatch(ops, user);
    return NextResponse.json(outcome, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    console.error("[sync] batch failed", err);
    // Whole-batch failure: report retry for every op so nothing is dropped.
    return NextResponse.json(
      {
        results: ops.map((o) => ({
          clientId: o.clientId,
          kind: o.kind,
          verdict: "retry" as const,
          reason: "Server could not process the batch",
        })),
        serverTime: new Date().toISOString(),
        applied: 0,
        duplicates: 0,
        retry: ops.length,
        rejected: 0,
      },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
