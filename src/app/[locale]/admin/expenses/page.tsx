import type { Metadata } from "next";
import { Link } from "@/i18n/routing";
import { Settings2 } from "lucide-react";
import { listExpenseCategories, listExpenses } from "@/lib/expenses";
import { getBusinessSettings } from "@/lib/settings";
import { getExpenseBreakdown, getSummary } from "@/lib/analytics";
import { parseRange, type RangeSearchParams } from "@/lib/range-params";
import { formatMoney } from "@/lib/money";
import { Card, CardHeader } from "@/components/ui/primitives";
import { RankBar } from "@/components/ui/stat";
import { RangePicker } from "@/components/admin/range-picker";
import { ExpenseManager } from "@/components/admin/expense-manager";
import { NeedsInternet } from "@/components/pwa/needs-internet";
import { getTranslations } from 'next-intl/server';

/** The browser tab, in the reader's own language. */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Meta");
  return { title: t("moneyOut") };
}

// Costing labels are now handled in translations.

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<RangeSearchParams>;
}) {
  const params = await searchParams;
  const range = parseRange(params);

  const [expenses, categories, business, breakdown, summary] = await Promise.all([
    listExpenses(),
    listExpenseCategories(),
    getBusinessSettings(),
    getExpenseBreakdown(range),
    getSummary(range),
  ]);
  const t = await getTranslations('AdminExpenses');
  const o = await getTranslations('Offline');

  const totalAllocated = breakdown.reduce((t, b) => t + b.allocatedCents, 0);
  const peak = Math.max(1, ...breakdown.map((b) => b.allocatedCents));

  return (
    <div className="space-y-5">
      <header className="px-1">
        <h1 className="text-[20px] leading-tight font-bold tracking-tight text-ink">{t('title')}</h1>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-3">
          {t('description')}
        </p>
      </header>

      <NeedsInternet message={o('needsInternetExpenses')}>
        <ExpenseManager
          expenses={expenses}
          categories={categories}
          costingMode={business.costingMode}
        />
      </NeedsInternet>

      {/* What it added up to over the selected period */}
      <div className="space-y-3 pt-2">
        <RangePicker grain={range.grain} anchor={range.from} label={range.label} />

        <Card className="pb-4">
          <CardHeader
            title={t('spentIn', { label: range.label.toLowerCase() })}
            subtitle={t('spentSubtitle', { allocated: formatMoney(totalAllocated), estimated: formatMoney(summary.itemCostCents) })}
          />

          {breakdown.length === 0 ? (
            <p className="px-4 pt-1 text-[13px] text-ink-3">
              {t('noExpenses')}
            </p>
          ) : (
            <ul className="space-y-3 px-4 pt-3">
              {breakdown.map((b) => (
                <li key={`${b.category}-${b.isOverride}`}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-[13.5px] font-semibold text-ink capitalize">
                      {b.category}
                      {b.isOverride ? (
                        <span className="ml-1.5 text-[11px] font-medium text-info">
                          {t('replacesEstimates')}
                        </span>
                      ) : null}
                    </span>
                    <span className="nums shrink-0 text-[13.5px] font-bold text-ink">
                      {formatMoney(b.allocatedCents)}
                    </span>
                  </div>
                  <RankBar
                    className="mt-1.5"
                    pct={(b.allocatedCents / peak) * 100}
                    color="var(--color-viz-cost)"
                  />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-4">
          <p className="text-[12px] font-bold tracking-[0.05em] text-ink-3 uppercase">
            {t('howProfitCalculated')}
          </p>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink">
            {business.costingMode === 'auto' ? t('costingAuto') : business.costingMode === 'item' ? t('costingItem') : t('costingPeriod')}
          </p>
          <Link
            href="/admin/settings"
            className="mt-2.5 inline-flex items-center gap-1.5 text-[12.5px] font-bold text-brand"
          >
            <Settings2 className="size-3.5" />
            {t('changeInSettings')}
          </Link>
        </Card>
      </div>
    </div>
  );
}
