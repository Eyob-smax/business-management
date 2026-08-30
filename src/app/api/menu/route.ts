import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getMenuSnapshot } from "@/lib/menu";

/**
 * Menu snapshot for the device cache.
 *
 * The till renders from IndexedDB, not from this response - the fetch only
 * refreshes that cache. That is what lets the sell screen open and work with
 * no network at all, days after the last successful load.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "not-signed-in" }, { status: 401 });

  const snapshot = await getMenuSnapshot("restaurant");
  return NextResponse.json(snapshot, { headers: { "cache-control": "no-store" } });
}
