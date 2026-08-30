/**
 * Reporting and the profit engine.
 *
 * ── How cost is decided ────────────────────────────────────────────────────
 * Two independent sources of cost exist, and admins asked for both:
 *
 *   I = item COGS   -> sum of the per-plate estimated costs snapshotted onto
 *                      each sale line at the moment of sale.
 *   A = override    -> allocated expenses flagged `replacesItemCosts`, i.e.
 *                      "forget the estimates, THIS is what the food cost me".
 *   B = overhead    -> every other allocated expense (rent, salary, fuel...).
 *
 * costingMode decides how they combine, per day:
 *   "item"   cost = I + A + B     (override demoted to an ordinary expense)
 *   "period" cost = A + B         (per-plate estimates ignored entirely)
 *   "auto"   cost = (A>0 ? A : I) + B   <- default; the override wins on the
 *                                          days it covers, estimates fill the
 *                                          gaps on every other day
 *
 * ── How recurring expenses are allocated ───────────────────────────────────
 * A daily expense hits every day in its window at full value; a weekly one is
 * spread as amount/7 per day; a monthly one as amount/days-in-that-month; a
 * one_off lands only on its effective date. So "5,000 Br a week for supplies"
 * shows up as ~714 Br of cost on a Tuesday, and the weekly and monthly
 * reports both add up to the same real money.
 */
import "server-only";
import { sql } from "@/db";
import type { CostingMode } from "./settings";
import { getSettings } from "./settings";
import {
  BUSINESS_TZ,
  eachDay,
  today as todayKey,
  type DayKey,
  type DateRange,
} from "./dates";

type Module = "restaurant" | "shop";

/** Neon returns SUM()/COUNT() as strings; normalise to numbers at the edge. */
const n = (v: unknown): number => (v == null ? 0 : Number(v));

/* ------------------------------------------------------------------- types */

export type DayRow = {
  day: DayKey;
  revenueCents: number;
  orders: number;
  items: number;
  discountCents: number;
  /** Per-plate estimated COGS (I). */
  itemCostCents: number;
  /** Allocated overriding expenses (A). */
  overrideCostCents: number;
  /** Allocated ordinary expenses (B). */
  overheadCents: number;
  /** Resolved cost of goods after applying costingMode. */
  cogsCents: number;
  /** cogs + overhead. */
  totalCostCents: number;
  profitCents: number;
};

export type Summary = {
  range: DateRange;
  revenueCents: number;
  orders: number;
  items: number;
  discountCents: number;
  itemCostCents: number;
  overrideCostCents: number;
  overheadCents: number;
  cogsCents: number;
  totalCostCents: number;
  profitCents: number;
  marginPct: number;
  avgOrderCents: number;
  /** True if any day in the range had its item estimates overridden. */
  usedOverride: boolean;
  costingMode: CostingMode;
  days: DayRow[];
};

export type ItemPerf = {
  key: string;
  menuItemId: string | null;
  name: string;
  emoji: string;
  category: string | null;
  qty: number;
  revenueCents: number;
  costCents: number;
  profitCents: number;
  marginPct: number;
  /** Share of total revenue in the range, 0-100. */
  revenueSharePct: number;
  orders: number;
};

/* ------------------------------------------------------- expense allocation */

type AllocRow = { day: DayKey; overrideCents: number; overheadCents: number };

/**
 * Per-day expense allocation for a window. Recurring expenses are prorated
 * here (see the module header) so every grain reconciles to the same money.
 *
 * Recurring expenses are capped at `capDay` (today). An open-ended "45,000 a
 * month for rent" describes an ongoing rate, not a debt already incurred for
 * the rest of the year - without the cap, opening the year view in January
 * would show twelve months of rent against one month of sales.
 */
