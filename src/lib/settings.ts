/**
 * Business settings: a small typed key/value store in Postgres with sane
 * defaults, so the app works before an admin has configured anything.
 */
import "server-only";
import { cache } from "react";
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { BUSINESS_TZ, DEFAULT_DAY_CUTOFF_HOUR } from "./dates";

export type CostingMode =
  /** Use per-item estimated costs; overhead expenses are separate. */
  | "item"
  /** Ignore per-item costs entirely; only logged expenses count as cost. */
  | "period"
  /**
   * Default. Per-item costs apply, EXCEPT on days covered by an expense
   * flagged `replacesItemCosts` - there the logged amount wins.
   */
  | "auto";

export type BusinessSettings = {
  restaurantName: string;
  shopName: string;
  currency: string;
  timezone: string;
  /** Sales before this local hour count toward the previous trading day. */
  dayCutoffHour: number;
  costingMode: CostingMode;
  /** Below this margin a dish is flagged as under-performing. */
  lowMarginPct: number;
};

export type NotifySettings = {
  /** Push admins on every synced sale. */
  onSale: boolean;
  /** Only push if the sale total is at least this much (0 = every sale). */
  saleMinCents: number;
  /** Push admins when staff leave a note or message. */
  onNote: boolean;
  /** Push when a batch arrives that had been queued offline for a while. */
  onOfflineBatch: boolean;
  /** Push admins when a sale is voided. */
  onVoid: boolean;
};

const DEFAULTS = {
  business: {
    restaurantName: "Our Restaurant",
    shopName: "Our Mobile Shop",
    currency: process.env.NEXT_PUBLIC_CURRENCY || "ETB",
    timezone: BUSINESS_TZ,
    dayCutoffHour: DEFAULT_DAY_CUTOFF_HOUR,
    costingMode: "auto",
    lowMarginPct: 15,
  } satisfies BusinessSettings,
  notify: {
    onSale: true,
    saleMinCents: 0,
    onNote: true,
    onOfflineBatch: true,
    onVoid: true,
  } satisfies NotifySettings,
};

export type SettingsBundle = {
  business: BusinessSettings;
  notify: NotifySettings;
};

/**
 * Reads both setting groups in one round trip, merged over the defaults.
 *
 * Wrapped in React's `cache` so the half-dozen report helpers that each need
 * the costing mode share ONE query per request instead of issuing their own.
 */
export const getSettings = cache(async function getSettings(): Promise<SettingsBundle> {
  let rows: { key: string; value: unknown }[] = [];
  try {
    rows = await db
      .select({ key: settings.key, value: settings.value })
      .from(settings)
      .where(inArray(settings.key, ["business", "notify"]));
  } catch {
    // Table not migrated yet - fall back to defaults rather than 500.
    return { business: { ...DEFAULTS.business }, notify: { ...DEFAULTS.notify } };
  }

  const map = new Map(rows.map((r) => [r.key, r.value as Record<string, unknown>]));
  return {
    business: { ...DEFAULTS.business, ...(map.get("business") ?? {}) },
    notify: { ...DEFAULTS.notify, ...(map.get("notify") ?? {}) },
  };
});

export async function getBusinessSettings(): Promise<BusinessSettings> {
  return (await getSettings()).business;
}

/** Upsert one group, merging with what is already stored. */
export async function saveSettingsGroup<K extends keyof SettingsBundle>(
  key: K,
  patch: Partial<SettingsBundle[K]>,
) {
  const current = await getSettings();
  const merged = { ...current[key], ...patch };
  await db
    .insert(settings)
    .values({ key, value: merged })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: merged, updatedAt: new Date() },
    });
  return merged;
}

export { DEFAULTS as SETTINGS_DEFAULTS };
