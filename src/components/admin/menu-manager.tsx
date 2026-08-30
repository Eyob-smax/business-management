"use client";
/**
 * Menu editor.
 *
 * The point of this screen is the pair of numbers on every row: what the
 * customer pays and what the admin thinks it costs to make. Margin is computed
 * live while typing, so the consequence of a price is visible before saving.
 */
import * as React from "react";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import {
  Archive,
  ArchiveRestore,
  ChevronDown,
  Pencil,
  Percent,
  Plus,
  Search,
  Star,
  Tag,
  TriangleAlert,
  Utensils,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMoney, parseMoneyToCents } from "@/lib/money";
import type { AdminMenuCategory, AdminMenuItem } from "@/lib/menu";
import {
  archiveCategory,
  archiveMenuItem,
  bumpCosts,
  restoreMenuItem,
  saveCategory,
  saveMenuItem,
  setItemAvailability,
  setItemFeatured,
} from "@/app/actions/menu";
import type { ActionResult } from "@/app/actions/_result";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  IconButton,
  Input,
  Segmented,
  Select,
  Toggle,
} from "@/components/ui/primitives";
import { ConfirmDialog, Sheet } from "@/components/ui/overlay";
import { useToast } from "@/components/ui/toast";

/**
 * A wide set, because a dish nobody can find an icon for ends up as a plate of
 * rice. Ordered roughly the way an Ethiopian menu reads: stews and mains,
 * fasting and vegetables, grains and bread, fast food, sweets, then drinks.
 */
const FOOD_EMOJI = [
  // stews, meat, mains
  "\u{1F35B}", "\u{1F372}", "\u{1F357}", "\u{1F356}", "\u{1F969}", "\u{1F953}",
  "\u{1F415}", "\u{1F425}", "\u{1F414}", "\u{1F411}", "\u{1F410}", "\u{1F42E}",
  "\u{1F358}", "\u{1F361}", "\u{1F373}", "\u{1F9C6}", "\u{1F32F}", "\u{1F32E}",
  // fasting, vegetables, pulses
  "\u{1F957}", "\u{1F96C}", "\u{1F966}", "\u{1F955}", "\u{1F345}", "\u{1F336}",
  "\u{1F9C5}", "\u{1F9C4}", "\u{1F954}", "\u{1F360}", "\u{1F33F}", "\u{1F952}",
  "\u{1F9C7}", "\u{1F95C}", "\u{1FAD8}", "\u{1F344}", "\u{1F33D}", "\u{1F9C8}",
  // grains, bread, injera-ish
  "\u{1F958}", "\u{1F35A}", "\u{1F35C}", "\u{1F35D}", "\u{1F35E}", "\u{1FAD3}",
  "\u{1F950}", "\u{1F956}", "\u{1F968}", "\u{1FAD3}", "\u{1F33E}",
  // fast food
  "\u{1F354}", "\u{1F96A}", "\u{1F32D}", "\u{1F355}", "\u{1F35F}", "\u{1F959}",
  "\u{1F969}", "\u{1F953}", "\u{1F9C0}", "\u{1F373}",
  // sweets
  "\u{1F370}", "\u{1F368}", "\u{1F366}", "\u{1F36A}", "\u{1F369}", "\u{1F36E}",
  "\u{1F36C}", "\u{1F36F}", "\u{1F34C}", "\u{1F34E}", "\u{1F34A}", "\u{1F349}",
  "\u{1F96D}", "\u{1F951}", "\u{1F353}", "\u{1F347}", "\u{1F34D}", "\u{1F95D}",
  // drinks
  "\u{2615}", "\u{1F375}", "\u{1F964}", "\u{1F9CB}", "\u{1F4A7}", "\u{1F37E}",
  "\u{1F37B}", "\u{1F377}", "\u{1F942}", "\u{1F943}", "\u{1F9C9}", "\u{1F9CA}",
  "\u{1F9C3}", "\u{1F376}",
];

const UNITS = ["plate", "piece", "cup", "glass", "bottle", "kg", "portion", "wrap"];

