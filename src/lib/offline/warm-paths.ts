import { rangeFor, type DayKey, type Grain } from "@/lib/dates";

/**
 * Everything a signed-in person can reach, so the whole app can be saved for
 * offline use without them having to walk through it first.
 *
 * Nobody thinks "I should open the week view now, in case I lose signal
 * later". The service worker downloads this list quietly in the background
 * instead.
 *
 * The filtered views need their query strings spelled out: a cached page is
 * keyed by its full URL, so "/admin/analytics" saved on its own does nothing
 * for "/admin/analytics?grain=week&on=2026-08-24". The anchor day comes from
 * the server, so the URLs here are exactly the ones the range picker builds.
 */

const GRAINS: Grain[] = ["day", "week", "month", "year"];

/** The four period variants of one page, as the picker would link to them. */
function periods(path: string, anchor: DayKey): string[] {
  return GRAINS.map((grain) => `${path}?grain=${grain}&on=${rangeFor(grain, anchor).from}`);
}

export function adminWarmPaths(anchor: DayKey): string[] {
  return [
    // Bare paths first: they are the fallback the worker serves when a filter
    // combination was never saved, so they matter most.
    "/admin",
    "/admin/analytics",
    "/admin/log",
    "/admin/expenses",
    "/admin/menu",
    "/admin/team",
    "/admin/settings",
    "/notes",
    "/profile",
    "/change-code",
    "/shop",

    ...periods("/admin", anchor),
    ...periods("/admin/analytics", anchor),
    ...periods("/admin/log", anchor),
    ...periods("/admin/expenses", anchor),
    ...GRAINS.map(
      (g) => `/admin/log?grain=${g}&on=${rangeFor(g, anchor).from}&tab=notes`,
    ),
  ];
}

export function staffWarmPaths(): string[] {
  return ["/staff", "/staff/shift", "/notes", "/profile", "/change-code", "/shop"];
}
