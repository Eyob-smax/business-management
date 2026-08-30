import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { pushSubscriptions } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { sendPushToUsers, vapidPublicKey } from "@/lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const subscribeSchema = z.object({
  action: z.literal("subscribe"),
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().min(10), auth: z.string().min(4) }),
});

const unsubscribeSchema = z.object({
  action: z.literal("unsubscribe"),
  endpoint: z.string().url().max(1000),
});

const testSchema = z.object({ action: z.literal("test") });

const bodySchema = z.discriminatedUnion("action", [
  subscribeSchema,
  unsubscribeSchema,
  testSchema,
]);

/** Tells the client whether push is configured and whether this device is registered. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "not-signed-in" }, { status: 401 });

  const rows = await db
    .select({ endpoint: pushSubscriptions.endpoint })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, user.id));

  return NextResponse.json(
    {
      configured: Boolean(vapidPublicKey()),
      publicKey: vapidPublicKey(),
      devices: rows.length,
      endpoints: rows.map((r) => r.endpoint),
    },
    { headers: { "cache-control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "not-signed-in" }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid-body" }, { status: 400 });
  const body = parsed.data;

  if (body.action === "subscribe") {
    // One row per endpoint. Re-subscribing on the same device (or after the
    // browser rotates keys) updates in place and moves it to this user.
    await db
      .insert(pushSubscriptions)
      .values({
        userId: user.id,
        endpoint: body.endpoint,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
        userAgent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
      })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: {
          userId: user.id,
          p256dh: body.keys.p256dh,
          auth: body.keys.auth,
          failureCount: 0,
        },
      });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "unsubscribe") {
    await db
      .delete(pushSubscriptions)
      .where(
        and(
          eq(pushSubscriptions.endpoint, body.endpoint),
          eq(pushSubscriptions.userId, user.id),
        ),
      );
    return NextResponse.json({ ok: true });
  }

  const result = await sendPushToUsers([user.id], {
    title: "Notifications are working",
    body: "This is what a new sale will look like on your phone.",
    url: user.role === "admin" ? "/admin" : "/staff",
    kind: "info",
    tag: "test",
    urgent: true,
  });
  return NextResponse.json({ ok: result.sent > 0, ...result });
}