export async function allocateExpenses(
  from: DayKey,
  to: DayKey,
  module: Module = "restaurant",
  capDay: DayKey = todayKey(),
): Promise<Map<DayKey, AllocRow>> {
  const rows = (await sql`
    WITH days AS (
      SELECT d::date AS day
      FROM generate_series(${from}::date, ${to}::date, interval '1 day') AS d
    ),
    alloc AS (
      SELECT
        days.day,
        e.replaces_item_costs,
        CASE e.scope
          WHEN 'one_off' THEN e.amount_cents::numeric
          WHEN 'daily'   THEN e.amount_cents::numeric
          WHEN 'weekly'  THEN e.amount_cents::numeric / 7
          WHEN 'monthly' THEN e.amount_cents::numeric
            / EXTRACT(DAY FROM (date_trunc('month', days.day) + interval '1 month - 1 day'))
        END AS amount
      FROM days
      JOIN expenses e
        ON e.module = ${module}
       AND e.deleted_at IS NULL
       AND (
            (e.scope = 'one_off' AND e.effective_date = days.day)
         OR (e.scope <> 'one_off'
             AND days.day <= ${capDay}::date
             AND e.effective_date <= days.day
             AND (e.end_date IS NULL OR e.end_date >= days.day))
       )
    )
    SELECT
      to_char(days.day, 'YYYY-MM-DD') AS day,
      COALESCE(ROUND(SUM(CASE WHEN a.replaces_item_costs THEN a.amount END)), 0) AS override_cents,
      COALESCE(ROUND(SUM(CASE WHEN NOT a.replaces_item_costs THEN a.amount END)), 0) AS overhead_cents
    FROM days
    LEFT JOIN alloc a ON a.day = days.day
    GROUP BY days.day
    ORDER BY days.day
  `) as Record<string, unknown>[];

  const map = new Map<DayKey, AllocRow>();
  for (const r of rows) {
    map.set(String(r.day), {
      day: String(r.day),
      overrideCents: n(r.override_cents),
      overheadCents: n(r.overhead_cents),
    });
  }
  return map;
}

/* --------------------------------------------------------------- day series */

/** Revenue and item-COGS per trading day, from completed sales only. */
async function salesByDay(from: DayKey, to: DayKey, module: Module) {
  const rows = (await sql`
    SELECT
      to_char(business_date, 'YYYY-MM-DD') AS day,
      COUNT(*)                        AS orders,
      COALESCE(SUM(total_cents), 0)      AS revenue_cents,
      COALESCE(SUM(total_cost_cents), 0) AS item_cost_cents,
      COALESCE(SUM(item_count), 0)       AS items,
      COALESCE(SUM(discount_cents), 0)   AS discount_cents
    FROM sales
    WHERE module = ${module}
      AND status = 'completed'
      AND business_date BETWEEN ${from}::date AND ${to}::date
    GROUP BY business_date
  `) as Record<string, unknown>[];

  return new Map(
    rows.map((r) => [
      String(r.day),
      {
        orders: n(r.orders),
        revenueCents: n(r.revenue_cents),
        itemCostCents: n(r.item_cost_cents),
        items: n(r.items),
        discountCents: n(r.discount_cents),
      },
    ]),
  );
}

/** Apply costingMode to one day's raw numbers. */
function resolveDay(
  day: DayKey,
  s: { orders: number; revenueCents: number; itemCostCents: number; items: number; discountCents: number },
  a: AllocRow,
  mode: CostingMode,
): DayRow {
  let cogs: number;
  if (mode === "item") cogs = s.itemCostCents + a.overrideCents;
  else if (mode === "period") cogs = a.overrideCents;
  else cogs = a.overrideCents > 0 ? a.overrideCents : s.itemCostCents;

  const totalCost = cogs + a.overheadCents;
  return {
    day,
    revenueCents: s.revenueCents,
    orders: s.orders,
    items: s.items,
    discountCents: s.discountCents,
    itemCostCents: s.itemCostCents,
    overrideCostCents: a.overrideCents,
    overheadCents: a.overheadCents,
    cogsCents: cogs,
    totalCostCents: totalCost,
    profitCents: s.revenueCents - totalCost,
  };
}

const EMPTY_DAY = {
  orders: 0,
  revenueCents: 0,
  itemCostCents: 0,
  items: 0,
  discountCents: 0,
};

/**
 * The one function every report goes through. Returns totals plus the padded
 * day-by-day series (zero-filled, so charts never have holes).
 */