export function MenuManager({
  categories,
  items,
  lowMarginPct,
}: {
  categories: AdminMenuCategory[];
  items: AdminMenuItem[];
  lowMarginPct: number;
}) {
  const t = useTranslations("AdminMenu");
  const c = useTranslations("Common");
  const { toast } = useToast();
  const [tab, setTab] = React.useState<"active" | "archived">("active");
  const [query, setQuery] = React.useState("");
  const [editing, setEditing] = React.useState<AdminMenuItem | "new" | null>(null);
  const [catSheet, setCatSheet] = React.useState<AdminMenuCategory | "new" | null>(null);
  const [confirm, setConfirm] = React.useState<
    { kind: "archive-item" | "archive-cat"; id: string; name: string } | null
  >(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [costSheet, setCostSheet] = React.useState(false);

  const run = async (id: string, fn: () => Promise<ActionResult>) => {
    setBusyId(id);
    const res = await fn();
    setBusyId(null);
    toast(
      res.ok
        ? { tone: "success", title: res.message ?? c("save") }
        : { tone: "error", title: res.error ?? c("couldNotSave") },
    );
  };

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return items
      .filter((i) => (tab === "archived" ? i.isArchived : !i.isArchived))
      .filter((i) => (q ? i.name.toLowerCase().includes(q) : true));
  }, [items, tab, query]);

  const grouped = React.useMemo(() => {
    const groups = new Map<string, { name: string; emoji: string; items: AdminMenuItem[] }>();
    for (const item of filtered) {
      const key = item.categoryId ?? "none";
      const cat = categories.find((c) => c.id === item.categoryId);
      if (!groups.has(key)) {
        groups.set(key, {
          name: cat?.name ?? t("noGroup"),
          emoji: cat?.emoji ?? "\u{1F4CE}",
          items: [],
        });
      }
      groups.get(key)!.items.push(item);
    }
    return [...groups.entries()];
  }, [filtered, categories, t]);

  const activeCount = items.filter((i) => !i.isArchived).length;
  const archivedCount = items.length - activeCount;

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button
          variant="primary"
          size="md"
          className="flex-1"
          icon={<Plus className="size-4" />}
          onClick={() => setEditing("new")}
        >
          {t("addDish")}
        </Button>
        <Button
          variant="secondary"
          size="md"
          icon={<Tag className="size-4" />}
          onClick={() => setCatSheet("new")}
        >
          {t("group")}
        </Button>
        <IconButton label={t("adjustAllCosts")} variant="secondary" onClick={() => setCostSheet(true)}>
          <Percent className="size-4" />
        </IconButton>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-3" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("searchMenu")}
          className="h-11 w-full rounded-full border border-line bg-surface pr-4 pl-10 text-[15px] text-ink placeholder:text-ink-3 focus:border-brand focus:ring-4 focus:ring-brand/12 focus:outline-none"
        />
      </div>

      {archivedCount > 0 ? (
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "active", label: t("onTheMenu", { count: activeCount }) },
            { value: "archived", label: t("removed", { count: archivedCount }) },
          ]}
        />
      ) : null}

      {grouped.length === 0 ? (
        <EmptyState
          icon={<Utensils className="size-6" />}
          title={tab === "archived" ? t("nothingRemoved") : t("noDishes")}
          body={
            tab === "archived"
              ? t("archivedBody")
              : t("emptyBody")
          }
          action={
            tab === "active" ? (
              <Button variant="primary" onClick={() => setEditing("new")}>
                {t("addDish")}
              </Button>
            ) : undefined
          }
        />
      ) : (
        grouped.map(([key, group]) => (
          <div key={key} className="space-y-2">
            <p className="px-1 text-[12px] font-bold tracking-[0.05em] text-ink-3 uppercase">
              {group.emoji} {group.name}
              <span className="ml-1.5 font-medium normal-case">
                ({t("dishCount", { count: group.items.length })})
              </span>
            </p>

            <Card className="divide-y divide-line">
              {group.items.map((item) => {
                const margin =
                  item.priceCents > 0
                    ? ((item.priceCents - item.estCostCents) / item.priceCents) * 100
                    : 0;
                const low = margin < lowMarginPct;

                return (
                  <div key={item.id} className="flex items-center gap-3 p-3.5">
                    <span className="text-[22px] leading-none" aria-hidden>
                      {item.emoji}
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 truncate text-[14px] font-semibold text-ink">
                        {item.name}
                        {item.isFeatured ? (
                          <Star className="size-3.5 shrink-0 fill-brand text-brand" />
                        ) : null}
                        {!item.isAvailable && !item.isArchived ? (
                          <Badge tone="warn">{t("soldOut")}</Badge>
                        ) : null}
                      </p>
                      <p className="nums mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-ink-3">
                        <span className="font-semibold text-ink-2">
                          {formatMoney(item.priceCents)}
                        </span>
                        <span aria-hidden>-</span>
                        <span>{t("costsYouShort", { amount: formatMoney(item.estCostCents) })}</span>
                        <span aria-hidden>-</span>
                        <span
                          className={cn("font-semibold", low ? "text-loss" : "text-profit")}
                        >
                          {formatMoney(item.priceCents - item.estCostCents)} ({margin.toFixed(0)}%)
                        </span>
                        {item.soldLast30 > 0 ? (
                          <>
                            <span aria-hidden>-</span>
                            <span>{t("soldIn30", { count: item.soldLast30 })}</span>
                          </>
                        ) : null}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      {item.isArchived ? (
                        <IconButton
                          label={t("restoreItem", { name: item.name })}
                          disabled={busyId === item.id}
                          onClick={() => run(item.id, () => restoreMenuItem(item.id))}
                        >
                          <ArchiveRestore className="size-4" />
                        </IconButton>
                      ) : (
                        <>
                          <button
                            onClick={() =>
                              run(item.id, () => setItemAvailability(item.id, !item.isAvailable))
                            }
                            aria-label={item.isAvailable ? t("markSoldOut") : t("markInStock")}
                            className={cn(
                              "h-8 rounded-full px-2.5 text-[11.5px] font-bold transition active:scale-95",
                              item.isAvailable
                                ? "bg-profit-soft text-profit"
                                : "bg-warn-soft text-warn",
                            )}
                          >
                            {item.isAvailable ? t("inStock") : t("soldOut")}
                          </button>
                          <IconButton
                            label={item.isFeatured ? t("unpin") : t("pinToTill")}
                            disabled={busyId === item.id}
                            onClick={() =>
                              run(item.id, () => setItemFeatured(item.id, !item.isFeatured))
                            }
                          >
                            <Star
                              className={cn(
                                "size-4",
                                item.isFeatured && "fill-brand text-brand",
                              )}
                            />
                          </IconButton>
                          <IconButton label={t("editItem", { name: item.name })} onClick={() => setEditing(item)}>
                            <Pencil className="size-4" />
                          </IconButton>
                          <IconButton
                            label={t("removeItem", { name: item.name })}
                            onClick={() =>
                              setConfirm({ kind: "archive-item", id: item.id, name: item.name })
                            }
                          >
                            <Archive className="size-4" />
                          </IconButton>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </Card>
          </div>
        ))
      )}

      {/* Groups */}
      {categories.length > 0 ? (
        <div className="space-y-2 pt-2">
          <p className="px-1 text-[12px] font-bold tracking-[0.05em] text-ink-3 uppercase">
            {t("groups")}
          </p>
          <Card className="divide-y divide-line">
            {categories.map((c) => (
              <div key={c.id} className="flex items-center gap-3 p-3.5">
                <span className="text-[20px]" aria-hidden>
                  {c.emoji}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-semibold text-ink">{c.name}</p>
                  <p className="text-[12px] text-ink-3">{t("dishCount", { count: c.itemCount })}</p>
                </div>
                <IconButton label={t("editGroup", { name: c.name })} onClick={() => setCatSheet(c)}>
                  <Pencil className="size-4" />
                </IconButton>
                <IconButton
                  label={t("removeGroup", { name: c.name })}
                  onClick={() => setConfirm({ kind: "archive-cat", id: c.id, name: c.name })}
                >
                  <Archive className="size-4" />
                </IconButton>
              </div>
            ))}
          </Card>
        </div>
      ) : null}

      {editing ? (
        <ItemSheet
          item={editing === "new" ? null : editing}
          categories={categories}
          lowMarginPct={lowMarginPct}
          onClose={() => setEditing(null)}
        />
      ) : null}

      {catSheet ? (
        <CategorySheet
          category={catSheet === "new" ? null : catSheet}
          onClose={() => setCatSheet(null)}
        />
      ) : null}

      <BumpCostsSheet open={costSheet} onClose={() => setCostSheet(false)} />

      <ConfirmDialog
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        title={
          confirm?.kind === "archive-cat"
            ? t("removeGroupTitle", { name: confirm.name })
            : t("removeItemTitle", { name: confirm?.name ?? "" })
        }
        body={
          confirm?.kind === "archive-cat"
            ? t("removeGroupBody")
            : t("removeItemBody")
        }
        confirmLabel={t("remove")}
        destructive
        onConfirm={async () => {
          if (!confirm) return;
          const res =
            confirm.kind === "archive-cat"
              ? await archiveCategory(confirm.id)
              : await archiveMenuItem(confirm.id);
          setConfirm(null);
          toast(
            res.ok
              ? { tone: "success", title: res.message ?? t("removedToast") }
              : { tone: "error", title: res.error ?? t("couldNotRemove") },
          );
        }}
      />
    </div>
  );
}

/* ---------------------------------------------------------------- item form */

function ItemSheet({
  item,
  categories,
  lowMarginPct,
  onClose,
}: {
  item: AdminMenuItem | null;
  categories: AdminMenuCategory[];
  lowMarginPct: number;
  onClose: () => void;
}) {
  const t = useTranslations("AdminMenu");
  const c = useTranslations("Common");
  const { toast } = useToast();
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(
    saveMenuItem,
    null,
  );

  const [emoji, setEmoji] = React.useState(item?.emoji ?? "\u{1F35B}");
  const [price, setPrice] = React.useState(
    item ? (item.priceCents / 100).toFixed(2) : "",
  );
  const [cost, setCost] = React.useState(item ? (item.estCostCents / 100).toFixed(2) : "");
  const [available, setAvailable] = React.useState(item?.isAvailable ?? true);
  const [featured, setFeatured] = React.useState(item?.isFeatured ?? false);

  React.useEffect(() => {
    if (!state) return;
    if (state.ok) {
      toast({ tone: "success", title: state.message ?? c("save") });
      onClose();
    } else {
      toast({ tone: "error", title: state.error ?? c("couldNotSave") });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const priceCents = parseMoneyToCents(price) ?? 0;
  const costCents = parseMoneyToCents(cost) ?? 0;
  const profit = priceCents - costCents;
  const margin = priceCents > 0 ? (profit / priceCents) * 100 : 0;

  return (
    <Sheet
      open
      onClose={onClose}
      title={item ? t("editDish", { name: item.name }) : t("addDish")}
      subtitle={t("dishSubtitle")}
      size="md"
    >
      <form action={action} className="space-y-4 pt-1 pb-2">
        <input type="hidden" name="id" value={item?.id ?? ""} />
        <input type="hidden" name="emoji" value={emoji} />
        <input type="hidden" name="isAvailable" value={available ? "on" : ""} />
        <input type="hidden" name="isFeatured" value={featured ? "on" : ""} />

        <Field label={t("name")} required error={state?.fields?.name}>
          <Input
            name="name"
            defaultValue={item?.name ?? ""}
            placeholder={t("dishPlaceholder")}
            required
            maxLength={80}
            data-autofocus
          />
        </Field>

        <div>
          <span className="mb-1.5 block text-[13px] font-semibold text-ink-2">{t("picture")}</span>
          <div className="no-scrollbar flex gap-1.5 overflow-x-auto pb-1">
            {FOOD_EMOJI.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => setEmoji(e)}
                aria-label={`Use ${e}`}
                className={cn(
                  "flex size-11 shrink-0 items-center justify-center rounded-[12px] border text-[22px] transition active:scale-95",
                  emoji === e ? "border-brand bg-brand-soft" : "border-line bg-surface",
                )}
              >
                {e}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label={t("price")} required error={state?.fields?.price}>
            <Input
              name="price"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              inputMode="decimal"
              placeholder="0.00"
              prefix="Br"
              required
            />
          </Field>
          <Field
            label={t("costsYou")}
            error={state?.fields?.cost}
            hint={t("costHint")}
          >
            <Input
              name="cost"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              inputMode="decimal"
              placeholder="0.00"
              prefix="Br"
            />
          </Field>
        </div>

        {priceCents > 0 ? (
          <div
            className={cn(
              "rounded-[14px] p-3.5",
              margin < 0
                ? "bg-loss-soft"
                : margin < lowMarginPct
                  ? "bg-warn-soft"
                  : "bg-profit-soft",
            )}
          >
            <p className="flex items-center justify-between text-[13px] font-semibold">
              <span className={margin < lowMarginPct ? "text-warn" : "text-profit"}>
                {margin < 0
                  ? t("youLose", {
                      amount: formatMoney(Math.abs(profit)),
                      unit: t(`units.${item?.unit ?? "plate"}` as never),
                    })
                  : t("youKeep", {
                      amount: formatMoney(Math.abs(profit)),
                      unit: t(`units.${item?.unit ?? "plate"}` as never),
                    })}
              </span>
              <span
                className={cn(
                  "nums font-bold",
                  margin < lowMarginPct ? "text-warn" : "text-profit",
                )}
              >
                {margin.toFixed(0)}%
              </span>
            </p>
            {margin < lowMarginPct ? (
              <p className="mt-1.5 flex items-start gap-1.5 text-[12px] leading-snug text-warn">
                <TriangleAlert className="mt-px size-3.5 shrink-0" />
                {t("belowTarget", { pct: lowMarginPct })}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <Field label={t("group")}>
            <Select name="categoryId" defaultValue={item?.categoryId ?? ""}>
              <option value="">{t("noGroup")}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.emoji} {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("soldBy")}>
            <Select name="unit" defaultValue={item?.unit ?? "plate"}>
              {UNITS.map((u) => (
                <option key={u} value={u}>
                  {t(`units.${u}` as never)}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="rounded-[14px] border border-line px-3 py-1">
          <Toggle
            checked={available}
            onChange={setAvailable}
            label={t("availableNow")}
            description={t("availableHint")}
          />
          <div className="h-px bg-line" />
          <Toggle
            checked={featured}
            onChange={setFeatured}
            label={t("pinTop")}
            description={t("pinHint")}
          />
        </div>

        <div className="flex gap-2.5 pt-1">
          <Button type="button" variant="secondary" block onClick={onClose} disabled={pending}>
            {c("cancel")}
          </Button>
          <Button type="submit" variant="primary" block loading={pending}>
            {item ? t("saveChanges") : t("addToMenu")}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}

/* ------------------------------------------------------------ category form */

function CategorySheet({
  category,
  onClose,
}: {
  category: AdminMenuCategory | null;
  onClose: () => void;
}) {
  const t = useTranslations("AdminMenu");
  const c = useTranslations("Common");
  const { toast } = useToast();
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(
    saveCategory,
    null,
  );
  const [emoji, setEmoji] = React.useState(category?.emoji ?? "\u{1F37D}");

  React.useEffect(() => {
    if (!state) return;
    if (state.ok) {
      toast({ tone: "success", title: state.message ?? c("save") });
      onClose();
    } else {
      toast({ tone: "error", title: state.error ?? c("couldNotSave") });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <Sheet
      open
      onClose={onClose}
      title={category ? t("editGroup", { name: category.name }) : t("newGroup")}
      subtitle={t("groupSubtitle")}
      size="sm"
    >
      <form action={action} className="space-y-4 pt-1 pb-2">
        <input type="hidden" name="id" value={category?.id ?? ""} />
        <input type="hidden" name="emoji" value={emoji} />

        <Field label={t("name")} required>
          <Input
            name="name"
            defaultValue={category?.name ?? ""}
            placeholder={t("groupPlaceholder")}
            required
            data-autofocus
          />
        </Field>

        <div>
          <span className="mb-1.5 block text-[13px] font-semibold text-ink-2">{t("icon")}</span>
          <div className="no-scrollbar flex gap-1.5 overflow-x-auto pb-1">
            {FOOD_EMOJI.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => setEmoji(e)}
                aria-label={`Use ${e}`}
                className={cn(
                  "flex size-11 shrink-0 items-center justify-center rounded-[12px] border text-[22px]",
                  emoji === e ? "border-brand bg-brand-soft" : "border-line bg-surface",
                )}
              >
                {e}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2.5">
          <Button type="button" variant="secondary" block onClick={onClose} disabled={pending}>
            {c("cancel")}
          </Button>
          <Button type="submit" variant="primary" block loading={pending}>
            {c("save")}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}

/* -------------------------------------------------------------- bulk costs */

function BumpCostsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations("AdminMenu");
  const c = useTranslations("Common");
  const { toast } = useToast();
  const [percent, setPercent] = React.useState("10");
  const [busy, setBusy] = React.useState(false);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t("bumpTitle")}
      subtitle={t("bumpSubtitle")}
      size="sm"
      footer={
        <div className="flex gap-2.5">
          <Button variant="secondary" block onClick={onClose} disabled={busy}>
            {c("cancel")}
          </Button>
          <Button
            variant="primary"
            block
            loading={busy}
            onClick={async () => {
              setBusy(true);
              const res = await bumpCosts(Number(percent));
              setBusy(false);
              toast(
                res.ok
                  ? { tone: "success", title: res.message ?? t("updated") }
                  : { tone: "error", title: res.error ?? t("couldNotUpdate") },
              );
              if (res.ok) onClose();
            }}
          >
            {t("apply")}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 pt-1 pb-2">
        <Field
          label={t("bumpLabel")}
          hint={t("bumpHint")}
        >
          <Input
            value={percent}
            onChange={(e) => setPercent(e.target.value)}
            inputMode="numeric"
            prefix="%"
          />
        </Field>
        <p className="flex items-start gap-2 rounded-[12px] bg-info-soft px-3 py-2.5 text-[12px] leading-snug text-info">
          <ChevronDown className="mt-px size-3.5 shrink-0" />
          {t("bumpNote")}
        </p>
      </div>
    </Sheet>
  );
}
