"use client";
/**
 * "My sales".
 *
 * Two sources, merged by clientId:
 *   the server  every sale this person has recorded, from any phone. This is
 *               what makes the history survive a new device - reading only the
 *               local ledger meant signing in elsewhere showed nothing.
 *   the device  sales still queued here, which the server has not seen yet.
 *
 * The local copy wins for anything not yet confirmed, so a pending sale keeps
 * saying "on this phone" rather than vanishing. With no network the server
 * half is simply absent (or served from the worker cache) and the screen still
 * shows everything this device recorded.
 */
import * as React from "react";
import { useLocale, useTranslations } from "next-intl";
import { labelFor } from "@/lib/payments";
import { Check, ChevronDown, CloudOff, Receipt, RefreshCw, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/money";
import { addDays, formatClock, formatDayLabel, today } from "@/lib/dates";
import { ledgerForDate } from "@/lib/offline/outbox";
import type { LedgerRecord } from "@/lib/offline/db";
import { useSync } from "@/components/providers/sync-provider";
import { Badge, Button, Card, EmptyState, Segmented } from "@/components/ui/primitives";
import { StatTile } from "@/components/ui/stat";

/** A ledger row plus the one thing only the server knows: it was cancelled. */
type Row = LedgerRecord & { voided?: boolean };

type ServerSale = {
  clientId: string;
  soldAt: string;
  businessDate: string;
  totalCents: number;
  costCents: number;
  discountCents: number;
  itemCount: number;
  paymentMethod: string;
  tableLabel: string | null;
  customerNote: string | null;
  status: "synced" | "void";
  lines: {
    name: string;
    emoji: string;
    qty: number;
    unitPriceCents: number;
    unitCostCents: number;
  }[];
};

export function ShiftView({
  timezone,
  dayCutoffHour,
  staffId,
}: {
  timezone: string;
  dayCutoffHour: number;
  /**
   * Only ever a cache key. The server answers from the session cookie and
   * ignores this entirely, so putting it in the URL gives away nothing - it
   * exists so the service worker files one person's cached history separately
   * from the next person's on a shared phone.
   */
  staffId: string;
}) {
  const locale = useLocale();
  const t = useTranslations("Shift");
  const c = useTranslations("Common");
  const sync = useSync();
  const [day, setDay] = React.useState<string>(() => today(timezone, dayCutoffHour));
  const [rows, setRows] = React.useState<Row[] | null>(null);
  const [expanded, setExpanded] = React.useState<string | null>(null);

  const load = React.useCallback(async (key: string) => {
    // The device first: it is instant, and it is the only source that knows
    // about sales the server has not confirmed.
    let local: Row[] = [];
    try {
      // Rows written by someone else who used this phone are not this
      // person's history. Older rows carry no author and are kept.
      local = (await ledgerForDate(key)).filter(
        (r) => !r.staffId || r.staffId === staffId,
      );
    } catch {
      local = [];
    }
    setRows(local);

    // Then the durable history. A failure here is normal (offline) and must
    // not wipe what the device already showed.
    try {
      const res = await fetch(
        `/api/my-sales?date=${key}&u=${encodeURIComponent(staffId)}`,
        { cache: "no-store" },
      );
      if (!res.ok) return;
      const json = (await res.json()) as { sales: ServerSale[]; staffName?: string };

      const byClientId = new Map<string, Row>();
      for (const sale of json.sales) {
        byClientId.set(sale.clientId, {
          clientId: sale.clientId,
          soldAt: sale.soldAt,
          businessDate: sale.businessDate,
          totalCents: sale.totalCents,
          costCents: sale.costCents,
          discountCents: sale.discountCents,
          itemCount: sale.itemCount,
          paymentMethod: sale.paymentMethod,
          tableLabel: sale.tableLabel,
          customerNote: sale.customerNote,
          lines: sale.lines.map((l) => ({
            menuItemId: null,
            name: l.name,
            emoji: l.emoji,
            qty: l.qty,
            unitPriceCents: l.unitPriceCents,
            unitCostCents: l.unitCostCents,
          })),
          status: "synced",
          voided: sale.status === "void",
          staffName: json.staffName ?? "",
        });
      }

      // Anything still queued on this device overrides the server's view of it.
      for (const row of local) {
        if (row.status !== "synced") byClientId.set(row.clientId, row);
      }

      setRows(
        [...byClientId.values()].sort((a, b) => b.soldAt.localeCompare(a.soldAt)),
      );
    } catch {
      /* offline - the local rows above are already on screen */
    }
  }, [staffId]);

  React.useEffect(() => {
    void load(day);
  }, [day, load, sync.pending, sync.lastSyncAt]);

  const todayKey = today(timezone, dayCutoffHour);
  const totals = React.useMemo(() => {
    const list = rows ?? [];
    const counted = list.filter((r) => !r.voided);
    return {
      count: counted.length,
      items: counted.reduce((s, r) => s + r.itemCount, 0),
      total: counted.reduce((s, r) => s + r.totalCents, 0),
      pending: list.filter((r) => r.status === "pending").length,
    };
  }, [rows]);

  return (
    <div className="space-y-4 pt-2">
      <Segmented
        value={day}
        onChange={setDay}
        options={[
          { value: todayKey, label: c("today") },
          { value: addDays(todayKey, -1), label: c("yesterday") },
          {
            value: addDays(todayKey, -2),
            label: formatDayLabel(addDays(todayKey, -2), true),
          },
        ]}
      />

      <div className="grid grid-cols-3 gap-2.5">
        <StatTile label={t("orders")} value={String(totals.count)} />
        <StatTile label={t("items")} value={String(totals.items)} />
        <StatTile label={t("taken")} valueCents={totals.total} tone="brand" />
      </div>

      {totals.pending > 0 ? (
        <Card className="flex items-center gap-3 p-3.5">
          <CloudOff className="size-5 shrink-0 text-warn" />
          <p className="flex-1 text-[12.5px] leading-snug text-ink-2">
            <span className="font-semibold text-ink">
              {t("pendingCount", { count: totals.pending })}
            </span>{" "}
            {t("pendingBody")}
          </p>
          <Button
            size="sm"
            variant="secondary"
            loading={sync.syncing}
            disabled={!sync.online}
            icon={<RefreshCw className="size-3.5" />}
            onClick={() => void sync.flush()}
          >
            {t("send")}
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
          title={day === todayKey ? t("noSalesToday") : t("noSalesDay")}
          body={t("emptyBody")}
        />
      ) : (
        <ul className="space-y-2.5">
          {rows.map((r) => {
            const open = expanded === r.clientId;
            return (
              <li key={r.clientId}>
                <Card className={cn("overflow-hidden", r.voided && "opacity-65")}>
                  <button
                    onClick={() => setExpanded(open ? null : r.clientId)}
                    className="flex w-full items-center gap-3 p-3.5 text-left"
                    aria-expanded={open}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 text-[14px] font-semibold text-ink">
                        <span className="nums">{formatMoney(r.totalCents)}</span>
                        {r.voided ? (
                          <Badge tone="loss">{t("voided")}</Badge>
                        ) : r.status === "pending" ? (
                          <Badge tone="warn" dot>
                            {t("onThisPhone")}
                          </Badge>
                        ) : r.status === "rejected" ? (
                          <Badge tone="loss" dot>
                            {t("needsAttention")}
                          </Badge>
                        ) : (
                          <Badge tone="profit">
                            <Check className="size-3" />
                            {t("saved")}
                          </Badge>
                        )}
                      </p>
                      <p className="nums mt-0.5 text-[12px] text-ink-3">
                        {formatClock(r.soldAt)} - {t("itemCount", { count: r.itemCount })} -{" "}
                        {labelFor(r.paymentMethod, locale)}
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
                          {t("discount")} - {formatMoney(r.discountCents)}
                        </p>
                      ) : null}
                      {r.customerNote ? (
                        <p className="mt-2 rounded-[10px] bg-surface px-2.5 py-2 text-[12.5px] leading-snug text-ink-2">
                          {r.customerNote}
                        </p>
                      ) : null}
                      {r.voided ? (
                        <p className="mt-2 flex items-start gap-1.5 text-[12px] font-medium text-loss">
                          <TriangleAlert className="mt-px size-3.5 shrink-0" />
                          {t("voidedNote")}
                        </p>
                      ) : null}
                      {r.status === "rejected" ? (
                        <p className="mt-2 flex items-start gap-1.5 text-[12px] font-medium text-loss">
                          <TriangleAlert className="mt-px size-3.5 shrink-0" />
                          {t("rejectedNote")}
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
        {t("footer")}
      </p>
    </div>
  );
}