export async function getSummary(
  range: DateRange,
  module: Module = "restaurant",
): Promise<Summary> {
  const [{ business }, sales, alloc] = await Promise.all([
    getSettings(),
    salesByDay(range.from, range.to, module),
    allocateExpenses(range.from, range.to, module),
  ]);
  const mode = business.costingMode;

  const days = eachDay(range.from, range.to).map((day) =>
    resolveDay(
      day,
      sales.get(day) ?? EMPTY_DAY,
      alloc.get(day) ?? { day, overrideCents: 0, overheadCents: 0 },
      mode,
    ),
  );

  const acc = days.reduce(
    (t, d) => ({
      revenueCents: t.revenueCents + d.revenueCents,
      orders: t.orders + d.orders,
      items: t.items + d.items,
      discountCents: t.discountCents + d.discountCents,
      itemCostCents: t.itemCostCents + d.itemCostCents,
      overrideCostCents: t.overrideCostCents + d.overrideCostCents,
      overheadCents: t.overheadCents + d.overheadCents,
      cogsCents: t.cogsCents + d.cogsCents,
      totalCostCents: t.totalCostCents + d.totalCostCents,
      profitCents: t.profitCents + d.profitCents,
    }),
    {
      revenueCents: 0, orders: 0, items: 0, discountCents: 0, itemCostCents: 0,
      overrideCostCents: 0, overheadCents: 0, cogsCents: 0, totalCostCents: 0, profitCents: 0,
    },
  );

  return {
    ...acc,
    range,
    marginPct: acc.revenueCents ? (acc.profitCents / acc.revenueCents) * 100 : 0,
    avgOrderCents: acc.orders ? Math.round(acc.revenueCents / acc.orders) : 0,
    usedOverride: mode !== "item" && acc.overrideCostCents > 0,
    costingMode: mode,
    days,
  };
}

/* ---------------------------------------------------------- item performance */

export async function getItemPerformance(
  range: DateRange,
  module: Module = "restaurant",
  limit = 100,
): Promise<ItemPerf[]> {
  const rows = (await sql`
    SELECT
      COALESCE(si.menu_item_id::text, 'name:' || si.name_snapshot) AS key,
      MAX(si.menu_item_id::text)          AS menu_item_id,
      MAX(si.name_snapshot)               AS name,
      MAX(si.emoji_snapshot)              AS emoji,
      MAX(si.category_name_snapshot)      AS category,
      SUM(si.qty)                         AS qty,
      SUM(si.line_total_cents)            AS revenue_cents,
      SUM(si.line_cost_cents)             AS cost_cents,
      COUNT(DISTINCT si.sale_id)          AS orders
    FROM sale_items si
    JOIN sales s ON s.id = si.sale_id
    WHERE s.module = ${module}
      AND s.status = 'completed'
      AND s.business_date BETWEEN ${range.from}::date AND ${range.to}::date
    GROUP BY 1
    ORDER BY revenue_cents DESC
    LIMIT ${limit}
  `) as Record<string, unknown>[];

  const total = rows.reduce((t, r) => t + n(r.revenue_cents), 0);

  return rows.map((r) => {
    const revenueCents = n(r.revenue_cents);
    const costCents = n(r.cost_cents);
    const profitCents = revenueCents - costCents;
    return {
      key: String(r.key),
      menuItemId: (r.menu_item_id as string) ?? null,
      name: String(r.name),
      emoji: String(r.emoji ?? "\u{1F35B}"),
      category: (r.category as string) ?? null,
      qty: n(r.qty),
      revenueCents,
      costCents,
      profitCents,
      marginPct: revenueCents ? (profitCents / revenueCents) * 100 : 0,
      revenueSharePct: total ? (revenueCents / total) * 100 : 0,
      orders: n(r.orders),
    };
  });
}

/** Revenue split by menu category. */
export async function getCategoryBreakdown(range: DateRange, module: Module = "restaurant") {
  const rows = (await sql`
    SELECT
      COALESCE(si.category_name_snapshot, 'Uncategorised') AS category,
      SUM(si.qty)              AS qty,
      SUM(si.line_total_cents) AS revenue_cents,
      SUM(si.line_cost_cents)  AS cost_cents
    FROM sale_items si
    JOIN sales s ON s.id = si.sale_id
    WHERE s.module = ${module}
      AND s.status = 'completed'
      AND s.business_date BETWEEN ${range.from}::date AND ${range.to}::date
    GROUP BY 1
    ORDER BY revenue_cents DESC
  `) as Record<string, unknown>[];

  return rows.map((r) => ({
    category: String(r.category),
    qty: n(r.qty),
    revenueCents: n(r.revenue_cents),
    costCents: n(r.cost_cents),
    profitCents: n(r.revenue_cents) - n(r.cost_cents),
  }));
}

