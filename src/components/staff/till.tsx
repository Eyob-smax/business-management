"use client";
/**
 * The till.
 *
 * Design constraints that drove this screen:
 *  - It must open and work with zero network. The menu comes from IndexedDB;
 *    a sale is written to the device before any request is attempted.
 *  - It is used one-handed, standing up, in a hurry. Tiles are big, the total
 *    is always visible, and saving is one tap from anywhere.
 *  - Staff never see cost or profit. They see what the customer pays.
 */
import * as React from "react";
import { useTranslations } from "next-intl";
import {
  CircleMinus,
  Loader2,
  Minus,
  Plus,
  Lock,
  Search,
  ShoppingBag,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { cn, newId } from "@/lib/utils";
import { formatMoney, parseMoneyToCents } from "@/lib/money";
import { businessDateOf } from "@/lib/dates";
import type { MenuItemDTO, MenuSnapshot } from "@/lib/menu-types";
import { useMenuCache } from "@/hooks/use-menu-cache";
import { useSync } from "@/components/providers/sync-provider";
import { useToast } from "@/components/ui/toast";
import { ledgerPut } from "@/lib/offline/outbox";
import { getDeviceId } from "@/lib/offline/db";
import {
  Button,
  EmptyState,
  Field,
  Input,
  Textarea,
} from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/overlay";
import { PaymentPicker } from "./payment-picker";

type MenuItem = MenuItemDTO;
type CartLine = { item: MenuItem; qty: number };
/** A payment method id from lib/payments.ts. */
type Payment = string;

export function Till({
  initialMenu,
  staffName,
  staffId,
  timezone,
  dayCutoffHour,
  canRecord,
}: {
  initialMenu: MenuSnapshot | null;
  staffName: string;
  /** Stamped onto each ledger row so a shared phone keeps histories apart. */
  staffId: string;
  /** From business settings, so the device agrees with the server on which
      trading day a late-night sale belongs to. */
  timezone: string;
  dayCutoffHour: number;
  /**
   * False when an admin has set this person to read-only. The server refuses
   * the write regardless; this just stops them filling a basket they cannot
   * save, which is the difference between a rule and a trap.
   */
  canRecord: boolean;
}) {
  const t = useTranslations("Till");
  const c = useTranslations("Common");
  const menu = useMenuCache(initialMenu);
  const sync = useSync();
  const { toast } = useToast();

  const [query, setQuery] = React.useState("");
  const [category, setCategory] = React.useState<string>("all");
  const [cart, setCart] = React.useState<CartLine[]>([]);
  const [cartOpen, setCartOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const [payment, setPayment] = React.useState<Payment>("cash");
  const [discountText, setDiscountText] = React.useState("");
  const [tableLabel, setTableLabel] = React.useState("");
  const [note, setNote] = React.useState("");

  // Memoised so the filtering below is not invalidated on every render.
  const items = React.useMemo(() => menu.snapshot?.items ?? [], [menu.snapshot]);
  const categories = React.useMemo(() => menu.snapshot?.categories ?? [], [menu.snapshot]);

  /* ------------------------------------------------------------- filtering */

  const visible = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return items
      .filter((i) => i.isAvailable)
      .filter((i) => (category === "all" ? true : i.categoryId === category))
      .filter((i) => (q ? i.name.toLowerCase().includes(q) : true))
      .sort((a, b) => {
        // Featured first, then the admin's ordering, then alphabetical.
        if (a.isFeatured !== b.isFeatured) return a.isFeatured ? -1 : 1;
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
        return a.name.localeCompare(b.name);
      });
  }, [items, category, query]);

  /* ----------------------------------------------------------------- cart */

  const qtyOf = React.useCallback(
    (id: string) => cart.find((l) => l.item.id === id)?.qty ?? 0,
    [cart],
  );

  const add = (item: MenuItem, delta = 1) => {
    setCart((prev) => {
      const found = prev.find((l) => l.item.id === item.id);
      if (!found) return delta > 0 ? [...prev, { item, qty: delta }] : prev;
      const qty = found.qty + delta;
      if (qty <= 0) return prev.filter((l) => l.item.id !== item.id);
      // Keep the item's position stable while its quantity changes.
      return prev.map((l) => (l.item.id === item.id ? { ...l, qty } : l));
    });
  };

  const subtotal = cart.reduce((t, l) => t + l.qty * l.item.priceCents, 0);
  const itemCount = cart.reduce((t, l) => t + l.qty, 0);
  const discount = Math.min(Math.max(parseMoneyToCents(discountText) ?? 0, 0), subtotal);
  const total = subtotal - discount;

  const reset = () => {
    setCart([]);
    setDiscountText("");
    setTableLabel("");
    setNote("");
    setPayment("cash");
  };

  /* ----------------------------------------------------------------- save */

  const save = async () => {
    if (cart.length === 0 || saving) return;
    if (!canRecord) {
      toast({
        tone: "error",
        title: t("pausedTitle"),
        body: t("pausedToast"),
      });
      return;
    }
    setSaving(true);

    try {
      const clientId = newId();
      const soldAt = new Date().toISOString();
      const deviceId = await getDeviceId();

      const lines = cart.map((l) => ({
        menuItemId: l.item.id,
        name: l.item.name,
        emoji: l.item.emoji,
        categoryName: l.item.categoryName,
        qty: l.qty,
        unitPriceCents: l.item.priceCents,
        // Snapshot of the admin's estimate as this device knows it, so the
        // sale keeps the cost that applied when it happened.
        unitCostCents: l.item.estCostCents,
      }));

      // 1. The device's own ledger, so the sale is visible here immediately.
      await ledgerPut({
        clientId,
        soldAt,
        businessDate: businessDateOf(soldAt, timezone, dayCutoffHour),
        totalCents: total,
        costCents: cart.reduce((t, l) => t + l.qty * l.item.estCostCents, 0),
        discountCents: discount,
        itemCount,
        paymentMethod: payment,
        tableLabel: tableLabel.trim() || null,
        customerNote: note.trim() || null,
        staffId,
        lines: lines.map((l) => ({
          menuItemId: l.menuItemId,
          name: l.name,
          emoji: l.emoji,
          categoryName: l.categoryName,
          qty: l.qty,
          unitPriceCents: l.unitPriceCents,
          unitCostCents: l.unitCostCents,
        })),
        status: "pending",
        staffName,
      });

      // 2. The outbox. Only after this returns is the sale safe.
      await sync.queue(
        "sale",
        {
          module: "restaurant",
          soldAt,
          paymentMethod: payment,
          discountCents: discount,
          tableLabel: tableLabel.trim() || null,
          customerNote: note.trim() || null,
          deviceId,
          lines,
        },
        `Sale ${formatMoney(total)} - ${itemCount} item${itemCount > 1 ? "s" : ""}`,
        clientId,
      );

      setCartOpen(false);
      reset();

      toast(
        sync.online
          ? {
              tone: "success",
              title: t("savedTitle", { amount: formatMoney(total) }),
              body: t("savedBody"),
            }
          : {
              tone: "offline",
              title: t("savedOfflineTitle", { amount: formatMoney(total) }),
              body: t("savedOfflineBody"),
            },
      );
    } catch (err) {
      toast({
        tone: "error",
        title: c("couldNotSave"),
        body: err instanceof Error ? err.message : c("pleaseTryAgain"),
      });
    } finally {
      setSaving(false);
    }
  };

  /* ----------------------------------------------------------------- views */

  if (menu.loading && items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-ink-3">
        <Loader2 className="size-6 animate-spin" />
        <p className="mt-3 text-[13px]">{t("loadingMenu")}</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<ShoppingBag className="size-6" />}
        title={t("noMenuTitle")}
        body={
          menu.error
            ? t("noMenuOffline")
            : t("noMenuAdmin")
        }
        action={
          <Button variant="secondary" onClick={() => void menu.refresh()} loading={menu.refreshing}>
            {c("tryAgain")}
          </Button>
        }
      />
    );
  }

  return (
    <div className="pb-28">
      {!canRecord ? (
        <div className="mb-3 flex items-start gap-2.5 rounded-[var(--radius-card)] border border-warn/30 bg-warn-soft p-3.5">
          <Lock className="mt-px size-4 shrink-0 text-warn" />
          <div>
            <p className="text-[13px] font-bold text-warn">{t("pausedTitle")}</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-warn">
              {t("pausedBody")}
            </p>
          </div>
        </div>
      ) : null}

      {/* Search + categories */}
      <div className="sticky top-14 z-20 -mx-4 mb-3 bg-canvas/92 px-4 pt-3 pb-2 backdrop-blur-lg">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-3" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchFood")}
            enterKeyHint="search"
            className="h-11 w-full rounded-full border border-line bg-surface pr-10 pl-10 text-[15px] text-ink placeholder:text-ink-3 focus:border-brand focus:ring-4 focus:ring-brand/12 focus:outline-none"
          />
          {query ? (
            <button
              onClick={() => setQuery("")}
              aria-label={t("clearSearch")}
              className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded-full p-1 text-ink-3"
            >
              <X className="size-4" />
            </button>
          ) : null}
        </div>

        <div className="no-scrollbar -mx-4 mt-2.5 flex gap-1.5 overflow-x-auto px-4">
          <CategoryChip
            label={t("all")}
            emoji={"\u{1F374}"}
            active={category === "all"}
            onClick={() => setCategory("all")}
          />
          {categories.map((c) => (
            <CategoryChip
              key={c.id}
              label={c.name}
              emoji={c.emoji}
              active={category === c.id}
              onClick={() => setCategory(c.id)}
            />
          ))}
        </div>
      </div>

      {menu.stale ? (
        <p className="mb-3 rounded-[12px] bg-warn-soft px-3 py-2 text-[12px] font-medium text-warn">
          {t("staleMenu")}
        </p>
      ) : null}

      {/* Tiles */}
      {visible.length === 0 ? (
        <EmptyState
          title={t("nothingMatches")}
          body={t("nothingMatchesBody")}
          action={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setQuery("");
                setCategory("all");
              }}
            >
              {t("showEverything")}
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
          {visible.map((item) => (
            <ItemTile
              key={item.id}
              item={item}
              qty={qtyOf(item.id)}
              disabled={!canRecord}
              onAdd={() => add(item, 1)}
              onRemove={() => add(item, -1)}
            />
          ))}
        </div>
      )}

      {/* Cart bar */}
      {itemCount > 0 && canRecord ? (
        <div className="pb-safe fixed inset-x-0 bottom-14 z-30 px-3 pb-2">
          <div className="mx-auto max-w-3xl">
            <button
              onClick={() => setCartOpen(true)}
              className="flex w-full items-center gap-3 rounded-[18px] bg-brand px-4 py-3 text-left shadow-lift transition active:scale-[0.99]"
            >
              <span className="nums flex size-9 shrink-0 items-center justify-center rounded-full bg-white/25 text-[15px] font-bold text-white">
                {itemCount}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[11.5px] font-semibold tracking-wide text-white/80 uppercase">
                  {t("lines", { count: cart.length })}
                  {!sync.online ? t("offlineSuffix") : ""}
                </span>
                <span className="nums block truncate text-[17px] leading-tight font-bold text-white">
                  {formatMoney(total)}
                </span>
              </span>
              <span className="shrink-0 rounded-full bg-white px-3.5 py-2 text-[13.5px] font-bold text-brand">
                {t("review")}
              </span>
            </button>
          </div>
        </div>
      ) : null}

      {/* Cart sheet */}
      <Sheet
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        title={t("thisOrder")}
        subtitle={t("orderSubtitle", { items: itemCount, lines: cart.length })}
        size="md"
        footer={
          <div className="space-y-2.5">
            <div className="flex items-baseline justify-between">
              <span className="text-[13px] font-semibold text-ink-2">{t("customerPays")}</span>
              <span className="nums text-[20px] font-bold text-ink">{formatMoney(total)}</span>
            </div>
            <Button
              variant="primary"
              size="lg"
              block
              loading={saving}
              disabled={cart.length === 0}
              onClick={save}
            >
              {sync.online ? t("saveSale") : t("saveOnPhone")}
            </Button>
            {!sync.online ? (
              <p className="text-center text-[11.5px] leading-snug text-ink-3">
                {t("noInternetNote")}
              </p>
            ) : null}
          </div>
        }
      >
        {cart.length === 0 ? (
          <EmptyState title={t("emptyOrder")} />
        ) : (
          <>
            <ul className="divide-y divide-line">
              {cart.map((l) => (
                <li key={l.item.id} className="flex items-center gap-3 py-3">
                  <span className="text-[22px] leading-none">{l.item.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-semibold text-ink">{l.item.name}</p>
                    <p className="nums text-[12px] text-ink-3">
                      {formatMoney(l.item.priceCents)} {c("each")}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => add(l.item, -1)}
                      aria-label={t("oneLess", { name: l.item.name })}
                      className="inline-flex size-9 items-center justify-center rounded-full border border-line text-ink-2 transition active:scale-90"
                    >
                      <Minus className="size-4" />
                    </button>
                    <span className="nums w-7 text-center text-[16px] font-bold text-ink">
                      {l.qty}
                    </span>
                    <button
                      onClick={() => add(l.item, 1)}
                      aria-label={t("oneMore", { name: l.item.name })}
                      className="inline-flex size-9 items-center justify-center rounded-full bg-brand text-white transition active:scale-90"
                    >
                      <Plus className="size-4" />
                    </button>
                  </div>
                  <span className="nums w-20 shrink-0 text-right text-[14px] font-bold text-ink">
                    {formatMoney(l.qty * l.item.priceCents)}
                  </span>
                </li>
              ))}
            </ul>

            <button
              onClick={reset}
              className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-loss"
            >
              <Trash2 className="size-3.5" />
              {t("clearOrder")}
            </button>

            <div className="mt-5 space-y-4 border-t border-line pt-4">
              <div>
                <span className="mb-1.5 block text-[13px] font-semibold text-ink-2">{t("paidWith")}</span>
                <PaymentPicker value={payment} onChange={setPayment} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label={c("discount")} hint={t("discountHint")}>
                  <Input
                    value={discountText}
                    onChange={(e) => setDiscountText(e.target.value)}
                    inputMode="decimal"
                    placeholder="0.00"
                    prefix="Br"
                  />
                </Field>
                <Field label={t("tableLabel")} hint={c("optional")}>
                  <Input
                    value={tableLabel}
                    onChange={(e) => setTableLabel(e.target.value)}
                    placeholder={t("tablePlaceholder")}
                    maxLength={40}
                  />
                </Field>
              </div>

              <Field label={t("noteLabel")} hint={t("noteHint")}>
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  maxLength={500}
                  placeholder={t("notePlaceholder")}
                />
              </Field>

              <div className="rounded-[14px] bg-surface-2 p-3.5">
                <Line label={c("subtotal")} value={formatMoney(subtotal)} />
                {discount > 0 ? (
                  <Line label={c("discount")} value={`- ${formatMoney(discount)}`} tone="loss" />
                ) : null}
                <div className="mt-1.5 border-t border-line pt-1.5">
                  <Line label={c("total")} value={formatMoney(total)} bold />
                </div>
              </div>
            </div>
          </>
        )}
      </Sheet>
    </div>
  );
}

