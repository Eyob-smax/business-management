/**
 * Money helpers. All amounts move through the app as integer minor units
 * ("cents"). Only format at the very last moment, only parse at the input.
 */

export const CURRENCY = process.env.NEXT_PUBLIC_CURRENCY || "ETB";

const SYMBOLS: Record<string, string> = {
  ETB: "Br",
  USD: "$",
  EUR: "€",
  KES: "KSh",
  NGN: "₦",
  GBP: "£",
};

export const currencySymbol = (code = CURRENCY) => SYMBOLS[code] ?? code;

/** 12050 -> "Br 120.50" */
export function formatMoney(
  cents: number | null | undefined,
  opts: { compact?: boolean; symbol?: boolean; sign?: boolean } = {},
): string {
  const { compact = false, symbol = true, sign = false } = opts;
  const value = (cents ?? 0) / 100;
  const abs = Math.abs(value);

  let body: string;
  if (compact && abs >= 1_000_000) {
    body = trimZeros(abs / 1_000_000) + "M";
  } else if (compact && abs >= 10_000) {
    body = trimZeros(abs / 1_000) + "k";
  } else {
    body = abs.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  const prefix = value < 0 ? "-" : sign && value > 0 ? "+" : "";
  return symbol ? `${prefix}${currencySymbol()} ${body}` : `${prefix}${body}`;
}

function trimZeros(n: number) {
  return n.toFixed(1).replace(/\.0$/, "");
}

/** "120.50" | "120,50" | " 120 " -> 12050. Returns null for unusable input. */
export function parseMoneyToCents(input: string | number): number | null {
  if (typeof input === "number") {
    return Number.isFinite(input) ? Math.round(input * 100) : null;
  }
  const cleaned = input.replace(/[^\d.,-]/g, "").replace(/,/g, ".");
  if (!cleaned || cleaned === "-" || cleaned === ".") return null;
  const parts = cleaned.split(".");
  const normalised = parts.length > 2 ? parts[0] + "." + parts.slice(1).join("") : cleaned;
  const n = Number(normalised);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

/** Percentage of revenue kept as profit. Guarded against divide-by-zero. */
export function marginPct(revenueCents: number, profitCents: number): number {
  if (!revenueCents) return 0;
  return (profitCents / revenueCents) * 100;
}

export const formatPct = (n: number, digits = 1) =>
  `${n > 0 ? "" : ""}${n.toFixed(digits)}%`;

/** Split `total` across `n` days without losing a cent to rounding. */
export function spreadCents(total: number, n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor(total / n);
  const remainder = total - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < remainder ? 1 : 0));
}
