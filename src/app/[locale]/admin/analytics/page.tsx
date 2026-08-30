import type { Metadata } from "next";
import { Link } from "@/i18n/routing";
import {
  Clock3,
  CreditCard,
  Download,
  Ghost,
  Layers,
  TrendingDown,
  Trophy,
  Users,
} from "lucide-react";
import {
  getCategoryBreakdown,
  getDeadStock,
  getHourlyPattern,
  getItemPerformance,
  getItemPerformanceWindows,
  getPaymentMix,
  getStaffPerformance,
  getSummary,
  getWeekdayPattern,
} from "@/lib/analytics";
import { previousRange, rangeFor, today } from "@/lib/dates";
import { parseRange, type RangeSearchParams } from "@/lib/range-params";
import { getBusinessSettings } from "@/lib/settings";
import { formatMoney } from "@/lib/money";
import { labelFor } from "@/lib/payments";
import { getLocale, getTranslations } from "next-intl/server";
import { Avatar, Card, CardHeader, EmptyState } from "@/components/ui/primitives";
import { RankBar } from "@/components/ui/stat";
import { HourlyChart, WeekdayChart } from "@/components/charts/charts";
import { RangePicker } from "@/components/admin/range-picker";
import { SummaryCards } from "@/components/admin/summary-cards";
import { ItemMetricSwitcher } from "@/components/admin/item-metric-switcher";
import { TimelineCompare } from "@/components/admin/timeline-compare";

/** The browser tab, in the reader's own language. */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Meta");
  return { title: t("reports") };
}

