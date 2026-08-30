import type { Metadata } from "next";
import { Link } from "@/i18n/routing";
import { ArrowRight, MessageSquare, Plus, Trophy, Users } from "lucide-react";
import {
  getItemPerformance,
  getStaffPerformance,
  getSummary,
} from "@/lib/analytics";
import { previousRange } from "@/lib/dates";
import { parseRange, type RangeSearchParams } from "@/lib/range-params";
import { getBusinessSettings } from "@/lib/settings";
import { listRecentNotes } from "@/lib/notes";
import { formatMoney } from "@/lib/money";
import { relativeTime } from "@/lib/dates";
import { Avatar, Card, CardHeader, SectionTitle } from "@/components/ui/primitives";
import { RangePicker } from "@/components/admin/range-picker";
import { SummaryCards } from "@/components/admin/summary-cards";
import { ItemPerformanceList } from "@/components/admin/item-performance-list";
import { getTranslations } from 'next-intl/server';

export const metadata: Metadata = { title: "Home" };

export default async function AdminHome({
  searchParams,
}: {
  searchParams: Promise<RangeSearchParams>;
}) {
  const params = await searchParams;
  const range = parseRange(params);

  const [summary, previous, items, staff, business, notes] = await Promise.all([
    getSummary(range),
    getSummary(previousRange(range)),
    getItemPerformance(range, "restaurant", 30),
    getStaffPerformance(range),
    getBusinessSettings(),
    listRecentNotes({ limit: 3 }),
  ]);
  const t = await getTranslations('AdminHome');

  return (
    <div className="space-y-5">
      <RangePicker grain={range.grain} anchor={range.from} label={range.label} />

      <SummaryCards summary={summary} previous={previous} />

      {/* Best sellers */}
      <Card>
        <CardHeader
          icon={<Trophy className="size-4" />}
          title={t('bestSellers')}
          subtitle={t('topDishes', { label: range.label.toLowerCase() })}
          action={
            <Link
              href={`/admin/analytics?grain=${range.grain}&on=${range.from}`}
              className="inline-flex items-center gap-1 text-[12.5px] font-bold text-brand"
            >
              {t('allReports')}
              <ArrowRight className="size-3.5" />
            </Link>
          }
        />
        <div className="px-4 pb-2">
          <ItemPerformanceList
            items={items}
            limit={5}
            lowMarginPct={business.lowMarginPct}
            href={(i) => `/admin/dish/${i.menuItemId}`}
          />
        </div>
      </Card>

      {/* Who was working */}
      {staff.length > 0 ? (
        <Card>
          <CardHeader icon={<Users className="size-4" />} title={t('whoRecorded')} />
          <ul className="divide-y divide-line px-4 pb-2">
            {staff.map((s) => (
              <li key={s.staffId ?? s.name} className="flex items-center gap-3 py-3">
                <Avatar emoji={s.avatar} name={s.name} size={34} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-semibold text-ink">{s.name}</p>
                  <p className="nums text-[12px] text-ink-3">
                    {t('orders', { count: s.orders })} - {t('average')}{" "}
                    {formatMoney(s.avgOrderCents)}
                  </p>
                </div>
                <p className="nums text-[14px] font-bold text-ink">
                  {formatMoney(s.revenueCents, { compact: true })}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {/* Notes */}
      <div className="space-y-2.5">
        <SectionTitle
          action={
            <Link href="/notes" className="text-[12.5px] font-bold text-brand">
              {t('open')}
            </Link>
          }
        >
          {t('latestNotes')}
        </SectionTitle>

        {notes.length === 0 ? (
          <Card className="p-4">
            <p className="text-[13px] leading-relaxed text-ink-3">
              {t('noNotes')}
            </p>
          </Card>
        ) : (
          <Card className="divide-y divide-line">
            {notes.map((n) => (
              <Link key={n.id} href="/notes" className="block px-4 py-3">
                <p className="flex items-center gap-2 text-[12px] font-semibold text-ink-3">
                  <MessageSquare className="size-3.5" />
                  {n.authorName} - {relativeTime(n.createdAt)}
                </p>
                <p className="mt-1 line-clamp-2 text-[13.5px] leading-snug text-ink">{n.body}</p>
              </Link>
            ))}
          </Card>
        )}
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-2.5 pb-4">
        <Link
          href="/admin/expenses"
          className="flex h-12 items-center justify-center gap-2 rounded-[var(--radius-control)] border border-line bg-surface text-[14px] font-semibold text-ink shadow-tile transition active:scale-[0.985]"
        >
          <Plus className="size-4" />
          {t('recordExpense')}
        </Link>
        <Link
          href="/admin/menu"
          className="flex h-12 items-center justify-center gap-2 rounded-[var(--radius-control)] border border-line bg-surface text-[14px] font-semibold text-ink shadow-tile transition active:scale-[0.985]"
        >
          <Plus className="size-4" />
          {t('addDish')}
        </Link>
      </div>
    </div>
  );
}
