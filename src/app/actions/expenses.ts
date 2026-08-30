"use server";
/**
 * Expense management (admin only).
 *
 * Two kinds of expense live in one table:
 *   - ordinary running costs (rent, salary, gas) -> added on top of food cost
 *   - "this is what the food actually cost me"   -> replaces the per-plate
 *     estimates for the days it covers (replacesItemCosts)
 *
 * The second one is the override the owner asked for: start with rough
 * per-plate guesses, then correct the record with the real market spend
 * without having to touch thirty individual dishes.
 */
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { activityLog, expenses } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { parseMoneyToCents } from "@/lib/money";
import { newId } from "@/lib/utils";
import { fail, ok, toActionError, type ActionResult } from "./_result";

const dateField = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date.");

const schema = z
  .object({
    id: z.string().uuid().optional().or(z.literal("")),
    label: z.string().trim().min(1, "What was this for?").max(120),
    category: z.string().trim().min(1).max(60).default("general"),
    amount: z
      .string()
      .transform((v) => parseMoneyToCents(v))
      .refine((v): v is number => v !== null && v > 0, "Enter an amount."),
    scope: z.enum(["one_off", "daily", "weekly", "monthly"]),
    effectiveDate: dateField,
    endDate: dateField.nullable().optional().or(z.literal("")),
    replacesItemCosts: z.boolean().default(false),
    note: z.string().trim().max(1000).optional().or(z.literal("")),
  })
  .refine(
    (v) => !v.endDate || v.endDate >= v.effectiveDate,
    { message: "The end date cannot be before the start date.", path: ["endDate"] },
  );

const bool = (v: FormDataEntryValue | null) => v === "on" || v === "true" || v === "1";

export async function saveExpense(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();

    const parsed = schema.safeParse({
      id: formData.get("id") ?? "",
      label: formData.get("label") ?? "",
      category: (formData.get("category") as string) || "general",
      amount: String(formData.get("amount") ?? ""),
      scope: (formData.get("scope") as string) || "one_off",
      effectiveDate: formData.get("effectiveDate") ?? "",
      endDate: (formData.get("endDate") as string) || "",
      replacesItemCosts: bool(formData.get("replacesItemCosts")),
      note: (formData.get("note") as string) || "",
    });

    if (!parsed.success) {
      const fields: Record<string, string> = {};
      for (const issue of parsed.error.issues) fields[String(issue.path[0])] = issue.message;
      return fail(parsed.error.issues[0]?.message ?? "Please check the form.", fields);
    }

    const v = parsed.data;
    const endDate = v.endDate ? v.endDate : null;

    if (v.id) {
      await db
        .update(expenses)
        .set({
          label: v.label,
          category: v.category,
          amountCents: v.amount,
          scope: v.scope,
          effectiveDate: v.effectiveDate,
          endDate,
          replacesItemCosts: v.replacesItemCosts,
          note: v.note || null,
        })
        .where(eq(expenses.id, v.id));

      await db.insert(activityLog).values({
        actorId: admin.id,
        action: "expense-update",
        entity: "expense",
        entityId: v.id,
        detail: { label: v.label, amountCents: v.amount, scope: v.scope },
      });
    } else {
      const [row] = await db
        .insert(expenses)
        .values({
          // Admin edits happen online, but the clientId keeps this table's
          // idempotency contract identical to the offline path.
          clientId: newId(),
          module: "restaurant",
          label: v.label,
          category: v.category,
          amountCents: v.amount,
          scope: v.scope,
          effectiveDate: v.effectiveDate,
          endDate,
          replacesItemCosts: v.replacesItemCosts,
          note: v.note || null,
          createdById: admin.id,
        })
        .returning({ id: expenses.id });

      await db.insert(activityLog).values({
        actorId: admin.id,
        action: "expense-create",
        entity: "expense",
        entityId: row.id,
        detail: { label: v.label, amountCents: v.amount, scope: v.scope },
      });
    }

    revalidatePath("/admin/expenses");
    revalidatePath("/admin");
    revalidatePath("/admin/analytics");
    return ok(v.id ? "Expense updated." : `${v.label} recorded.`);
  } catch (err) {
    return toActionError(err);
  }
}

/** Soft delete, so reports for a closed period never silently change shape. */
export async function deleteExpense(id: string): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    const [row] = await db
      .update(expenses)
      .set({ deletedAt: new Date() })
      .where(eq(expenses.id, id))
      .returning({ label: expenses.label });

    await db.insert(activityLog).values({
      actorId: admin.id,
      action: "expense-delete",
      entity: "expense",
      entityId: id,
    });

    revalidatePath("/admin/expenses");
    revalidatePath("/admin");
    revalidatePath("/admin/analytics");
    return ok(`${row?.label ?? "Expense"} removed.`);
  } catch (err) {
    return toActionError(err);
  }
}

/** Stop an open-ended recurring expense from today onward. */
export async function endRecurringExpense(id: string, lastDay: string): Promise<ActionResult> {
  try {
    await requireAdmin();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(lastDay)) return fail("Pick a valid date.");
    await db.update(expenses).set({ endDate: lastDay }).where(eq(expenses.id, id));
    revalidatePath("/admin/expenses");
    revalidatePath("/admin");
    return ok(`Stopped after ${lastDay}.`);
  } catch (err) {
    return toActionError(err);
  }
}
