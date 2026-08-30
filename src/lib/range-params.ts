/**
 * Reporting period lives in the URL (?grain=month&on=2026-08-15).
 *
 * Keeping it there rather than in component state means the back button works,
 * a link to "last week's numbers" can be shared, and the server component can
 * fetch exactly what the page will render - no loading flash.
 */
import { rangeFor, today, type DateRange, type Grain } from "./dates";

const GRAINS: Grain[] = ["day", "week", "month", "year"];

export type RangeSearchParams = { grain?: string; on?: string };

export function parseRange(params: RangeSearchParams | undefined): DateRange {
  const grain = GRAINS.includes(params?.grain as Grain) ? (params!.grain as Grain) : "day";
  const on =
    params?.on && /^\d{4}-\d{2}-\d{2}$/.test(params.on) ? params.on : today();
  return rangeFor(grain, on);
}

/** Build the querystring for a given period. */
export function rangeHref(base: string, grain: Grain, on: string) {
  return `${base}?grain=${grain}&on=${on}`;
}

export const GRAIN_OPTIONS: { value: Grain; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
];

export { GRAINS };
