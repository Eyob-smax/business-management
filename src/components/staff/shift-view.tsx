"use client";
/**
 * "My sales" - read from this device's own ledger, so it works with no
 * network. Each row says plainly whether the office has it yet.
 */
import * as React from "react";
import { Check, ChevronDown, CloudOff, Receipt, RefreshCw, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/money";
import { addDays, formatClock, formatDayLabel, today } from "@/lib/dates";
import { ledgerForDate } from "@/lib/offline/outbox";
import type { LedgerRecord } from "@/lib/offline/db";
import { useSync } from "@/components/providers/sync-provider";
import { Badge, Button, Card, EmptyState, Segmented } from "@/components/ui/primitives";
import { StatTile } from "@/components/ui/stat";

const PAYMENT_LABELS: Record<string, string> = {
  cash: "Cash",
  telebirr: "Telebirr",
  card: "Card",
  credit: "Credit",
  other: "Other",
};

export function ShiftView({
  timezone,
  dayCutoffHour,
}: {
  timezone: string;
  dayCutoffHour: number;
}) {
  const sync = useSync();
  const [day, setDay] = React.useState<string>(() => today(timezone, dayCutoffHour));
  const [rows, setRows] = React.useState<LedgerRecord[] | null>(null);
  const [expanded, setExpanded] = React.useState<string | null>(null);

  const load = React.useCallback(async (key: string) => {
    try {
      setRows(await ledgerForDate(key));
    } catch {
      setRows([]);
    }
  }, []);

  React.useEffect(() => {
    void load(day);
  }, [day, load, sync.pending, sync.lastSyncAt]);

  const t = today(timezone, dayCutoffHour);
  const totals = React.useMemo(() => {
    const list = rows ?? [];
    return {
      count: list.length,
      items: list.reduce((s, r) => s + r.itemCount, 0),
      total: list.reduce((s, r) => s + r.totalCents, 0),
      pending: list.filter((r) => r.status === "pending").length,
    };
  }, [rows]);

  return (
    <div className="space-y-4 pt-2">
      <Segmented
        value={day}
        onChange={setDay}
        options={[
          { value: t, label: "Today" },
          { value: addDays(t, -1), label: "Yesterday" },
          { value: addDays(t, -2), label: formatDayLabel(addDays(t, -2), true) },
        ]}
      />

      <div className="grid grid-cols-3 gap-2.5">
        <StatTile label="Orders" value={String(totals.count)} />
        <StatTile label="Items" value={String(totals.items)} />
        <StatTile label="Taken" valueCents={totals.total} tone="brand" />
      </div>

      {totals.pending > 0 ? (
        <Card className="flex items-center gap-3 p-3.5">
          <CloudOff className="size-5 shrink-0 text-warn" />
          <p className="flex-1 text-[12.5px] leading-snug text-ink-2">
            <span className="font-semibold text-ink">{totals.pending} order{totals.pending > 1 ? "s" : ""}</span>{" "}
            still on this phone. They are safe and will be sent automatically.
          </p>
          <Button
            size="sm"
            variant="secondary"
            loading={sync.syncing}
            disabled={!sync.online}
            icon={<RefreshCw className="size-3.5" />}
            onClick={() => void sync.flush()}
          >
            Send
          </Button>
        </Card>
      ) : null}

      {rows === null ? (
        <div className="space-y-2.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-16 rounded-[var(--radius-card)]" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Receipt className="size-6" />}
          title={day === t ? "No sales recorded yet today" : "Nothing recorded on this day"}
          body="Orders you save on this phone appear here straight away, online or not."
        />
      ) : (
        <ul className="space-y-2.5">
          {rows.map((r) => {
            const open = expanded === r.clientId;
            return (
              <li key={r.clientId}>
                <Card className="overflow-hidden">
                  <button
                    onClick={() => setExpanded(open ? null : r.clientId)}
                    className="flex w-full items-center gap-3 p-3.5 text-left"
                    aria-expanded={open}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 text-[14px] font-semibold text-ink">
                        <span className="nums">{formatMoney(r.totalCents)}</span>
                        {r.status === "pending" ? (
                          <Badge tone="warn" dot>
                            on this phone
                          </Badge>
                        ) : r.status === "rejected" ? (
                          <Badge tone="loss" dot>
                            needs attention
                          </Badge>
                        ) : (
                          <Badge tone="profit">
                            <Check className="size-3" />
                            saved
                          </Badge>
                        )}
                      </p>
                      <p className="nums mt-0.5 text-[12px] text-ink-3">
                        {formatClock(r.soldAt)} - {r.itemCount} item{r.itemCount > 1 ? "s" : ""} -{" "}
                        {PAYMENT_LABELS[r.paymentMethod] ?? r.paymentMethod}
                        {r.tableLabel ? ` - ${r.tableLabel}` : ""}
                      </p>
                    </div>
                    <ChevronDown
                      className={cn(
                        "size-4 shrink-0 text-ink-3 transition-transform",
                        open && "rotate-180",
                      )}
                    />
                  </button>

                  {open ? (
                    <div className="border-t border-line bg-surface-2/60 px-3.5 py-3">
                      <ul className="space-y-1.5">
                        {r.lines.map((l, i) => (
                          <li key={i} className="flex items-baseline gap-2 text-[13px]">
                            <span aria-hidden>{l.emoji}</span>
                            <span className="nums font-semibold text-ink-2">{l.qty}x</span>
                            <span className="min-w-0 flex-1 truncate text-ink">{l.name}</span>
                            <span className="nums font-semibold text-ink">
                              {formatMoney(l.qty * l.unitPriceCents)}
                            </span>
                          </li>
                        ))}
                      </ul>
                      {r.discountCents > 0 ? (
                        <p className="nums mt-2 text-[12.5px] font-medium text-loss">
                          Discount - {formatMoney(r.discountCents)}
                        </p>
                      ) : null}
                      {r.customerNote ? (
                        <p className="mt-2 rounded-[10px] bg-surface px-2.5 py-2 text-[12.5px] leading-snug text-ink-2">
                          {r.customerNote}
                        </p>
                      ) : null}
                      {r.status === "rejected" ? (
                        <p className="mt-2 flex items-start gap-1.5 text-[12px] font-medium text-loss">
                          <TriangleAlert className="mt-px size-3.5 shrink-0" />
                          The office could not accept this one. Open the sync status at the top of
                          the screen to see why.
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <p className="px-1 pb-2 text-center text-[11.5px] leading-relaxed text-ink-3">
        This list is what this phone recorded. The office sees the full picture from every device.
      </p>
    </div>
  );
}
