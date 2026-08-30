import { Coins, Info, Receipt, TrendingUp, Wallet } from "lucide-react";
import type { Summary } from "@/lib/analytics";
import { formatMoney } from "@/lib/money";
import { deltaPct } from "@/lib/utils";
import { formatDayLabel, weekdayShort } from "@/lib/dates";
import { Card, CardHeader } from "@/components/ui/primitives";
import { CompositionBar, StatTile } from "@/components/ui/stat";
import { TrendChart, VIZ } from "@/components/charts/charts";
import { getTranslations } from "next-intl/server";

/**
 * The four numbers an owner actually wants, then the story behind them.
 *
 * Order is deliberate: revenue, cost, profit, margin. Profit is the headline
 * the app exists for, so it gets the tone colour and the sparkline.
 */
export async function SummaryCards({
  summary,
  previous,
  showTrend = true,
}: {
  summary: Summary;
  previous?: Summary | null;
  showTrend?: boolean;
}) {
  const t = await getTranslations("Summary");
  const revenueSpark = summary.days.map((d) => d.revenueCents);
  const profitSpark = summary.days.map((d) => d.profitCents);
  const multiDay = summary.days.length > 1;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2.5">
        <StatTile
          label={t("revenue")}
          icon={<Receipt className="size-3.5" />}
          valueCents={summary.revenueCents}
          sub={t("ordersItems", { orders: summary.orders, items: summary.items })}
          deltaPct={previous ? deltaPct(previous.revenueCents, summary.revenueCents) : undefined}
          spark={multiDay ? revenueSpark : undefined}
        />
        <StatTile
          label={t("totalCost")}
          icon={<Wallet className="size-3.5" />}
          valueCents={summary.totalCostCents}
          sub={t("costSplit", {
            food: formatMoney(summary.cogsCents, { compact: true }),
            running: formatMoney(summary.overheadCents, { compact: true }),
          })}
          deltaPct={previous ? deltaPct(previous.totalCostCents, summary.totalCostCents) : undefined}
          inverseDelta
        />
        <StatTile
          label={t("profit")}
          icon={<TrendingUp className="size-3.5" />}
          valueCents={summary.profitCents}
          tone="profit"
          sub={
            summary.profitCents >= 0
              ? t("afterCosts")
              : t("lossPeriod")
          }
          deltaPct={previous ? deltaPct(previous.profitCents, summary.profitCents) : undefined}
          spark={multiDay ? profitSpark : undefined}
        />
        <StatTile
          label={t("margin")}
          icon={<Coins className="size-3.5" />}
          value={`${summary.marginPct.toFixed(1)}%`}
          tone={summary.marginPct >= 0 ? "profit" : "loss"}
          sub={t("averageOrder", { amount: formatMoney(summary.avgOrderCents) })}
          deltaPct={previous ? deltaPct(previous.marginPct, summary.marginPct) : undefined}
        />
      </div>

      <Card className="p-4">
        <p className="mb-3 text-[12px] font-bold tracking-[0.05em] text-ink-3 uppercase">
          {t("whereMoneyWent")}
        </p>
        <CompositionBar
          totalCents={summary.revenueCents}
          segments={[
            { label: t("foodCost"), cents: summary.cogsCents, color: VIZ.COST },
            {
              label: t("runningCost"),
              cents: summary.overheadCents,
              color: "var(--color-viz-axis)",
            },
            {
              label: summary.profitCents >= 0 ? t("profit") : t("loss"),
              cents: Math.abs(summary.profitCents),
              color: summary.profitCents >= 0 ? VIZ.PROFIT : "var(--color-loss)",
            },
          ]}
        />

        {summary.usedOverride ? (
          <p className="mt-3.5 flex items-start gap-2 rounded-[12px] bg-info-soft px-3 py-2.5 text-[12px] leading-snug text-info">
            <Info className="mt-px size-3.5 shrink-0" />
            <span>
              {t("overrideNote", {
                amount: formatMoney(summary.overrideCostCents),
                estimate: formatMoney(summary.itemCostCents),
              })}
            </span>
          </p>
        ) : summary.costingMode === "item" && summary.overrideCostCents > 0 ? (
          <p className="mt-3.5 flex items-start gap-2 rounded-[12px] bg-warn-soft px-3 py-2.5 text-[12px] leading-snug text-warn">
            <Info className="mt-px size-3.5 shrink-0" />
            <span>{t("itemModeNote")}</span>
          </p>
        ) : null}
      </Card>

      {showTrend && multiDay ? (
        <Card className="pb-4">
          <CardHeader
            title={t("dayByDay")}
            subtitle={t("dayByDaySubtitle")}
          />
          <div className="px-3 pt-3">
            <TrendChart
              data={summary.days.map((d) => ({
                label:
                  summary.days.length > 40
                    ? d.day.slice(5)
                    : summary.days.length > 10
                      ? formatDayLabel(d.day, true)
                      : weekdayShort(d.day),
                revenueCents: d.revenueCents,
                costCents: d.totalCostCents,
                profitCents: d.profitCents,
              }))}
            />
          </div>
        </Card>
      ) : null}
    </div>
  );
}