/* ------------------------------------------------------------------ pieces */

function Line({
  label,
  value,
  bold,
  tone,
}: {
  label: string;
  value: string;
  bold?: boolean;
  tone?: "loss";
}) {
  return (
    <div className="flex items-baseline justify-between py-0.5">
      <span className={cn("text-[13px] text-ink-2", bold && "font-bold text-ink")}>{label}</span>
      <span
        className={cn(
          "nums text-[14px] font-semibold text-ink",
          bold && "text-[16px]",
          tone === "loss" && "text-loss",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function CategoryChip({
  label,
  emoji,
  active,
  onClick,
}: {
  label: string;
  emoji: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-semibold whitespace-nowrap transition active:scale-95",
        active
          ? "border-brand bg-brand text-white"
          : "border-line bg-surface text-ink-2 hover:bg-surface-2",
      )}
    >
      <span aria-hidden>{emoji}</span>
      {label}
    </button>
  );
}

function ItemTile({
  item,
  qty,
  disabled,
  onAdd,
  onRemove,
}: {
  item: MenuItem;
  qty: number;
  disabled?: boolean;
  onAdd: () => void;
  onRemove: () => void;
}) {
  return (
    <div className={cn("relative", disabled && "opacity-60")}>
      <button
        onClick={onAdd}
        disabled={disabled}
        className={cn(
          "flex h-full w-full flex-col items-start gap-1 rounded-[var(--radius-tile)] border p-3 text-left transition active:scale-[0.97]",
          qty > 0
            ? "border-brand bg-brand-soft shadow-tile"
            : "border-line bg-surface shadow-tile hover:border-line-strong",
        )}
      >
        <span className="flex w-full items-start justify-between">
          <span className="text-[26px] leading-none" aria-hidden>
            {item.emoji}
          </span>
          {item.isFeatured ? (
            <Star className="size-3.5 fill-brand text-brand" aria-label="Popular" />
          ) : null}
        </span>

        <span className="mt-1 line-clamp-2 min-h-[2.4em] text-[13.5px] leading-tight font-semibold text-ink">
          {item.name}
        </span>

        <span className="nums text-[14px] font-bold text-brand-ink">
          {formatMoney(item.priceCents, { symbol: false })}
          <span className="ml-1 text-[10.5px] font-medium text-ink-3">/{item.unit}</span>
        </span>
      </button>

      {qty > 0 ? (
        <>
          <span className="nums pointer-events-none absolute -top-1.5 -right-1.5 flex size-7 items-center justify-center rounded-full bg-brand text-[13px] font-bold text-white shadow">
            {qty}
          </span>
          <button
            onClick={onRemove}
            aria-label={`One less ${item.name}`}
            className="absolute -bottom-1.5 -left-1.5 inline-flex size-7 items-center justify-center rounded-full border border-line bg-surface text-ink-2 shadow transition active:scale-90"
          >
            <CircleMinus className="size-4" />
          </button>
        </>
      ) : null}
    </div>
  );
}
