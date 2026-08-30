import { Link } from "@/i18n/routing";
import { useTranslations } from "next-intl";
import { ChevronRight } from "lucide-react";
import type { ItemPerf } from "@/lib/analytics";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Badge, EmptyState } from "@/components/ui/primitives";
import { RankBar } from "@/components/ui/stat";
import { VIZ } from "@/components/charts/charts";

/**
 * Ranked dishes. A horizontal ranked list beats a chart here: the names are
 * long, there can be thirty of them, and the numbers need to be readable -
 * which is also the direct-labelling the light palette requires.
 */
export function ItemPerformanceList({
  items,
  metric = "revenue",
  limit,
  lowMarginPct = 15,
  href,
  emptyBody,
}: {
  items: ItemPerf[];
  /** Which measure decides the ranking and the bar length. */
  metric?: "revenue" | "profit" | "qty";
  limit?: number;
  lowMarginPct?: number;
  /** When set, each row links to the analytics page filtered to that dish. */
  href?: (item: ItemPerf) => string;
  emptyBody?: string;
}) {
  const t = useTranslations("AdminReports");
  const sorted = [...items].sort((a, b) =>
    metric === "profit"
      ? b.profitCents - a.profitCents
      : metric === "qty"
        ? b.qty - a.qty
        : b.revenueCents - a.revenueCents,
  );
  const shown = limit ? sorted.slice(0, limit) : sorted;

  const peak = Math.max(
    1,
    ...shown.map((i) =>
      metric === "profit" ? Math.abs(i.profitCents) : metric === "qty" ? i.qty : i.revenueCents,
    ),
  );

  if (shown.length === 0) {
    return (
      <EmptyState
        title={t("noSalesPeriod")}
        body={emptyBody ?? t("noSalesBody")}
      />
    );
  }

  return (
    <ul className="divide-y divide-line">
      {shown.map((item, index) => {
        const value =
          metric === "profit"
            ? item.profitCents
            : metric === "qty"
              ? item.qty
              : item.revenueCents;

        const row = (
          <div className="flex items-center gap-3 py-3">
            <span className="nums w-5 shrink-0 text-[12px] font-bold text-ink-3">
              {index + 1}
            </span>
            <span className="text-[20px] leading-none" aria-hidden>
              {item.emoji}
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <p className="truncate text-[14px] font-semibold text-ink">{item.name}</p>
                <p className="nums shrink-0 text-[14px] font-bold text-ink">
                  {metric === "qty"
                    ? t("soldQty", { count: item.qty })
                    : formatMoney(value, { compact: true })}
                </p>
              </div>

              <RankBar
                className="mt-1.5"
                pct={(Math.abs(value) / peak) * 100}
                color={metric === "profit" ? VIZ.PROFIT : VIZ.REVENUE}
              />

              <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11.5px] text-ink-3">
                <span className="nums">{t("soldQty", { count: item.qty })}</span>
                <span aria-hidden>-</span>
                <span className="nums">
                  {t("revenueIn", { amount: formatMoney(item.revenueCents, { compact: true }) })}
                </span>
                <span aria-hidden>-</span>
                <span
                  className={cn(
                    "nums font-semibold",
                    item.profitCents >= 0 ? "text-profit" : "text-loss",
                  )}
                >
                  {t("profitSuffix", {
                    amount: formatMoney(item.profitCents, { compact: true, sign: true }),
                  })}
                </span>
                {item.marginPct < lowMarginPct ? (
                  <Badge tone="loss">{t("marginSuffix", { pct: item.marginPct.toFixed(0) })}</Badge>
                ) : (
                  <span className="nums">
                    {t("marginSuffix", { pct: item.marginPct.toFixed(0) })}
                  </span>
                )}
              </div>
            </div>

            {href && item.menuItemId ? (
              <ChevronRight className="size-4 shrink-0 text-ink-3" />
            ) : null}
          </div>
        );

        // A dish deleted from the menu has no page to link to.
        const link = href && item.menuItemId ? href(item) : null;

        return (
          <li key={item.key}>
            {link ? (
              <Link href={link} className="block">
                {row}
              </Link>
            ) : (
              row
            )}
          </li>
        );
      })}
    </ul>
  );
}
