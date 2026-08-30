"use server";
/**
 * Menu management (admin only).
 *
 * Editing a price or a cost estimate NEVER rewrites history: past sales carry
 * their own snapshot of both. So an admin can refine estimates freely and last
 * month's reported profit stays exactly as it was reported.
 */
import { revalidatePath } from "next/cache";
import { and, eq, isNull, max } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { activityLog, categories, menuItems } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { parseMoneyToCents } from "@/lib/money";
import { fail, ok, toActionError, type ActionResult } from "./_result";

const moneyField = (label: string) =>
  z
    .string()
    .transform((v) => parseMoneyToCents(v))
    .refine((v): v is number => v !== null && v >= 0, `Enter a valid ${label}.`);

const itemSchema = z.object({
  id: z.string().uuid().optional().or(z.literal("")),
  name: z.string().trim().min(1, "Give the dish a name.").max(80),
  emoji: z.string().trim().max(16).default("\u{1F35B}"),
  categoryId: z.string().uuid().nullable().optional().or(z.literal("")),
  price: moneyField("price"),
  cost: moneyField("cost estimate"),
  unit: z.string().trim().max(24).default("plate"),
  isAvailable: z.boolean().default(true),
  isFeatured: z.boolean().default(false),
});

const categorySchema = z.object({
  id: z.string().uuid().optional().or(z.literal("")),
  name: z.string().trim().min(1, "Give the group a name.").max(60),
  emoji: z.string().trim().max(16).default("\u{1F37D}"),
  color: z.string().trim().max(24).default("amber"),
});

const bool = (v: FormDataEntryValue | null) => v === "on" || v === "true" || v === "1";

/* -------------------------------------------------------------- menu items */

export async function saveMenuItem(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();

    const parsed = itemSchema.safeParse({
      id: formData.get("id") ?? "",
      name: formData.get("name") ?? "",
      emoji: (formData.get("emoji") as string) || "\u{1F35B}",
      categoryId: formData.get("categoryId") ?? "",
      price: String(formData.get("price") ?? ""),
      cost: String(formData.get("cost") ?? "0"),
      unit: (formData.get("unit") as string) || "plate",
      isAvailable: bool(formData.get("isAvailable")),
      isFeatured: bool(formData.get("isFeatured")),
    });

    if (!parsed.success) {
      const fields: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        fields[String(issue.path[0])] = issue.message;
      }
      return fail("Please check the highlighted fields.", fields);
    }

    const v = parsed.data;
    if (v.cost > v.price) {
      return fail("The cost estimate is higher than the price - you would lose money on this.", {
        cost: "Higher than the price",
      });
    }

    const categoryId = v.categoryId ? v.categoryId : null;

    if (v.id) {
      await db
        .update(menuItems)
        .set({
          name: v.name,
          emoji: v.emoji,
          categoryId,
          priceCents: v.price,
          estCostCents: v.cost,
          unit: v.unit,
          isAvailable: v.isAvailable,
          isFeatured: v.isFeatured,
          updatedAt: new Date(),
        })
        .where(eq(menuItems.id, v.id));

      await db.insert(activityLog).values({
        actorId: admin.id,
        action: "menu-item-update",
        entity: "menu_item",
        entityId: v.id,
        detail: { name: v.name, priceCents: v.price, estCostCents: v.cost },
      });
    } else {
      // New items go to the end of their group.
      const [{ value: highest } = { value: 0 }] = await db
        .select({ value: max(menuItems.sortOrder) })
        .from(menuItems)
        .where(eq(menuItems.module, "restaurant"));

      const [row] = await db
        .insert(menuItems)
        .values({
          module: "restaurant",
          name: v.name,
          emoji: v.emoji,
          categoryId,
          priceCents: v.price,
          estCostCents: v.cost,
          unit: v.unit,
          isAvailable: v.isAvailable,
          isFeatured: v.isFeatured,
          sortOrder: (highest ?? 0) + 10,
        })
        .returning({ id: menuItems.id });

      await db.insert(activityLog).values({
        actorId: admin.id,
        action: "menu-item-create",
        entity: "menu_item",
        entityId: row.id,
        detail: { name: v.name, priceCents: v.price, estCostCents: v.cost },
      });
    }

    revalidatePath("/admin/menu");
    revalidatePath("/staff");
    return ok(v.id ? `${v.name} updated.` : `${v.name} added to the menu.`);
  } catch (err) {
    return toActionError(err);
  }
}

/**
 * Archive rather than delete. Sale history keeps pointing at the row, so old
 * reports still resolve the dish, and it can be brought back.
 */