/** Which hours of the day actually make money. Padded to all 24 hours. */
export async function getHourlyPattern(range: DateRange, module: Module = "restaurant") {
  const { business } = await getSettings();
  const tz = business.timezone || BUSINESS_TZ;
  const rows = (await sql`
    SELECT
      EXTRACT(HOUR FROM (sold_at AT TIME ZONE ${tz}))::int AS hour,
      COUNT(*)                      AS orders,
      COALESCE(SUM(total_cents), 0) AS revenue_cents
    FROM sales
    WHERE module = ${module}
      AND status = 'completed'
      AND business_date BETWEEN ${range.from}::date AND ${range.to}::date
    GROUP BY 1
    ORDER BY 1
  `) as Record<string, unknown>[];

  const byHour = new Map(rows.map((r) => [n(r.hour), r]));
  return Array.from({ length: 24 }, (_, hour) => {
    const r = byHour.get(hour);
    return {
      hour,
      label: `${((hour + 11) % 12) + 1}${hour < 12 ? "am" : "pm"}`,
      orders: r ? n(r.orders) : 0,
      revenueCents: r ? n(r.revenue_cents) : 0,
    };
  });
}

/** Average takings per weekday, to spot the quiet days. */
export async function getWeekdayPattern(range: DateRange, module: Module = "restaurant") {
  const rows = (await sql`
    SELECT
      EXTRACT(DOW FROM business_date)::int AS dow,
      COUNT(DISTINCT business_date)        AS days,
      COUNT(*)                             AS orders,
      COALESCE(SUM(total_cents), 0)        AS revenue_cents
    FROM sales
    WHERE module = ${module}
      AND status = 'completed'
      AND business_date BETWEEN ${range.from}::date AND ${range.to}::date
    GROUP BY 1
  `) as Record<string, unknown>[];

  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const byDow = new Map(rows.map((r) => [n(r.dow), r]));
  return names.map((label, dow) => {
    const r = byDow.get(dow);
    const days = r ? n(r.days) : 0;
    const revenueCents = r ? n(r.revenue_cents) : 0;
    return {
      dow,
      label,
      days,
      orders: r ? n(r.orders) : 0,
      revenueCents,
      avgRevenueCents: days ? Math.round(revenueCents / days) : 0,
    };
  });
}

export async function getStaffPerformance(range: DateRange, module: Module = "restaurant") {
  const rows = (await sql`
    SELECT
      s.staff_id::text                      AS staff_id,
      COALESCE(MAX(u.name), 'Unknown')      AS name,
      COALESCE(MAX(u.avatar), '\u{1F464}')  AS avatar,
      COUNT(*)                              AS orders,
      COALESCE(SUM(s.total_cents), 0)       AS revenue_cents,
      COALESCE(SUM(s.total_cost_cents), 0)  AS cost_cents,
      COALESCE(SUM(s.item_count), 0)        AS items
    FROM sales s
    LEFT JOIN users u ON u.id = s.staff_id
    WHERE s.module = ${module}
      AND s.status = 'completed'
      AND s.business_date BETWEEN ${range.from}::date AND ${range.to}::date
    GROUP BY s.staff_id
    ORDER BY revenue_cents DESC
  `) as Record<string, unknown>[];

  return rows.map((r) => ({
    staffId: (r.staff_id as string) ?? null,
    name: String(r.name),
    avatar: String(r.avatar),
    orders: n(r.orders),
    items: n(r.items),
    revenueCents: n(r.revenue_cents),
    costCents: n(r.cost_cents),
    avgOrderCents: n(r.orders) ? Math.round(n(r.revenue_cents) / n(r.orders)) : 0,
  }));
}

export async function getPaymentMix(range: DateRange, module: Module = "restaurant") {
  const rows = (await sql`
    SELECT payment_method AS method, COUNT(*) AS orders,
           COALESCE(SUM(total_cents), 0) AS revenue_cents
    FROM sales
    WHERE module = ${module}
      AND status = 'completed'
      AND business_date BETWEEN ${range.from}::date AND ${range.to}::date
    GROUP BY 1
    ORDER BY revenue_cents DESC
  `) as Record<string, unknown>[];
  return rows.map((r) => ({
    method: String(r.method),
    orders: n(r.orders),
    revenueCents: n(r.revenue_cents),
  }));
}