/** DateRange -> the {from,to} pair getItemPerformanceWindows wants. */
const pick = (r: { from: string; to: string }) => ({ from: r.from, to: r.to });

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<RangeSearchParams>;
}) {
  const locale = await getLocale();
  const t = await getTranslations("AdminReports");
  const params = await searchParams;
  const range = parseRange(params);
  const anchor = today();

  // Two waves rather than one burst: Neon's HTTP endpoint occasionally refuses
  // a connection when a dozen queries open at once, and a report page that
  // fails to render is worse than one that takes another 80ms.
  const [summary, previous, items, business, timelines] = await Promise.all([
    getSummary(range),
    getSummary(previousRange(range)),
    getItemPerformance(range, "restaurant", 200),
    getBusinessSettings(),
    getItemPerformanceWindows(
      [
        { label: t("today"), ...pick(rangeFor("day", anchor)) },
        { label: t("thisWeek"), ...pick(rangeFor("week", anchor)) },
        { label: t("thisMonth"), ...pick(rangeFor("month", anchor)) },
        { label: t("thisYear"), ...pick(rangeFor("year", anchor)) },
      ],
      "restaurant",
      12,
    ),
  ]);

  const [categoryMix, hourly, weekday, staff, payments, dead] = await Promise.all([
    getCategoryBreakdown(range),
    getHourlyPattern(range),
    getWeekdayPattern(range),
    getStaffPerformance(range),
    getPaymentMix(range),
    getDeadStock(range),
  ]);

  const catPeak = Math.max(1, ...categoryMix.map((c) => c.revenueCents));
  const payTotal = Math.max(1, payments.reduce((t, p) => t + p.revenueCents, 0));
  const worst = [...items]
    .filter((i) => i.qty >= 3)
    .sort((a, b) => a.marginPct - b.marginPct)
    .slice(0, 5);

  return (
    <div className="space-y-5">
      <header className="flex items-start justify-between gap-3 px-1">
        <div>
          <h1 className="text-[20px] leading-tight font-bold tracking-tight text-ink">{t("pageTitle")}</h1>
          <p className="mt-1 text-[13px] text-ink-3">
            {t("comparedWith", { label: previous.range.label.toLowerCase() })}
          </p>
        </div>
        <Link
          href={`/api/export?grain=${range.grain}&on=${range.from}`}
          prefetch={false}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-[12.5px] font-bold text-ink-2"
        >
          <Download className="size-3.5" />
          CSV
        </Link>
      </header>

      <RangePicker grain={range.grain} anchor={range.from} label={range.label} />

      <SummaryCards summary={summary} previous={previous} />

      {/* Dishes */}
      <Card className="pb-1">
        <CardHeader
          icon={<Trophy className="size-4" />}
          title={t("everyDish")}
          subtitle={t("dishesSold", { count: items.length })}
        />
        <div className="pt-3">
          <ItemMetricSwitcher items={items} lowMarginPct={business.lowMarginPct} limit={40} />
        </div>
      </Card>

      {/* Cross-timeframe comparison */}
      <TimelineCompare
        slices={[t("today"), t("thisWeek"), t("thisMonth"), t("thisYear")].map((label) => ({
          label,
          items: timelines[label] ?? [],
        }))}
      />

      {/* Thin margins */}
      {worst.length > 0 ? (
        <Card className="pb-4">
          <CardHeader
            icon={<TrendingDown className="size-4" />}
            title={t("thinnest")}
            subtitle={t("thinnestSubtitle")}
          />
          <ul className="mt-2 divide-y divide-line px-4">
            {worst.map((i) => (
              <li key={i.key} className="flex items-center gap-3 py-2.5">
                <span className="text-[18px]" aria-hidden>
                  {i.emoji}
                </span>
                <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-ink">
                  {i.name}
                </span>
                <span className="nums text-[12.5px] text-ink-3">
                  {t("sold", { count: i.qty })}
                </span>
                <span
                  className={`nums w-14 text-right text-[13px] font-bold ${
                    i.marginPct < business.lowMarginPct ? "text-loss" : "text-ink"
                  }`}
                >
                  {i.marginPct.toFixed(0)}%
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {/* When money comes in */}
      <Card className="pb-4">
        <CardHeader
          icon={<Clock3 className="size-4" />}
          title={t("busiest")}
          subtitle={t("busiestSubtitle")}
        />
        <div className="px-3 pt-3">
          <HourlyChart data={hourly} />
        </div>
      </Card>

      {range.grain !== "day" ? (
        <Card className="pb-4">
          <CardHeader
            title={t("bestDays")}
            subtitle={t("bestDaysSubtitle")}
          />
          <div className="px-3 pt-3">
            <WeekdayChart data={weekday} />
          </div>
        </Card>
      ) : null}

      {/* Categories */}
      <Card className="pb-4">
        <CardHeader icon={<Layers className="size-4" />} title={t("byGroup")} />
        {categoryMix.length === 0 ? (
          <EmptyState title={t("nothingSoldYet")} className="py-8" />
        ) : (
          <ul className="mt-2 space-y-3 px-4">
            {categoryMix.map((c) => {
              const margin = c.revenueCents ? (c.profitCents / c.revenueCents) * 100 : 0;
              return (
                <li key={c.category}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-[13.5px] font-semibold text-ink">
                      {c.category}
                    </span>
                    <span className="nums shrink-0 text-[13.5px] font-bold text-ink">
                      {formatMoney(c.revenueCents, { compact: true })}
                    </span>
                  </div>
                  <RankBar className="mt-1.5" pct={(c.revenueCents / catPeak) * 100} />
                  <p className="nums mt-1 text-[11.5px] text-ink-3">
                    {t("keptShare", {
                      qty: c.qty,
                      kept: formatMoney(c.profitCents, { compact: true }),
                      pct: margin.toFixed(0),
                    })}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* Staff */}
      {staff.length > 0 ? (
        <Card className="pb-3">
          <CardHeader icon={<Users className="size-4" />} title={t("byPerson")} />
          <ul className="mt-1 divide-y divide-line px-4">
            {staff.map((s) => (
              <li key={s.staffId ?? s.name} className="flex items-center gap-3 py-3">
                <Avatar emoji={s.avatar} name={s.name} size={32} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-semibold text-ink">{s.name}</p>
                  <p className="nums text-[11.5px] text-ink-3">
                    {t("personLine", {
                      orders: s.orders,
                      items: s.items,
                      average: formatMoney(s.avgOrderCents),
                    })}
                  </p>
                </div>
                <p className="nums text-[13.5px] font-bold text-ink">
                  {formatMoney(s.revenueCents, { compact: true })}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {/* Payment mix */}
      {payments.length > 0 ? (
        <Card className="pb-4">
          <CardHeader icon={<CreditCard className="size-4" />} title={t("howPaid")} />
          <ul className="mt-2 space-y-2.5 px-4">
            {payments.map((p) => (
              <li key={p.method}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[13.5px] font-semibold text-ink">
                    {labelFor(p.method, locale)}
                  </span>
                  <span className="nums text-[13px] text-ink-2">
                    {formatMoney(p.revenueCents, { compact: true })}
                    <span className="ml-1.5 text-ink-3">
                      {Math.round((p.revenueCents / payTotal) * 100)}%
                    </span>
                  </span>
                </div>
                <RankBar className="mt-1.5" pct={(p.revenueCents / payTotal) * 100} />
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {/* Dead stock */}
      {dead.length > 0 ? (
        <Card className="pb-4">
          <CardHeader
            icon={<Ghost className="size-4" />}
            title={t("nothingSold")}
            subtitle={t("nothingSoldSubtitle", { count: dead.length })}
          />
          <div className="mt-2 flex flex-wrap gap-1.5 px-4">
            {dead.map((d) => (
              <span
                key={d.id}
                className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 text-[12.5px] text-ink-2"
              >
                <span aria-hidden>{d.emoji}</span>
                {d.name}
              </span>
            ))}
          </div>
        </Card>
      ) : null}

      <p className="pb-2 text-center text-[11.5px] leading-relaxed text-ink-3">
        {t("footnote")}
      </p>
    </div>
  );
}
