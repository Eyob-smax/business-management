import type { Metadata } from "next";
import { Link } from "@/i18n/routing";
import { notFound } from "next/navigation";
import { Pencil, TrendingDown, TrendingUp } from "lucide-react";
import { getItemPerformanceWindows, getItemTrend } from "@/lib/analytics";
import { getMenuItemById } from "@/lib/menu";
import { getBusinessSettings } from "@/lib/settings";
import { addDays, rangeFor, today } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Badge, Card, CardHeader, Row } from "@/components/ui/primitives";
import { ItemTrendChart } from "@/components/charts/charts";

export const metadata: Metadata = { title: "Dish" };

/**
 * One dish, across every timeframe.
 *
 * The per-plate cost estimate is the only per-dish cost information that
 * exists, so this page is always estimate-based - it says so, rather than
 * pretending it knows the real cost of one plate on a Tuesday.
 */
export default async function DishPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const item = await getMenuItemById(id);
  if (!item) notFound();

  const anchor = today();
  const trendRange = { from: addDays(anchor, -29), to: anchor, grain: "day" as const, label: "" };

  const [business, trend, windows] = await Promise.all([
    getBusinessSettings(),
    getItemTrend(item.id, trendRange),
    getItemPerformanceWindows(
      (["day", "week", "month", "year"] as const).map((g) => {
        const r = rangeFor(g, anchor);
        return { label: g, from: r.from, to: r.to };
      }),
      "restaurant",
      500,
    ),
  ]);

  const unitProfit = item.priceCents - item.estCostCents;
  const unitMargin = item.priceCents ? (unitProfit / item.priceCents) * 100 : 0;
  const low = unitMargin < business.lowMarginPct;

  const slices = (["day", "week", "month", "year"] as const).map((g) => {
    const list = windows[g] ?? [];
    const found = list.find((i) => i.menuItemId === item.id);
    return {
      key: g,
      label: { day: "Today", week: "This week", month: "This month", year: "This year" }[g],
      qty: found?.qty ?? 0,
      revenueCents: found?.revenueCents ?? 0,
      profitCents: found?.profitCents ?? 0,
      rank: found ? list.findIndex((i) => i.menuItemId === item.id) + 1 : null,
      of: list.length,
    };
  });

  const soldInTrend = trend.reduce((t, d) => t + d.qty, 0);
  const bestDay = trend.reduce((best, d) => (d.qty > best.qty ? d : best), trend[0] ?? { day: "", qty: 0, revenueCents: 0, costCents: 0 });

  return (
    <div className="space-y-4">
      <header className="flex items-start gap-3 px-1">
        <span className="text-[38px] leading-none" aria-hidden>
          {item.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-[20px] leading-tight font-bold tracking-tight text-ink">
            {item.name}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[12.5px] text-ink-3">
            {item.categoryName ?? "No group"} - sold by the {item.unit}
            {item.isArchived ? <Badge tone="neutral">off the menu</Badge> : null}
            {!item.isAvailable && !item.isArchived ? <Badge tone="warn">sold out</Badge> : null}
          </p>
        </div>
        <Link
          href="/admin/menu"
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-[12.5px] font-bold text-ink-2"
        >
          <Pencil className="size-3.5" />
          Edit
        </Link>
      </header>

      {/* Unit economics */}
      <Card className="p-4">
        <p className="text-[12px] font-bold tracking-[0.05em] text-ink-3 uppercase">
          Per {item.unit}
        </p>
        <div className="mt-2">
          <Row label="Customer pays" value={formatMoney(item.priceCents)} />
          <Row label="Your cost estimate" value={formatMoney(item.estCostCents)} />
          <div className="mt-1 border-t border-line pt-1">
            <Row
              label="You keep"
              value={`${formatMoney(unitProfit)}  (${unitMargin.toFixed(0)}%)`}
              tone={low ? "loss" : "profit"}
              bold
            />
          </div>
        </div>
        {low ? (
          <p className="mt-2.5 flex items-start gap-2 rounded-[12px] bg-loss-soft px-3 py-2.5 text-[12px] leading-snug text-loss">
            <TrendingDown className="mt-px size-3.5 shrink-0" />
            Below your {business.lowMarginPct}% target. Either the price is too low or the recipe
            costs more than it should.
          </p>
        ) : null}
      </Card>

      {/* Across timeframes */}
      <Card className="pb-4">
        <CardHeader
          title="How it is doing"
          subtitle="Ranked against every other dish, by money in"
        />
        <div className="mt-2 divide-y divide-line px-4">
          {slices.map((s) => (
            <div key={s.key} className="flex items-center gap-3 py-3">
              <span className="w-24 shrink-0 text-[12.5px] font-semibold text-ink-2">
                {s.label}
              </span>
              <span className="nums flex-1 text-[12.5px] text-ink-3">
                {s.qty > 0 ? `${s.qty} sold` : "none sold"}
              </span>
              <span className="nums w-20 text-right text-[13px] font-bold text-ink">
                {formatMoney(s.revenueCents, { compact: true })}
              </span>
              <span
                className={cn(
                  "nums w-16 shrink-0 text-right text-[12px] font-bold",
                  s.rank && s.rank <= 3 ? "text-profit" : "text-ink-3",
                )}
              >
                {s.rank ? `#${s.rank}/${s.of}` : "-"}
              </span>
            </div>
          ))}
        </div>
      </Card>

      {/* 30-day trend */}
      <Card className="pb-4">
        <CardHeader
          icon={<TrendingUp className="size-4" />}
          title="Last 30 days"
          subtitle={
            soldInTrend > 0
              ? `${soldInTrend} sold - best day was ${bestDay.day} with ${bestDay.qty}`
              : "Nothing sold in the last 30 days"
          }
        />
        <div className="px-3 pt-3">
          <ItemTrendChart data={trend} />
        </div>
      </Card>

      <p className="pb-2 text-center text-[11.5px] leading-relaxed text-ink-3">
        Every number here uses the price and cost that applied when each plate was sold, so
        changing the price today never rewrites the past.
      </p>
    </div>
  );
}