/** Actual (unallocated) expense rows touching a window, grouped by category. */
export async function getExpenseBreakdown(range: DateRange, module: Module = "restaurant") {
  const alloc = (await sql`
    WITH days AS (
      SELECT d::date AS day
      FROM generate_series(${range.from}::date, ${range.to}::date, interval '1 day') AS d
    )
    SELECT
      e.category,
      e.replaces_item_costs AS is_override,
      ROUND(SUM(
        CASE e.scope
          WHEN 'one_off' THEN e.amount_cents::numeric
          WHEN 'daily'   THEN e.amount_cents::numeric
          WHEN 'weekly'  THEN e.amount_cents::numeric / 7
          WHEN 'monthly' THEN e.amount_cents::numeric
            / EXTRACT(DAY FROM (date_trunc('month', days.day) + interval '1 month - 1 day'))
        END
      )) AS allocated_cents
    FROM days
    JOIN expenses e
      ON e.module = ${module}
     AND e.deleted_at IS NULL
     AND (
          (e.scope = 'one_off' AND e.effective_date = days.day)
       OR (e.scope <> 'one_off'
           AND days.day <= ${todayKey()}::date
           AND e.effective_date <= days.day
           AND (e.end_date IS NULL OR e.end_date >= days.day))
     )
    GROUP BY e.category, e.replaces_item_costs
    ORDER BY allocated_cents DESC
  `) as Record<string, unknown>[];

  return alloc.map((r) => ({
    category: String(r.category),
    isOverride: Boolean(r.is_override),
    allocatedCents: n(r.allocated_cents),
  }));
}

/** Daily revenue/qty trend for one dish - powers the item detail sparkline. */
export async function getItemTrend(
  menuItemId: string,
  range: DateRange,
  module: Module = "restaurant",
) {
  const rows = (await sql`
    SELECT to_char(s.business_date, 'YYYY-MM-DD') AS day,
           SUM(si.qty) AS qty,
           SUM(si.line_total_cents) AS revenue_cents,
           SUM(si.line_cost_cents) AS cost_cents
    FROM sale_items si
    JOIN sales s ON s.id = si.sale_id
    WHERE si.menu_item_id = ${menuItemId}::uuid
      AND s.module = ${module}
      AND s.status = 'completed'
      AND s.business_date BETWEEN ${range.from}::date AND ${range.to}::date
    GROUP BY s.business_date
  `) as Record<string, unknown>[];

  const byDay = new Map(rows.map((r) => [String(r.day), r]));
  return eachDay(range.from, range.to).map((day) => {
    const r = byDay.get(day);
    return {
      day,
      qty: r ? n(r.qty) : 0,
      revenueCents: r ? n(r.revenue_cents) : 0,
      costCents: r ? n(r.cost_cents) : 0,
    };
  });
}

/** Menu items with zero sales in the window - candidates to cut. */
export async function getDeadStock(range: DateRange, module: Module = "restaurant") {
  const rows = (await sql`
    SELECT m.id::text, m.name, m.emoji, m.price_cents, m.est_cost_cents
    FROM menu_items m
    WHERE m.module = ${module}
      AND m.archived_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM sale_items si
        JOIN sales s ON s.id = si.sale_id
        WHERE si.menu_item_id = m.id
          AND s.status = 'completed'
          AND s.business_date BETWEEN ${range.from}::date AND ${range.to}::date
      )
    ORDER BY m.name
  `) as Record<string, unknown>[];

  return rows.map((r) => ({
    id: String(r.id),
    name: String(r.name),
    emoji: String(r.emoji),
    priceCents: n(r.price_cents),
    estCostCents: n(r.est_cost_cents),
  }));
}

/** Recent orders for the day log. */
export async function getRecentSales(
  range: DateRange,
  module: Module = "restaurant",
  limit = 200,
) {
  const rows = (await sql`
    SELECT
      s.id::text, s.client_id, s.sold_at, s.synced_at, s.status, s.payment_method,
      s.total_cents, s.total_cost_cents, s.discount_cents, s.item_count,
      s.table_label, s.customer_note, s.void_reason,
      to_char(s.business_date, 'YYYY-MM-DD') AS business_date,
      COALESCE(u.name, 'Unknown') AS staff_name,
      COALESCE(u.avatar, '\u{1F464}') AS staff_avatar,
      COALESCE(
        json_agg(
          json_build_object(
            'name', si.name_snapshot,
            'emoji', si.emoji_snapshot,
            'qty', si.qty,
            'unitPriceCents', si.unit_price_cents,
            'lineTotalCents', si.line_total_cents
          ) ORDER BY si.name_snapshot
        ) FILTER (WHERE si.id IS NOT NULL),
        '[]'::json
      ) AS lines
    FROM sales s
    LEFT JOIN users u ON u.id = s.staff_id
    LEFT JOIN sale_items si ON si.sale_id = s.id
    WHERE s.module = ${module}
      AND s.business_date BETWEEN ${range.from}::date AND ${range.to}::date
    GROUP BY s.id, u.name, u.avatar
    ORDER BY s.sold_at DESC
    LIMIT ${limit}
  `) as Record<string, unknown>[];

  return rows.map((r) => ({
    id: String(r.id),
    clientId: String(r.client_id),
    soldAt: String(r.sold_at),
    syncedAt: String(r.synced_at),
    businessDate: String(r.business_date),
    status: String(r.status) as "completed" | "void",
    paymentMethod: String(r.payment_method),
    totalCents: n(r.total_cents),
    totalCostCents: n(r.total_cost_cents),
    discountCents: n(r.discount_cents),
    itemCount: n(r.item_count),
    tableLabel: (r.table_label as string) ?? null,
    customerNote: (r.customer_note as string) ?? null,
    voidReason: (r.void_reason as string) ?? null,
    staffName: String(r.staff_name),
    staffAvatar: String(r.staff_avatar),
    lines: (r.lines ?? []) as {
      name: string;
      emoji: string;
      qty: number;
      unitPriceCents: number;
      lineTotalCents: number;
    }[],
  }));
}