export async function archiveMenuItem(id: string): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    const [row] = await db
      .update(menuItems)
      .set({ archivedAt: new Date(), isAvailable: false, isFeatured: false })
      .where(eq(menuItems.id, id))
      .returning({ name: menuItems.name });

    await db.insert(activityLog).values({
      actorId: admin.id,
      action: "menu-item-archive",
      entity: "menu_item",
      entityId: id,
    });

    revalidatePath("/admin/menu");
    revalidatePath("/staff");
    return ok(`${row?.name ?? "Item"} removed from the menu.`);
  } catch (err) {
    return toActionError(err);
  }
}

export async function restoreMenuItem(id: string): Promise<ActionResult> {
  try {
    await requireAdmin();
    await db
      .update(menuItems)
      .set({ archivedAt: null, isAvailable: true })
      .where(eq(menuItems.id, id));
    revalidatePath("/admin/menu");
    revalidatePath("/staff");
    return ok("Item is back on the menu.");
  } catch (err) {
    return toActionError(err);
  }
}

/** The one-tap control staff care about: "we ran out of this". */
export async function setItemAvailability(id: string, available: boolean): Promise<ActionResult> {
  try {
    await requireAdmin();
    await db
      .update(menuItems)
      .set({ isAvailable: available, updatedAt: new Date() })
      .where(eq(menuItems.id, id));
    revalidatePath("/admin/menu");
    revalidatePath("/staff");
    return ok(available ? "Back in stock." : "Marked as sold out.");
  } catch (err) {
    return toActionError(err);
  }
}

export async function setItemFeatured(id: string, featured: boolean): Promise<ActionResult> {
  try {
    await requireAdmin();
    await db
      .update(menuItems)
      .set({ isFeatured: featured, updatedAt: new Date() })
      .where(eq(menuItems.id, id));
    revalidatePath("/admin/menu");
    revalidatePath("/staff");
    return ok(featured ? "Pinned to the top of the till." : "Unpinned.");
  } catch (err) {
    return toActionError(err);
  }
}

/** Bulk cost update - the fastest way to react to a market price change. */
export async function bumpCosts(percent: number): Promise<ActionResult> {
  try {
    await requireAdmin();
    if (!Number.isFinite(percent) || percent < -90 || percent > 300) {
      return fail("Enter a change between -90% and 300%.");
    }
    const factor = 1 + percent / 100;
    const rows = await db
      .select({ id: menuItems.id, cost: menuItems.estCostCents })
      .from(menuItems)
      .where(and(eq(menuItems.module, "restaurant"), isNull(menuItems.archivedAt)));

    for (const row of rows) {
      await db
        .update(menuItems)
        .set({ estCostCents: Math.max(0, Math.round(row.cost * factor)), updatedAt: new Date() })
        .where(eq(menuItems.id, row.id));
    }

    revalidatePath("/admin/menu");
    return ok(`Cost estimates changed by ${percent > 0 ? "+" : ""}${percent}%.`);
  } catch (err) {
    return toActionError(err);
  }
}

/* -------------------------------------------------------------- categories */

export async function saveCategory(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireAdmin();
    const parsed = categorySchema.safeParse({
      id: formData.get("id") ?? "",
      name: formData.get("name") ?? "",
      emoji: (formData.get("emoji") as string) || "\u{1F37D}",
      color: (formData.get("color") as string) || "amber",
    });

    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Please check the form.");
    }
    const v = parsed.data;

    if (v.id) {
      await db
        .update(categories)
        .set({ name: v.name, emoji: v.emoji, color: v.color })
        .where(eq(categories.id, v.id));
    } else {
      const [{ value: highest } = { value: 0 }] = await db
        .select({ value: max(categories.sortOrder) })
        .from(categories)
        .where(eq(categories.module, "restaurant"));

      await db.insert(categories).values({
        module: "restaurant",
        name: v.name,
        emoji: v.emoji,
        color: v.color,
        sortOrder: (highest ?? 0) + 10,
      });
    }

    revalidatePath("/admin/menu");
    revalidatePath("/staff");
    return ok(v.id ? "Group updated." : `${v.name} group added.`);
  } catch (err) {
    return toActionError(err);
  }
}

export async function archiveCategory(id: string): Promise<ActionResult> {
  try {
    await requireAdmin();
    // Items keep working; they just lose their group label.
    await db.update(categories).set({ archivedAt: new Date() }).where(eq(categories.id, id));
    await db.update(menuItems).set({ categoryId: null }).where(eq(menuItems.categoryId, id));
    revalidatePath("/admin/menu");
    revalidatePath("/staff");
    return ok("Group removed. Its dishes are still on the menu.");
  } catch (err) {
    return toActionError(err);
  }
}
