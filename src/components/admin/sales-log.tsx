"use client";
/**
 * The order log.
 *
 * Every recorded order, newest first, with who rang it up, when the device
 * actually recorded it, and when it reached the database. That last pair is
 * what makes an offline-first system auditable: a row synced four hours late
 * says so, rather than quietly appearing in yesterday's totals.
 */
import * as React from "react";
import { ChevronDown, Clock, CloudUpload, Search, Undo2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/money";
import { formatClock, formatDayLabel, relativeTime } from "@/lib/dates";
import type { RecentSale } from "@/lib/analytics";
import { unvoidSale, voidSale } from "@/app/actions/sales";
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Segmented,
  Textarea,
} from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/overlay";
import { useToast } from "@/components/ui/toast";
import { useLocale, useTranslations } from "next-intl";
import { labelFor } from "@/lib/payments";

export function SalesLog({
  sales,
  showDates,
}: {
  sales: RecentSale[];
  /** Multi-day range: show which day each order belongs to. */
  showDates?: boolean;
}) {
  const locale = useLocale();
  const t = useTranslations("SalesLog");
  const c = useTranslations("Common");
  const { toast } = useToast();
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState<"all" | "late" | "void">("all");
  const [open, setOpen] = React.useState<string | null>(null);
  const [voiding, setVoiding] = React.useState<RecentSale | null>(null);
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  /** Recorded on the device more than 10 minutes before it reached the server. */
  const lagMinutes = (s: RecentSale) =>
    Math.round((Date.parse(s.syncedAt) - Date.parse(s.soldAt)) / 60000);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return sales
      .filter((s) =>
        filter === "void" ? s.status === "void" : filter === "late" ? lagMinutes(s) >= 10 : true,
      )
      .filter((s) =>
        q
          ? s.staffName.toLowerCase().includes(q) ||
            s.tableLabel?.toLowerCase().includes(q) ||
            s.lines.some((l) => l.name.toLowerCase().includes(q))
          : true,
      );
  }, [sales, query, filter]);

  const lateCount = sales.filter((s) => lagMinutes(s) >= 10).length;
  const voidCount = sales.filter((s) => s.status === "void").length;

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-3" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("search")}
          className="h-11 w-full rounded-full border border-line bg-surface pr-4 pl-10 text-[15px] text-ink placeholder:text-ink-3 focus:border-brand focus:ring-4 focus:ring-brand/12 focus:outline-none"
        />
      </div>

      {lateCount > 0 || voidCount > 0 ? (
        <Segmented
          value={filter}
          onChange={setFilter}
          size="sm"
          options={[
            { value: "all", label: t("filterAll", { count: sales.length }) },
            { value: "late", label: t("filterLate", { count: lateCount }) },
            { value: "void", label: t("filterVoid", { count: voidCount }) },
          ]}
        />
      ) : null}

      {filtered.length === 0 ? (
        <EmptyState
          title={t("noOrders")}
          body={sales.length === 0 ? t("nothingRecorded") : t("noMatch")}
        />
      ) : (
        <ul className="space-y-2">
          {filtered.map((s) => {
            const expanded = open === s.id;
            const lag = lagMinutes(s);
            const voided = s.status === "void";

            return (
              <li key={s.id}>
                <Card className={cn("overflow-hidden", voided && "opacity-70")}>
                  <button
                    onClick={() => setOpen(expanded ? null : s.id)}
                    aria-expanded={expanded}
                    className="flex w-full items-center gap-3 p-3.5 text-left"
                  >
                    <Avatar emoji={s.staffAvatar} name={s.staffName} size={34} />

                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={cn(
                            "nums text-[15px] font-bold text-ink",
                            voided && "line-through decoration-loss/70",
                          )}
                        >
                          {formatMoney(s.totalCents)}
                        </span>
                        {voided ? <Badge tone="loss">cancelled</Badge> : null}
                        {lag >= 10 && !voided ? (
                          <Badge tone="warn">
                            <CloudUpload className="size-3" />
                            synced {lag >= 120 ? `${Math.round(lag / 60)}h` : `${lag}m`} late
                          </Badge>
                        ) : null}
                      </p>
                      <p className="nums mt-0.5 truncate text-[12px] text-ink-3">
                        {showDates ? `${formatDayLabel(s.businessDate, true)} - ` : ""}
                        {formatClock(s.soldAt)} - {s.staffName} - {s.itemCount} item
                        {s.itemCount === 1 ? "" : "s"} - {labelFor(s.paymentMethod, locale)}
                        {s.tableLabel ? ` - ${s.tableLabel}` : ""}
                      </p>
                    </div>

                    <ChevronDown
                      className={cn(
                        "size-4 shrink-0 text-ink-3 transition-transform",
                        expanded && "rotate-180",
                      )}
                    />
                  </button>

                  {expanded ? (
                    <div className="border-t border-line bg-surface-2/50 px-3.5 py-3">
                      <ul className="space-y-1.5">
                        {s.lines.map((l, i) => (
                          <li key={i} className="flex items-baseline gap-2 text-[13px]">
                            <span aria-hidden>{l.emoji}</span>
                            <span className="nums font-semibold text-ink-2">{l.qty}x</span>
                            <span className="min-w-0 flex-1 truncate text-ink">{l.name}</span>
                            <span className="nums text-ink-3">
                              {formatMoney(l.unitPriceCents)}
                            </span>
                            <span className="nums w-20 text-right font-semibold text-ink">
                              {formatMoney(l.lineTotalCents)}
                            </span>
                          </li>
                        ))}
                      </ul>

                      <div className="mt-3 space-y-1 border-t border-line pt-2.5 text-[12.5px]">
                        {s.discountCents > 0 ? (
                          <p className="nums flex justify-between text-loss">
                            <span>{c("discount")}</span>
                            <span>- {formatMoney(s.discountCents)}</span>
                          </p>
                        ) : null}
                        <p className="nums flex justify-between text-ink-3">
                          <span>{t("estimatedCost")}</span>
                          <span>{formatMoney(s.totalCostCents)}</span>
                        </p>
                        <p className="nums flex justify-between font-semibold text-profit">
                          <span>{t("estimatedProfit")}</span>
                          <span>{formatMoney(s.totalCents - s.totalCostCents)}</span>
                        </p>
                      </div>

                      {s.customerNote ? (
                        <p className="mt-2.5 rounded-[10px] bg-surface px-2.5 py-2 text-[12.5px] leading-snug text-ink-2">
                          {s.customerNote}
                        </p>
                      ) : null}

                      <p className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-3">
                        <span className="flex items-center gap-1">
                          <Clock className="size-3" />
                          {t("recordedAt", { when: relativeTime(s.soldAt) })}
                        </span>
                        <span className="flex items-center gap-1">
                          <CloudUpload className="size-3" />
                          {t("reachedDb", { when: relativeTime(s.syncedAt) })}
                        </span>
                      </p>

                      {voided ? (
                        <div className="mt-3 rounded-[10px] bg-loss-soft px-2.5 py-2">
                          <p className="text-[12px] font-semibold text-loss">
                            {t("cancelledWithReason", { reason: s.voidReason ?? "" })}
                          </p>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="mt-1.5"
                            icon={<Undo2 className="size-3.5" />}
                            onClick={async () => {
                              const res = await unvoidSale(s.id);
                              toast(
                                res.ok
                                  ? { tone: "success", title: res.message ?? t("restored") }
                                  : { tone: "error", title: res.error ?? t("couldNotRestore") },
                              );
                            }}
                          >
                            {t("putBack")}
                          </Button>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="mt-2.5 text-loss"
                          icon={<XCircle className="size-3.5" />}
                          onClick={() => {
                            setVoiding(s);
                            setReason("");
                          }}
                        >
                          {t("cancelThis")}
                        </Button>
                      )}
                    </div>
                  ) : null}
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <Sheet
        open={Boolean(voiding)}
        onClose={() => setVoiding(null)}
        title={t("cancelTitle")}
        subtitle={
          voiding
            ? t("cancelSubtitle", {
                amount: formatMoney(voiding.totalCents),
                name: voiding.staffName,
              })
            : undefined
        }
        size="sm"
        footer={
          <div className="flex gap-2.5">
            <Button variant="secondary" block onClick={() => setVoiding(null)} disabled={busy}>
              {t("keepIt")}
            </Button>
            <Button
              variant="danger"
              block
              loading={busy}
              disabled={reason.trim().length < 3}
              onClick={async () => {
                if (!voiding) return;
                setBusy(true);
                const res = await voidSale(voiding.id, reason);
                setBusy(false);
                if (res.ok) setVoiding(null);
                toast(
                  res.ok
                    ? { tone: "success", title: res.message ?? t("cancelled") }
                    : { tone: "error", title: res.error ?? t("couldNotCancel") },
                );
              }}
            >
              {t("cancelOrder")}
            </Button>
          </div>
        }
      >
        <div className="space-y-3 pt-1 pb-2">
          <p className="text-[13px] leading-relaxed text-ink-2">
            {t("cancelExplain")}
          </p>
          <Field label={t("why")} required>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              maxLength={300}
              placeholder={t("whyPlaceholder")}
              data-autofocus
            />
          </Field>
        </div>
      </Sheet>
    </div>
  );
}
