import "server-only";
import { sql } from "@/db";
import { today, type DayKey } from "./dates";

export type ExpenseRow = {
  id: string;
  label: string;
  category: string;
  scope: "one_off" | "daily" | "weekly" | "monthly";
  amountCents: number;
  effectiveDate: DayKey;
  endDate: DayKey | null;
  replacesItemCosts: boolean;
  note: string | null;
  createdByName: string | null;
  createdAt: string;
  /** True when the expense still applies today. */
  isActive: boolean;
  /** What this expense contributes to a single day, in minor units. */
  perDayCents: number;
};

/** Daily-equivalent of an expense, matching the allocation used in reports. */
export function perDayCents(
  scope: ExpenseRow["scope"],
  amountCents: number,
  onDay: DayKey = today(),
): number {
  if (scope === "one_off") return amountCents;
  if (scope === "daily") return amountCents;
  if (scope === "weekly") return Math.round(amountCents / 7);
  const [y, m] = onDay.split("-").map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Math.round(amountCents / days);
}

export async function listExpenses({
  module = "restaurant",
  includeEnded = true,
  limit = 200,
}: {
  module?: "restaurant" | "shop";
  includeEnded?: boolean;
  limit?: number;
} = {}): Promise<ExpenseRow[]> {
  const t = today();

  const rows = (await sql`
    SELECT
      e.id::text, e.label, e.category, e.scope, e.amount_cents,
      to_char(e.effective_date, 'YYYY-MM-DD') AS effective_date,
      to_char(e.end_date, 'YYYY-MM-DD')       AS end_date,
      e.replaces_item_costs, e.note, e.created_at,
      u.name AS created_by_name,
      (
        e.effective_date <= ${t}::date
        AND (e.end_date IS NULL OR e.end_date >= ${t}::date)
        AND (e.scope <> 'one_off' OR e.effective_date = ${t}::date)
      ) AS is_active
    FROM expenses e
    LEFT JOIN users u ON u.id = e.created_by_id
    WHERE e.module = ${module}
      AND e.deleted_at IS NULL
    ORDER BY
      (e.end_date IS NULL AND e.scope <> 'one_off') DESC,
      e.effective_date DESC,
      e.created_at DESC
    LIMIT ${limit}
  `) as Record<string, unknown>[];

  const shaped = rows.map((r) => {
    const scope = String(r.scope) as ExpenseRow["scope"];
    const amountCents = Number(r.amount_cents);
    return {
      id: String(r.id),
      label: String(r.label),
      category: String(r.category),
      scope,
      amountCents,
      effectiveDate: String(r.effective_date),
      endDate: r.end_date ? String(r.end_date) : null,
      replacesItemCosts: Boolean(r.replaces_item_costs),
      note: (r.note as string) ?? null,
      createdByName: (r.created_by_name as string) ?? null,
      createdAt: String(r.created_at),
      isActive: Boolean(r.is_active),
      perDayCents: perDayCents(scope, amountCents, t),
    } satisfies ExpenseRow;
  });

  return includeEnded ? shaped : shaped.filter((e) => e.isActive);
}

/** Distinct categories already used, so the form can offer them. */
export async function listExpenseCategories(
  module: "restaurant" | "shop" = "restaurant",
): Promise<string[]> {
  const rows = (await sql`
    SELECT DISTINCT category FROM expenses
    WHERE module = ${module} AND deleted_at IS NULL
    ORDER BY category
  `) as { category: string }[];

  const defaults = [
    "food",
    "rent",
    "salary",
    "utilities",
    "supplies",
    "transport",
    "maintenance",
    "tax",
    "other",
  ];
  return [...new Set([...rows.map((r) => r.category), ...defaults])];
}
