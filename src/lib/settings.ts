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
  digest: {
    enabled: true,
    hourLocal: 21,
    // Push costs nothing and needs no provider, so it is the only one on by
    // default; the rest switch themselves on once their env vars exist.
    channels: { push: true, telegram: true, email: false },
    emails: [],
    topDishes: 3,
    skipEmptyDays: true,
  } satisfies DigestSettings,
};

/**
 * The nightly summary.
 *
 * Provider credentials live in environment variables; only WHO receives it and
 * WHAT it contains live here, because those are the things an admin changes
 * from their phone.
 */
export type DigestSettings = {
  enabled: boolean;
  /** Local hour (business timezone) the summary is meant to go out. */
  hourLocal: number;
  channels: {
    push: boolean;
    telegram: boolean;
    email: boolean;
  };
  /**
   * Telegram recipients are NOT here - they live in TELEGRAM_OWNER_CHAT_ID and
   * TELEGRAM_DIGEST_CHAT_IDS, because chat identity is deployment
   * configuration rather than something to edit from a settings screen.
   */
  emails: string[];
  /** How many dishes to name in the summary. */
  topDishes: number;
  /** Skip sending on days with no sales at all. */
  skipEmptyDays: boolean;
};

export type SettingsBundle = {
  business: BusinessSettings;
  notify: NotifySettings;
  digest: DigestSettings;
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
      .where(inArray(settings.key, ["business", "notify", "digest"]));
  } catch {
    // Table not migrated yet - fall back to defaults rather than 500.
    return {
      business: { ...DEFAULTS.business },
      notify: { ...DEFAULTS.notify },
      digest: { ...DEFAULTS.digest },
    };
  }

  const map = new Map(rows.map((r) => [r.key, r.value as Record<string, unknown>]));
  const storedDigest = (map.get("digest") ?? {}) as Partial<DigestSettings>;

  return {
    business: { ...DEFAULTS.business, ...(map.get("business") ?? {}) },
    notify: { ...DEFAULTS.notify, ...(map.get("notify") ?? {}) },
    digest: {
      ...DEFAULTS.digest,
      ...storedDigest,
      // Nested object, so a shallow merge would drop channels added later.
      channels: { ...DEFAULTS.digest.channels, ...(storedDigest.channels ?? {}) },
    },
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
