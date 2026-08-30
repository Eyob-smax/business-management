import { NextResponse } from "next/server";
import { sql } from "@/db";
import { getActiveUser } from "@/lib/auth";
import { getBusinessSettings } from "@/lib/settings";
import { businessDateOf } from "@/lib/dates";

/**
 * The signed-in person's own sales for one trading day.
 *
 * "My sales" used to read only the device's IndexedDB ledger, which meant
 * signing in on a second phone showed an empty history - the sales were safe
 * in the database, but invisible. This endpoint is the durable half: the
 * screen merges it with whatever is still queued locally.
 *
 * Scoped to the caller. A staff member can only ever see their own rows here;
 * everybody's sales live behind the admin day log.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getActiveUser();
  if (!user) return NextResponse.json({ error: "not-signed-in" }, { status: 401 });

  const url = new URL(request.url);
  const business = await getBusinessSettings();

  const requested = url.searchParams.get("date");
  const date =
    requested && /^\d{4}-\d{2}-\d{2}$/.test(requested)
      ? requested
      : businessDateOf(new Date(), business.timezone, business.dayCutoffHour);

  const rows = (await sql`
    SELECT
      s.client_id, s.sold_at, s.status, s.payment_method,
      s.total_cents, s.total_cost_cents, s.discount_cents, s.item_count,
      s.table_label, s.customer_note,
      to_char(s.business_date, 'YYYY-MM-DD') AS business_date,
      COALESCE(
        json_agg(
          json_build_object(
            'name', si.name_snapshot,
            'emoji', si.emoji_snapshot,
            'qty', si.qty,
            'unitPriceCents', si.unit_price_cents,
            'unitCostCents', si.unit_cost_cents
          ) ORDER BY si.name_snapshot
        ) FILTER (WHERE si.id IS NOT NULL),
        '[]'::json
      ) AS lines
    FROM sales s
    LEFT JOIN sale_items si ON si.sale_id = s.id
    WHERE s.staff_id = ${user.id}::uuid
      AND s.business_date = ${date}::date
      AND s.module = 'restaurant'
    GROUP BY s.id
    ORDER BY s.sold_at DESC
    LIMIT 300
  `) as Record<string, unknown>[];

  const n = (v: unknown) => (v == null ? 0 : Number(v));

  return NextResponse.json(
    {
      businessDate: date,
      staffName: user.name,
      sales: rows.map((r) => ({
        clientId: String(r.client_id),
        soldAt: new Date(String(r.sold_at)).toISOString(),
        businessDate: String(r.business_date),
        totalCents: n(r.total_cents),
        costCents: n(r.total_cost_cents),
        discountCents: n(r.discount_cents),
        itemCount: n(r.item_count),
        paymentMethod: String(r.payment_method),
        tableLabel: (r.table_label as string) ?? null,
        customerNote: (r.customer_note as string) ?? null,
        // A voided sale still belongs in the person's own history, labelled.
        status: String(r.status) === "void" ? ("void" as const) : ("synced" as const),
        lines: (r.lines ?? []) as {
          name: string;
          emoji: string;
          qty: number;
          unitPriceCents: number;
          unitCostCents: number;
        }[],
      })),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
