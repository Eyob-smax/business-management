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
import { sendDailyDigest } from "@/lib/digest/send";
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

/* ------------------------------------------------------------ daily digest */

const listField = (raw: FormDataEntryValue | null, max = 20) =>
  String(raw ?? "")
    .split(/[\n,;]+/)
    .map((v) => v.trim())
    .filter(Boolean)
    .slice(0, max);

const digestSchema = z.object({
  enabled: z.boolean(),
  hourLocal: z.coerce.number().int().min(0).max(23),
  topDishes: z.coerce.number().int().min(1).max(10),
  skipEmptyDays: z.boolean(),
  channels: z.object({
    push: z.boolean(),
    telegram: z.boolean(),
    email: z.boolean(),
    sms: z.boolean(),
  }),
  telegramChatIds: z.array(z.string().regex(/^-?\d+$/, "Chat IDs are numbers.")),
  emails: z.array(z.string().email("That is not a valid email address.")),
  phones: z.array(
    z.string().regex(/^\+\d{7,15}$/, "Phone numbers need the country code, e.g. +251911234567."),
  ),
});

export async function saveDigestSettings(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();

    const parsed = digestSchema.safeParse({
      enabled: bool(formData.get("enabled")),
      hourLocal: formData.get("hourLocal") ?? 21,
      topDishes: formData.get("topDishes") ?? 3,
      skipEmptyDays: bool(formData.get("skipEmptyDays")),
      channels: {
        push: bool(formData.get("chPush")),
        telegram: bool(formData.get("chTelegram")),
        email: bool(formData.get("chEmail")),
        sms: bool(formData.get("chSms")),
      },
      telegramChatIds: listField(formData.get("telegramChatIds")),
      emails: listField(formData.get("emails")),
      phones: listField(formData.get("phones")),
    });

    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Please check the form.");
    }

    // A channel switched on with nobody to send to would fail silently at 9pm.
    const v = parsed.data;
    if (v.channels.telegram && v.telegramChatIds.length === 0) {
      return fail("Add at least one Telegram chat ID, or switch Telegram off.");
    }
    if (v.channels.email && v.emails.length === 0) {
      return fail("Add at least one email address, or switch email off.");
    }
    if (v.channels.sms && v.phones.length === 0) {
      return fail("Add at least one phone number, or switch SMS off.");
    }

    await saveSettingsGroup("digest", v);

    await db.insert(activityLog).values({
      actorId: admin.id,
      action: "settings-digest",
      detail: { enabled: v.enabled, hourLocal: v.hourLocal, channels: v.channels },
    });

    revalidatePath("/admin/settings");
    return ok("Daily summary settings saved.");
  } catch (err) {
    return toActionError(err);
  }
}

/** "Send it to me now" - bypasses the once-a-day guard and the empty-day rule. */
export async function sendDigestNow(): Promise<ActionResult> {
  try {
    await requireAdmin();
    const outcome = await sendDailyDigest({ force: true });

    if (outcome.skipped) return fail(outcome.reason ?? "Nothing was sent.");
    if (outcome.results.length === 0) {
      return fail("No delivery channels are switched on.");
    }

    const sent = outcome.results.reduce((t, r) => t + r.sent, 0);
    const problems = outcome.results
      .filter((r) => r.error)
      .map((r) => `${r.channel}: ${r.error}`)
      .join(" | ");

    if (sent === 0) {
      return fail(problems || "No channel accepted the message.");
    }

    revalidatePath("/admin/settings");
    return ok(
      problems
        ? `Sent to ${sent} recipient(s). Some channels had trouble - ${problems}`
        : `Sent to ${sent} recipient(s).`,
    );
  } catch (err) {
    return toActionError(err);
  }
}
