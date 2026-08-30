/**
 * Web Push delivery.
 *
 * Every push is mirrored into the `notifications` table first, so the admin
 * still sees it in the in-app bell even if the OS dropped the push, the phone
 * was off, or notification permission was never granted. The push is the
 * convenience; the row is the record.
 *
 * Bursts are collapsed at the batch level: one synced batch of sales produces
 * a single "3 new sales - Br 1,240" push rather than three buzzes, which is
 * what makes the offline-then-reconnect case bearable.
 */
import "server-only";
import webpush from "web-push";
import { eq, inArray, and, ne } from "drizzle-orm";
import { db } from "@/db";
import { pushSubscriptions, notifications, users } from "@/db/schema";

let configured = false;

function configure(): boolean {
  if (configured) return true;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:admin@example.com",
    publicKey,
    privateKey,
  );
  configured = true;
  return true;
}

export type PushPayload = {
  title: string;
  body: string;
  /** Deep link opened when the notification is tapped. */
  url?: string;
  /** Notifications sharing a tag replace each other instead of stacking. */
  tag?: string;
  kind?: "sale" | "note" | "void" | "sync" | "info" | "alert";
  data?: Record<string, unknown>;
  /** Buzz the phone. Off for quiet informational pushes. */
  urgent?: boolean;
};

/** Deliver to every device belonging to these users, and log a bell entry each. */
export async function sendPushToUsers(userIds: string[], payload: PushPayload) {
  if (userIds.length === 0) return { sent: 0, failed: 0, recorded: 0 };

  // 1. Durable record first - this must not depend on push succeeding.
  const recorded = await db
    .insert(notifications)
    .values(
      userIds.map((userId) => ({
        userId,
        kind: payload.kind ?? "info",
        title: payload.title,
        body: payload.body,
        url: payload.url ?? null,
        data: payload.data ?? null,
      })),
    )
    .returning({ id: notifications.id });

  if (!configure()) return { sent: 0, failed: 0, recorded: recorded.length };

  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(inArray(pushSubscriptions.userId, userIds));

  if (subs.length === 0) return { sent: 0, failed: 0, recorded: recorded.length };

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url ?? "/admin",
    tag: payload.tag ?? payload.kind ?? "bm",
    kind: payload.kind ?? "info",
    urgent: payload.urgent ?? false,
    data: payload.data ?? {},
    at: Date.now(),
  });

  let sent = 0;
  let failed = 0;
  const dead: string[] = [];

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
          { TTL: 60 * 60 * 24, urgency: payload.urgent ? "high" : "normal" },
        );
        sent++;
        await db
          .update(pushSubscriptions)
          .set({ lastSuccessAt: new Date(), failureCount: 0 })
          .where(eq(pushSubscriptions.id, s.id));
      } catch (err: unknown) {
        failed++;
        const status = (err as { statusCode?: number })?.statusCode;
        // 404/410 mean the browser threw the subscription away for good.
        if (status === 404 || status === 410) dead.push(s.id);
        else {
          await db
            .update(pushSubscriptions)
            .set({ failureCount: s.failureCount + 1 })
            .where(eq(pushSubscriptions.id, s.id));
        }
      }
    }),
  );

  if (dead.length) {
    await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, dead));
  }

  return { sent, failed, recorded: recorded.length };
}

export async function listAdminIds(): Promise<string[]> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.role, "admin"), ne(users.accessLevel, "blocked")));
  return rows.map((r) => r.id);
}

/** Notify every active admin. The main entry point for staff-triggered events. */
export async function notifyAdmins(payload: PushPayload, exceptUserId?: string) {
  const ids = (await listAdminIds()).filter((id) => id !== exceptUserId);
  return sendPushToUsers(ids, payload);
}

export const vapidPublicKey = () => process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
