"use server";
/**
 * Corrections to recorded sales (admin only).
 *
 * Sales are never deleted - they are voided, with a reason and an author.
 * Reports exclude voided rows, but the row itself stays, because "the number
 * changed and nobody knows why" is exactly the failure this app exists to
 * prevent.
 */
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { activityLog, sales } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { notifyAdmins } from "@/lib/push";
import { formatMoney } from "@/lib/money";
import { fail, ok, toActionError, type ActionResult } from "./_result";

export async function voidSale(id: string, reason: string): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    const trimmed = reason.trim();
    if (trimmed.length < 3) return fail("Please say why this order is being cancelled.");

    const [row] = await db
      .update(sales)
      .set({
        status: "void",
        voidedAt: new Date(),
        voidedById: admin.id,
        voidReason: trimmed.slice(0, 300),
      })
      .where(eq(sales.id, id))
      .returning({ total: sales.totalCents, businessDate: sales.businessDate });

    if (!row) return fail("That order no longer exists.");

    await db.insert(activityLog).values({
      actorId: admin.id,
      action: "sale-void",
      entity: "sale",
      entityId: id,
      detail: { reason: trimmed, totalCents: row.total },
    });

    const { notify } = await getSettings();
    if (notify.onVoid) {
      await notifyAdmins(
        {
          title: `Order cancelled - ${formatMoney(row.total)}`,
          body: `${admin.name}: ${trimmed}`,
          url: "/admin/log",
          kind: "void",
          tag: "void",
        },
        admin.id,
      ).catch(() => {});
    }

    revalidatePath("/admin/log");
    revalidatePath("/admin");
    revalidatePath("/admin/analytics");
    return ok("Order cancelled and removed from the totals.");
  } catch (err) {
    return toActionError(err);
  }
}

export async function unvoidSale(id: string): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    await db
      .update(sales)
      .set({ status: "completed", voidedAt: null, voidedById: null, voidReason: null })
      .where(eq(sales.id, id));

    await db.insert(activityLog).values({
      actorId: admin.id,
      action: "sale-unvoid",
      entity: "sale",
      entityId: id,
    });

    revalidatePath("/admin/log");
    revalidatePath("/admin");
    revalidatePath("/admin/analytics");
    return ok("Order restored to the totals.");
  } catch (err) {
    return toActionError(err);
  }
}
