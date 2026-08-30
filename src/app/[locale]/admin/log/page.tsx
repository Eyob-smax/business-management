import type { Metadata } from "next";
import { Link } from "@/i18n/routing";
import { Download, Notebook, Receipt } from "lucide-react";
import { getRecentSales, getSummary } from "@/lib/analytics";
import { listNoteThreads } from "@/lib/notes";
import { parseRange, type RangeSearchParams } from "@/lib/range-params";
import { getSessionUser } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { Card } from "@/components/ui/primitives";
import { RangePicker } from "@/components/admin/range-picker";
import { SalesLog } from "@/components/admin/sales-log";
import { NoteBoard } from "@/components/notes/note-board";
import { LogTabs } from "@/components/admin/log-tabs";

export const metadata: Metadata = { title: "Day log" };

export default async function LogPage({
  searchParams,
}: {
  searchParams: Promise<RangeSearchParams & { tab?: string }>;
}) {
  const params = await searchParams;
  const range = parseRange(params);
  const tab = params.tab === "notes" ? "notes" : "orders";

  const user = await getSessionUser();

  const [sales, summary, threads] = await Promise.all([
    getRecentSales(range, "restaurant", 300),
    getSummary(range),
    listNoteThreads({ from: range.from, to: range.to, limit: 60 }),
  ]);

  const voided = sales.filter((s) => s.status === "void").length;

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-3 px-1">
        <div>
          <h1 className="text-[20px] leading-tight font-bold tracking-tight text-ink">Day log</h1>
          <p className="mt-1 text-[13px] text-ink-3">Every order, and the notes for the period.</p>
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

      <Card className="grid grid-cols-3 divide-x divide-line">
        <div className="p-3.5 text-center">
          <p className="text-[11px] font-bold tracking-wide text-ink-3 uppercase">Orders</p>
          <p className="nums mt-1 text-[18px] font-bold text-ink">{summary.orders}</p>
        </div>
        <div className="p-3.5 text-center">
          <p className="text-[11px] font-bold tracking-wide text-ink-3 uppercase">Revenue</p>
          <p className="nums mt-1 text-[18px] font-bold text-ink">
            {formatMoney(summary.revenueCents, { compact: true })}
          </p>
        </div>
        <div className="p-3.5 text-center">
          <p className="text-[11px] font-bold tracking-wide text-ink-3 uppercase">Cancelled</p>
          <p className="nums mt-1 text-[18px] font-bold text-ink">{voided}</p>
        </div>
      </Card>

      <LogTabs
        tab={tab}
        grain={range.grain}
        on={range.from}
        orderCount={sales.length}
        noteCount={threads.length}
      />

      {tab === "orders" ? (
        <SalesLog sales={sales} showDates={range.grain !== "day"} />
      ) : user ? (
        <NoteBoard
          threads={threads}
          currentUser={user}
          noteDate={range.grain === "day" ? range.from : range.to}
          compact={range.grain === "day"}
        />
      ) : null}

      <p className="flex items-center justify-center gap-1.5 pb-2 text-center text-[11.5px] text-ink-3">
        {tab === "orders" ? (
          <Receipt className="size-3.5" />
        ) : (
          <Notebook className="size-3.5" />
        )}
        Orders keep the price and cost that applied when they were sold.
      </p>
    </div>
  );
}