export type RecentSale = Awaited<ReturnType<typeof getRecentSales>>[number];

/**
 * Item performance for several windows in ONE query.
 *
 * The reports page compares the same dishes across today / this week / this
 * month / this year. Running four separate aggregations means four round trips
 * and four connections; a single pass with FILTER clauses is one of each.
 * The windows must all sit inside the widest one, which is true for any nested
 * day-in-week-in-month-in-year set.
 */
export async function getItemPerformanceWindows(
  windows: { label: string; from: DayKey; to: DayKey }[],
  module: Module = "restaurant",
  limitPerWindow = 40,
): Promise<Record<string, ItemPerf[]>> {
  if (windows.length === 0) return {};

  const outerFrom = windows.reduce((a, w) => (w.from < a ? w.from : a), windows[0].from);
  const outerTo = windows.reduce((a, w) => (w.to > a ? w.to : a), windows[0].to);

  const rows = (await sql`
    SELECT
      COALESCE(si.menu_item_id::text, 'name:' || si.name_snapshot) AS key,
      MAX(si.menu_item_id::text)     AS menu_item_id,
      MAX(si.name_snapshot)          AS name,
      MAX(si.emoji_snapshot)         AS emoji,
      MAX(si.category_name_snapshot) AS category,
      to_char(s.business_date, 'YYYY-MM-DD') AS day,
      SUM(si.qty)                    AS qty,
      SUM(si.line_total_cents)       AS revenue_cents,
      SUM(si.line_cost_cents)        AS cost_cents,
      COUNT(DISTINCT si.sale_id)     AS orders
    FROM sale_items si
    JOIN sales s ON s.id = si.sale_id
    WHERE s.module = ${module}
      AND s.status = 'completed'
      AND s.business_date BETWEEN ${outerFrom}::date AND ${outerTo}::date
    GROUP BY 1, 6
  `) as Record<string, unknown>[];

  const out: Record<string, ItemPerf[]> = {};

  for (const w of windows) {
    const byKey = new Map<string, ItemPerf>();

    for (const r of rows) {
      const day = String(r.day);
      if (day < w.from || day > w.to) continue;

      const key = String(r.key);
      const existing = byKey.get(key);
      const qty = n(r.qty);
      const revenueCents = n(r.revenue_cents);
      const costCents = n(r.cost_cents);
      const orders = n(r.orders);

      if (existing) {
        existing.qty += qty;
        existing.revenueCents += revenueCents;
        existing.costCents += costCents;
        existing.orders += orders;
      } else {
        byKey.set(key, {
          key,
          menuItemId: (r.menu_item_id as string) ?? null,
          name: String(r.name),
          emoji: String(r.emoji ?? "\u{1F35B}"),
          category: (r.category as string) ?? null,
          qty,
          revenueCents,
          costCents,
          profitCents: 0,
          marginPct: 0,
          revenueSharePct: 0,
          orders,
        });
      }
    }

    const list = [...byKey.values()];
    const total = list.reduce((t, i) => t + i.revenueCents, 0);
    for (const i of list) {
      i.profitCents = i.revenueCents - i.costCents;
      i.marginPct = i.revenueCents ? (i.profitCents / i.revenueCents) * 100 : 0;
      i.revenueSharePct = total ? (i.revenueCents / total) * 100 : 0;
    }
    list.sort((a, b) => b.revenueCents - a.revenueCents);
    out[w.label] = list.slice(0, limitPerWindow);
  }

  return out;
}
