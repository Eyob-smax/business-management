/**
 * Trading-day and range helpers.
 *
 * A restaurant day is not a calendar day: a sale rung up at 01:30 belongs to
 * the previous night's trade. `businessDateOf` applies the business timezone
 * and a cutoff hour so every report agrees on which day a sale belongs to.
 *
 * Dates are passed around as plain "YYYY-MM-DD" strings, which is what the
 * Postgres `date` columns hold. No timezone ambiguity, no Date-object drift.
 */

export const BUSINESS_TZ = process.env.NEXT_PUBLIC_BUSINESS_TZ || "Africa/Addis_Ababa";

/** Sales before this local hour roll back to the previous trading day. */
export const DEFAULT_DAY_CUTOFF_HOUR = 4;

export type DayKey = string; // "YYYY-MM-DD"
export type Grain = "day" | "week" | "month" | "year";

/** Wall-clock parts of an instant, in a given timezone. */
function partsIn(d: Date, tz: string) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const out: Record<string, string> = {};
  for (const p of fmt.formatToParts(d)) if (p.type !== "literal") out[p.type] = p.value;
  return {
    year: Number(out.year),
    month: Number(out.month),
    day: Number(out.day),
    hour: Number(out.hour === "24" ? "0" : out.hour),
    minute: Number(out.minute),
  };
}

export function toDayKey(y: number, m: number, d: number): DayKey {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** The trading day an instant belongs to. */
export function businessDateOf(
  instant: Date | string | number = new Date(),
  tz = BUSINESS_TZ,
  cutoffHour = DEFAULT_DAY_CUTOFF_HOUR,
): DayKey {
  const d = new Date(instant);
  const p = partsIn(d, tz);
  let key = toDayKey(p.year, p.month, p.day);
  if (p.hour < cutoffHour) key = addDays(key, -1);
  return key;
}

/** Today's trading day. */
export const today = (tz = BUSINESS_TZ, cutoff = DEFAULT_DAY_CUTOFF_HOUR) =>
  businessDateOf(new Date(), tz, cutoff);

/** Local hour-of-day of an instant, for the hourly-pattern chart. */
export const hourOf = (instant: Date | string, tz = BUSINESS_TZ) =>
  partsIn(new Date(instant), tz).hour;

/* ------------------------------------------------------- day-key arithmetic */

export function addDays(key: DayKey, delta: number): DayKey {
  const [y, m, d] = key.split("-").map(Number);
  // Noon UTC keeps us clear of DST edges while doing pure calendar maths.
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return toDayKey(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

export function daysBetween(a: DayKey, b: DayKey): number {
  const ms = Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`);
  return Math.round(ms / 86_400_000);
}

/** Monday-based week start. */
export function startOfWeek(key: DayKey): DayKey {
  const [y, m, d] = key.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay(); // 0=Sun
  return addDays(key, dow === 0 ? -6 : 1 - dow);
}

export const startOfMonth = (key: DayKey): DayKey => `${key.slice(0, 7)}-01`;
export const startOfYear = (key: DayKey): DayKey => `${key.slice(0, 4)}-01-01`;

export function endOfMonth(key: DayKey): DayKey {
  const [y, m] = key.split("-").map(Number);
  return toDayKey(y, m, daysInMonth(y, m));
}

export const endOfWeek = (key: DayKey) => addDays(startOfWeek(key), 6);
export const endOfYear = (key: DayKey): DayKey => `${key.slice(0, 4)}-12-31`;

export const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/* ------------------------------------------------------------------ ranges */

export type DateRange = { from: DayKey; to: DayKey; grain: Grain; label: string };

/** The canonical range for a grain, anchored on a day. */
export function rangeFor(grain: Grain, anchor: DayKey = today()): DateRange {
  switch (grain) {
    case "day":
      return { from: anchor, to: anchor, grain, label: formatDayLabel(anchor) };
    case "week": {
      const from = startOfWeek(anchor);
      const to = addDays(from, 6);
      return { from, to, grain, label: `${formatDayLabel(from, true)} - ${formatDayLabel(to, true)}` };
    }
    case "month":
      return {
        from: startOfMonth(anchor),
        to: endOfMonth(anchor),
        grain,
        label: monthLabel(anchor),
      };
    case "year":
      return { from: startOfYear(anchor), to: endOfYear(anchor), grain, label: anchor.slice(0, 4) };
  }
}

/** The equivalent window one period earlier, for "vs last period" deltas. */
export function previousRange(r: DateRange): DateRange {
  switch (r.grain) {
    case "day":
      return rangeFor("day", addDays(r.from, -1));
    case "week":
      return rangeFor("week", addDays(r.from, -7));
    case "month":
      return rangeFor("month", addDays(r.from, -1));
    case "year":
      return rangeFor("year", `${Number(r.from.slice(0, 4)) - 1}-06-15`);
  }
}

/** Step one whole period forward/backward (for the date pager). */
export function shiftRange(r: DateRange, dir: -1 | 1): DateRange {
  switch (r.grain) {
    case "day":
      return rangeFor("day", addDays(r.from, dir));
    case "week":
      return rangeFor("week", addDays(r.from, 7 * dir));
    case "month":
      return rangeFor("month", dir < 0 ? addDays(r.from, -1) : addDays(endOfMonth(r.from), 1));
    case "year":
      return rangeFor("year", `${Number(r.from.slice(0, 4)) + dir}-06-15`);
  }
}

export function eachDay(from: DayKey, to: DayKey): DayKey[] {
  const out: DayKey[] = [];
  for (let k = from; k <= to; k = addDays(k, 1)) out.push(k);
  return out;
}

/* ------------------------------------------------------------------ labels */

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function formatDayLabel(key: DayKey, short = false): string {
  const [y, m, d] = key.split("-").map(Number);
  const dow = DOW[new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay()];
  const mon = MONTHS[m - 1];
  if (short) return `${mon.slice(0, 3)} ${d}`;
  const t = today();
  if (key === t) return "Today";
  if (key === addDays(t, -1)) return "Yesterday";
  return `${dow.slice(0, 3)}, ${mon.slice(0, 3)} ${d}${y === Number(t.slice(0, 4)) ? "" : ` ${y}`}`;
}

export const monthLabel = (key: DayKey) =>
  `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;

export const weekdayShort = (key: DayKey) => {
  const [y, m, d] = key.split("-").map(Number);
  return DOW[new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay()].slice(0, 3);
};

/** "2 min ago" / "3 h ago" - for sync status and note timestamps. */
export function relativeTime(input: Date | string | number): string {
  const ms = Date.now() - new Date(input).getTime();
  const s = Math.round(ms / 1000);
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  const min = Math.round(s / 60);
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d} d ago`;
  return new Date(input).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function formatClock(input: Date | string, tz = BUSINESS_TZ): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(input));
}
