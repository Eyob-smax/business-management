import { getSessionUser } from "@/lib/auth";
import { getRecentSales, getSummary, getItemPerformance } from "@/lib/analytics";
import { parseRange } from "@/lib/range-params";
import { formatDayLabel } from "@/lib/dates";

/**
 * CSV export of a period, so the numbers can leave the app - a spreadsheet, an
 * accountant, a backup on someone's laptop. Three sections in one file: daily
 * totals, every order, and per-dish performance.
 *
 * Money is written in major units with two decimals, because that is what a
 * spreadsheet expects.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const money = (cents: number) => (cents / 100).toFixed(2);

/** RFC-4180-ish escaping: quote anything containing a comma, quote or newline. */
function cell(value: unknown): string {
  const s = value == null ? "" : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const row = (values: unknown[]) => values.map(cell).join(",");

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user || user.role !== "admin") {
    return new Response("Not allowed", { status: 403 });
  }

  const url = new URL(request.url);
  const range = parseRange({
    grain: url.searchParams.get("grain") ?? undefined,
    on: url.searchParams.get("on") ?? undefined,
  });

  const [summary, sales, items] = await Promise.all([
    getSummary(range),
    getRecentSales(range, "restaurant", 5000),
    getItemPerformance(range, "restaurant", 500),
  ]);

  const lines: string[] = [];

  lines.push(row([`${summary.range.label} - ${range.from} to ${range.to}`]));
  lines.push("");

  lines.push(row(["SUMMARY"]));
  lines.push(row(["Revenue", money(summary.revenueCents)]));
  lines.push(row(["Food cost", money(summary.cogsCents)]));
  lines.push(row(["Running cost", money(summary.overheadCents)]));
  lines.push(row(["Total cost", money(summary.totalCostCents)]));
  lines.push(row(["Profit", money(summary.profitCents)]));
  lines.push(row(["Margin %", summary.marginPct.toFixed(1)]));
  lines.push(row(["Orders", summary.orders]));
  lines.push(row(["Items sold", summary.items]));
  lines.push(row(["Costing basis", summary.costingMode]));
  lines.push("");

  lines.push(row(["DAILY TOTALS"]));
  lines.push(
    row([
      "Date",
      "Day",
      "Orders",
      "Items",
      "Revenue",
      "Discounts",
      "Food cost",
      "Running cost",
      "Profit",
    ]),
  );
  for (const d of summary.days) {
    lines.push(
      row([
        d.day,
        formatDayLabel(d.day, true),
        d.orders,
        d.items,
        money(d.revenueCents),
        money(d.discountCents),
        money(d.cogsCents),
        money(d.overheadCents),
        money(d.profitCents),
      ]),
    );
  }
  lines.push("");

  lines.push(row(["ORDERS"]));
  lines.push(
    row([
      "Business date",
      "Recorded at",
      "Reached database",
      "Staff",
      "Status",
      "Payment",
      "Table",
      "Items",
      "Revenue",
      "Discount",
      "Est. food cost",
      "Est. profit",
      "Lines",
      "Note",
    ]),
  );
  for (const s of sales) {
    lines.push(
      row([
        s.businessDate,
        s.soldAt,
        s.syncedAt,
        s.staffName,
        s.status,
        s.paymentMethod,
        s.tableLabel ?? "",
        s.itemCount,
        money(s.totalCents),
        money(s.discountCents),
        money(s.totalCostCents),
        money(s.totalCents - s.totalCostCents),
        s.lines.map((l) => `${l.qty}x ${l.name}`).join("; "),
        s.customerNote ?? "",
      ]),
    );
  }
  lines.push("");

  lines.push(row(["BY DISH"]));
  lines.push(
    row(["Dish", "Group", "Sold", "Revenue", "Est. cost", "Est. profit", "Margin %", "Share of revenue %"]),
  );
  for (const i of items) {
    lines.push(
      row([
        i.name,
        i.category ?? "",
        i.qty,
        money(i.revenueCents),
        money(i.costCents),
        money(i.profitCents),
        i.marginPct.toFixed(1),
        i.revenueSharePct.toFixed(1),
      ]),
    );
  }

  // BOM so Excel opens the file as UTF-8 and Amharic/emoji survive.
  const body = "﻿" + lines.join("\r\n");
  const filename = `restaurant-${range.grain}-${range.from}.csv`;

  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
