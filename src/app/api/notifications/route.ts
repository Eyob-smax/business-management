import { NextResponse } from "next/server";
import { and, desc, eq, isNull, sql as dsql } from "drizzle-orm";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "not-signed-in" }, { status: 401 });

  const [items, unread] = await Promise.all([
    db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, user.id))
      .orderBy(desc(notifications.createdAt))
      .limit(40),
    db
      .select({ count: dsql<number>`count(*)::int` })
      .from(notifications)
      .where(and(eq(notifications.userId, user.id), isNull(notifications.readAt))),
  ]);

  return NextResponse.json(
    {
      unread: unread[0]?.count ?? 0,
      items: items.map((n) => ({
        id: n.id,
        kind: n.kind,
        title: n.title,
        body: n.body,
        url: n.url,
        readAt: n.readAt,
        createdAt: n.createdAt,
      })),
    },
    { headers: { "cache-control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "not-signed-in" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { action?: string; id?: string };

  if (body.action === "read-all") {
    await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.userId, user.id), isNull(notifications.readAt)));
    return NextResponse.json({ ok: true });
  }

  if (body.action === "read" && body.id) {
    await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.userId, user.id), eq(notifications.id, body.id)));
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "unknown-action" }, { status: 400 });
}
