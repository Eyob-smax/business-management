"use server";
/**
 * Business + notification settings (admin only).
 *
 * costingMode is the important one - it decides how the profit engine
 * reconciles per-plate estimates with recorded expenses. See lib/analytics.ts.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { activityLog } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { saveSettingsGroup } from "@/lib/settings";
import { parseMoneyToCents } from "@/lib/money";
import { fail, ok, toActionError, type ActionResult } from "./_result";

const businessSchema = z.object({
  restaurantName: z.string().trim().min(1, "Give the restaurant a name.").max(60),
  shopName: z.string().trim().min(1).max(60),
  currency: z.string().trim().min(2).max(6),
  timezone: z.string().trim().min(3).max(60),
  dayCutoffHour: z.coerce.number().int().min(0).max(12),
  costingMode: z.enum(["auto", "item", "period"]),
  lowMarginPct: z.coerce.number().min(0).max(90),
});

export async function saveBusinessSettings(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();

    const parsed = businessSchema.safeParse({
      restaurantName: formData.get("restaurantName") ?? "",
      shopName: formData.get("shopName") ?? "",
      currency: formData.get("currency") ?? "ETB",
      timezone: formData.get("timezone") ?? "Africa/Addis_Ababa",
      dayCutoffHour: formData.get("dayCutoffHour") ?? 4,
      costingMode: formData.get("costingMode") ?? "auto",
      lowMarginPct: formData.get("lowMarginPct") ?? 15,
    });

    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Please check the form.");
    }

    // Reject a timezone the runtime does not know, or every report shifts.
    try {
      new Intl.DateTimeFormat("en", { timeZone: parsed.data.timezone });
    } catch {
      return fail("That timezone is not recognised. Example: Africa/Addis_Ababa");
    }

    await saveSettingsGroup("business", parsed.data);

    await db.insert(activityLog).values({
      actorId: admin.id,
      action: "settings-business",
      detail: parsed.data,
    });

    revalidatePath("/", "layout");
    return ok("Settings saved.");
  } catch (err) {
    return toActionError(err);
  }
}

const notifySchema = z.object({
  onSale: z.boolean(),
  saleMin: z.string().optional(),
  onNote: z.boolean(),
  onOfflineBatch: z.boolean(),
  onVoid: z.boolean(),
});

const bool = (v: FormDataEntryValue | null) => v === "on" || v === "true" || v === "1";

export async function saveNotifySettings(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();

    const parsed = notifySchema.safeParse({
      onSale: bool(formData.get("onSale")),
      saleMin: (formData.get("saleMin") as string) || "0",
      onNote: bool(formData.get("onNote")),
      onOfflineBatch: bool(formData.get("onOfflineBatch")),
      onVoid: bool(formData.get("onVoid")),
    });

    if (!parsed.success) return fail("Please check the form.");

    await saveSettingsGroup("notify", {
      onSale: parsed.data.onSale,
      saleMinCents: Math.max(0, parseMoneyToCents(parsed.data.saleMin ?? "0") ?? 0),
      onNote: parsed.data.onNote,
      onOfflineBatch: parsed.data.onOfflineBatch,
      onVoid: parsed.data.onVoid,
    });

    await db.insert(activityLog).values({
      actorId: admin.id,
      action: "settings-notify",
    });

    revalidatePath("/admin/settings");
    return ok("Notification settings saved.");
  } catch (err) {
    return toActionError(err);
  }
}
