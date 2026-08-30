import "server-only";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db, sql } from "@/db";
import { categories, menuItems } from "@/db/schema";
import { getBusinessSettings } from "./settings";
import type { MenuCategory, MenuSnapshot } from "./menu-types";

export type { MenuSnapshot } from "./menu-types";

/**
 * The menu as the till needs it: one flat payload, safe to hand to a client
 * component and to store in IndexedDB.
 *
 * estCostCents travels with it because the device snapshots the cost onto each
 * sale line at the moment of sale. It is not shown to staff anywhere in the
 * UI, but it does reach a staff phone - so treat the till bundle as
 * "trusted team member" data rather than public.
 */
export async function getMenuSnapshot(
  module: "restaurant" | "shop" = "restaurant",
): Promise<MenuSnapshot> {
  const [business, cats, items] = await Promise.all([
    getBusinessSettings(),
    db
      .select()
      .from(categories)
      .where(and(eq(categories.module, module), isNull(categories.archivedAt)))
      .orderBy(asc(categories.sortOrder), asc(categories.name)),
    db
      .select()
      .from(menuItems)
      .where(and(eq(menuItems.module, module), isNull(menuItems.archivedAt)))
      .orderBy(asc(menuItems.sortOrder), asc(menuItems.name)),
  ]);

  const catName = new Map(cats.map((c) => [c.id, c.name]));

  return {
    at: new Date().toISOString(),
    currency: business.currency,
    restaurantName: business.restaurantName,
    categories: cats.map((c) => ({
      id: c.id,
      name: c.name,
      emoji: c.emoji,
      color: c.color,
      sortOrder: c.sortOrder,
    })),
    items: items.map((i) => ({
      id: i.id,
      categoryId: i.categoryId,
      categoryName: i.categoryId ? (catName.get(i.categoryId) ?? null) : null,
      name: i.name,
      emoji: i.emoji,
      priceCents: i.priceCents,
      estCostCents: i.estCostCents,
      unit: i.unit,
      isAvailable: i.isAvailable,
      isFeatured: i.isFeatured,
      sortOrder: i.sortOrder,
    })),
  };
}

export type AdminMenuItem = {
  id: string;
  name: string;
  emoji: string;
  categoryId: string | null;
  categoryName: string | null;
  priceCents: number;
  estCostCents: number;
  unit: string;
  isAvailable: boolean;
  isFeatured: boolean;
  isArchived: boolean;
  /** Units sold in the last 30 trading days - context for pricing decisions. */
  soldLast30: number;
};

export type AdminMenuCategory = MenuCategory & { itemCount: number };

/**
 * Everything the menu editor needs, including archived rows (so they can be
 * restored) and a 30-day sales count per dish.
 */
export async function getMenuForAdmin(module: "restaurant" | "shop" = "restaurant") {
  const [catRows, itemRows] = await Promise.all([
    sql`
      SELECT c.id::text, c.name, c.emoji, c.color, c.sort_order,
             (SELECT count(*)::int FROM menu_items m
               WHERE m.category_id = c.id AND m.archived_at IS NULL) AS item_count
      FROM categories c
      WHERE c.module = ${module} AND c.archived_at IS NULL
      ORDER BY c.sort_order, c.name
    `,
    sql`
      SELECT m.id::text, m.name, m.emoji, m.category_id::text, c.name AS category_name,
             m.price_cents, m.est_cost_cents, m.unit, m.is_available, m.is_featured,
             (m.archived_at IS NOT NULL) AS is_archived,
             COALESCE((
               SELECT SUM(si.qty)::int
               FROM sale_items si
               JOIN sales s ON s.id = si.sale_id
               WHERE si.menu_item_id = m.id
                 AND s.status = 'completed'
                 AND s.business_date >= (CURRENT_DATE - INTERVAL '30 days')
             ), 0) AS sold_last_30
      FROM menu_items m
      LEFT JOIN categories c ON c.id = m.category_id
      WHERE m.module = ${module}
      ORDER BY m.archived_at NULLS FIRST, c.sort_order NULLS LAST, m.sort_order, m.name
    `,
  ]);

  const categories: AdminMenuCategory[] = (catRows as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    name: String(r.name),
    emoji: String(r.emoji),
    color: String(r.color),
    sortOrder: Number(r.sort_order),
    itemCount: Number(r.item_count ?? 0),
  }));

  const items: AdminMenuItem[] = (itemRows as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    name: String(r.name),
    emoji: String(r.emoji),
    categoryId: (r.category_id as string) ?? null,
    categoryName: (r.category_name as string) ?? null,
    priceCents: Number(r.price_cents),
    estCostCents: Number(r.est_cost_cents),
    unit: String(r.unit),
    isAvailable: Boolean(r.is_available),
    isFeatured: Boolean(r.is_featured),
    isArchived: Boolean(r.is_archived),
    soldLast30: Number(r.sold_last_30 ?? 0),
  }));

  return { categories, items };
}

/** One dish, for the detail page. Returns null if the id is unknown. */
export async function getMenuItemById(id: string): Promise<AdminMenuItem | null> {
  const rows = (await sql`
    SELECT m.id::text, m.name, m.emoji, m.category_id::text, c.name AS category_name,
           m.price_cents, m.est_cost_cents, m.unit, m.is_available, m.is_featured,
           (m.archived_at IS NOT NULL) AS is_archived,
           COALESCE((
             SELECT SUM(si.qty)::int
             FROM sale_items si
             JOIN sales s ON s.id = si.sale_id
             WHERE si.menu_item_id = m.id
               AND s.status = 'completed'
               AND s.business_date >= (CURRENT_DATE - INTERVAL '30 days')
           ), 0) AS sold_last_30
    FROM menu_items m
    LEFT JOIN categories c ON c.id = m.category_id
    WHERE m.id = ${id}::uuid
    LIMIT 1
  `) as Record<string, unknown>[];

  if (!rows.length) return null;
  const r = rows[0];
  return {
    id: String(r.id),
    name: String(r.name),
    emoji: String(r.emoji),
    categoryId: (r.category_id as string) ?? null,
    categoryName: (r.category_name as string) ?? null,
    priceCents: Number(r.price_cents),
    estCostCents: Number(r.est_cost_cents),
    unit: String(r.unit),
    isAvailable: Boolean(r.is_available),
    isFeatured: Boolean(r.is_featured),
    isArchived: Boolean(r.is_archived),
    soldLast30: Number(r.sold_last_30 ?? 0),
  };
}
