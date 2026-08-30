import "server-only";
import { sql } from "@/db";
import {
  getHourlyPattern,
  getItemPerformance,
  getStaffPerformance,
  getSummary,
} from "@/lib/analytics";
import { formatDayLabel, rangeFor, type DayKey } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { deltaPct } from "@/lib/utils";
import { getSettings } from "@/lib/settings";

/**
 * The nightly summary.
 *
 * The numbers are gathered once and then rendered four ways, because the
 * channels have genuinely different limits:
 *
 *   push      one line, a phone notification body
 *   sms       every character is money, and Amharic would halve the segment
 *             size, so this one is deliberately terse and ASCII
 *   telegram  HTML, room to breathe, this is the good one
 *   email     the same content with a little structure
 *
 * Rendering from one payload is what keeps them from drifting apart and
 * quietly disagreeing about the day's profit.
 */

export type DigestPayload = {
  businessDate: DayKey;
  dayLabel: string;
  businessName: string;
  hasSales: boolean;

  revenueCents: number;
  totalCostCents: number;
  profitCents: number;
  marginPct: number;
  orders: number;
  items: number;
  avgOrderCents: number;

  /** Percentage change vs the previous trading day; null when there is no base. */
  revenueDeltaPct: number | null;
  profitDeltaPct: number | null;

  topDishes: { name: string; emoji: string; qty: number; revenueCents: number }[];
  busiestHour: { label: string; revenueCents: number } | null;
  staff: { name: string; orders: number; revenueCents: number }[];
  /** Unresolved problems staff flagged, so they are not missed overnight. */
  openIssues: { body: string; authorName: string }[];

  text: { push: { title: string; body: string }; sms: string; telegramHtml: string; emailHtml: string; emailSubject: string };
};

/** Telegram + email are HTML; user-supplied text must not break the markup. */
function esc(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const signed = (cents: number) => formatMoney(cents, { sign: true });

function deltaText(pct: number | null): string {
  if (pct === null || !Number.isFinite(pct)) return "";
  if (Math.abs(pct) < 0.5) return " (same as yesterday)";
  return ` (${pct > 0 ? "+" : ""}${pct.toFixed(0)}% vs yesterday)`;
}

export async function buildDigest(
  businessDate: DayKey,
  module: "restaurant" | "shop" = "restaurant",
): Promise<DigestPayload> {
  const range = rangeFor("day", businessDate);
  const { business, digest } = await getSettings();

  const [summary, previous, dishes, staffRows, hourly, issues] = await Promise.all([
    getSummary(range, module),
    getSummary(rangeFor("day", shiftDay(businessDate, -1)), module),
    getItemPerformance(range, module, 20),
    getStaffPerformance(range, module),
    getHourlyPattern(range, module),
    openIssuesFor(businessDate, module),
  ]);

  const topDishes = dishes.slice(0, Math.max(1, digest.topDishes)).map((d) => ({
    name: d.name,
    emoji: d.emoji,
    qty: d.qty,
    revenueCents: d.revenueCents,
  }));

  const busiest = hourly.reduce(
    (best, h) => (h.revenueCents > (best?.revenueCents ?? 0) ? h : best),
    null as (typeof hourly)[number] | null,
  );

  const payload: Omit<DigestPayload, "text"> = {
    businessDate,
    dayLabel: formatDayLabel(businessDate),
    businessName: business.restaurantName,
    hasSales: summary.orders > 0,

    revenueCents: summary.revenueCents,
    totalCostCents: summary.totalCostCents,
    profitCents: summary.profitCents,
    marginPct: summary.marginPct,
    orders: summary.orders,
    items: summary.items,
    avgOrderCents: summary.avgOrderCents,

    revenueDeltaPct: deltaPct(previous.revenueCents, summary.revenueCents),
    profitDeltaPct: deltaPct(previous.profitCents, summary.profitCents),

    topDishes,
    busiestHour: busiest && busiest.revenueCents > 0
      ? { label: busiest.label, revenueCents: busiest.revenueCents }
      : null,
    staff: staffRows.map((s) => ({
      name: s.name,
      orders: s.orders,
      revenueCents: s.revenueCents,
    })),
    openIssues: issues,
  };

  return { ...payload, text: render(payload) };
}

function render(d: Omit<DigestPayload, "text">): DigestPayload["text"] {
  const profitWord = d.profitCents >= 0 ? "Profit" : "Loss";
  const profitAbs = formatMoney(Math.abs(d.profitCents));

  /* ---- push: one line ---- */
  const push = d.hasSales
    ? {
        title: `${d.dayLabel}: ${formatMoney(d.revenueCents, { compact: true })} in, ${formatMoney(d.profitCents, { compact: true })} kept`,
        body:
          `${d.orders} orders. ${profitWord} ${profitAbs} (${d.marginPct.toFixed(0)}%).` +
          (d.topDishes[0] ? ` Best: ${d.topDishes[0].name}.` : ""),
      }
    : {
        // Saying "Br 0.00 in, -Br 4,287 kept" next to "no sales" reads as a
        // contradiction; on an empty day the running costs are the whole story.
        title: `${d.dayLabel}: no sales recorded`,
        body:
          d.totalCostCents > 0
            ? `Nothing was sold. Running costs still came to ${formatMoney(d.totalCostCents)}.`
            : "Nothing was sold today.",
      };

  /* ---- sms: terse, ASCII, ideally two segments ---- */
  const smsLines = [
    `${d.businessName} ${d.businessDate}`,
    `Sales ${formatMoney(d.revenueCents, { symbol: false })} (${d.orders} orders)`,
    `Cost ${formatMoney(d.totalCostCents, { symbol: false })}`,
    `${profitWord} ${formatMoney(Math.abs(d.profitCents), { symbol: false })} ${d.marginPct.toFixed(0)}%`,
  ];
  if (d.topDishes.length) {
    smsLines.push(`Best: ${d.topDishes.map((t) => `${t.name} x${t.qty}`).join(", ")}`);
  }
  if (d.openIssues.length) {
    smsLines.push(`${d.openIssues.length} open problem(s)`);
  }
  const sms = d.hasSales
    ? smsLines.join("\n")
    : `${d.businessName} ${d.businessDate}: no sales recorded today.`;

  /* ---- telegram: HTML ---- */
  const tg: string[] = [
    `<b>${esc(d.businessName)}</b>`,
    `<i>${esc(d.dayLabel)} - ${d.businessDate}</i>`,
    "",
  ];

  if (!d.hasSales) {
    tg.push("No sales were recorded today.");
  } else {
    tg.push(
      `\u{1F4B5} <b>Money in</b>  ${esc(formatMoney(d.revenueCents))}${esc(deltaText(d.revenueDeltaPct))}`,
      `\u{1F4B8} <b>Cost</b>  ${esc(formatMoney(d.totalCostCents))}`,
      `${d.profitCents >= 0 ? "\u{2705}" : "\u{26A0}\u{FE0F}"} <b>${profitWord}</b>  ${esc(profitAbs)}  (${d.marginPct.toFixed(0)}%)${esc(deltaText(d.profitDeltaPct))}`,
      "",
      `\u{1F9FE} ${d.orders} orders, ${d.items} items, average ${esc(formatMoney(d.avgOrderCents))}`,
    );

    if (d.busiestHour) {
      tg.push(
        `\u{23F0} Busiest around ${esc(d.busiestHour.label)} (${esc(formatMoney(d.busiestHour.revenueCents, { compact: true }))})`,
      );
    }

    if (d.topDishes.length) {
      tg.push("", "<b>Best sellers</b>");
      for (const [i, t] of d.topDishes.entries()) {
        tg.push(
          `${i + 1}. ${esc(t.emoji)} ${esc(t.name)} - ${t.qty} sold, ${esc(formatMoney(t.revenueCents))}`,
        );
      }
    }

    if (d.staff.length > 1) {
      tg.push("", "<b>Who was working</b>");
      for (const s of d.staff) {
        tg.push(`- ${esc(s.name)}: ${s.orders} orders, ${esc(formatMoney(s.revenueCents))}`);
      }
    }
  }

  if (d.openIssues.length) {
    tg.push("", `<b>\u{26A0}\u{FE0F} ${d.openIssues.length} problem(s) still open</b>`);
    for (const issue of d.openIssues.slice(0, 3)) {
      tg.push(`- ${esc(issue.authorName)}: ${esc(issue.body.slice(0, 120))}`);
    }
  }

  /* ---- email ---- */
  const row = (label: string, value: string, strong = false) =>
    `<tr><td style="padding:6px 0;color:#57534e;font-size:14px">${esc(label)}</td>` +
    `<td style="padding:6px 0;text-align:right;font-size:${strong ? "16px;font-weight:700" : "14px"};color:#1c1917">${esc(value)}</td></tr>`;

  const emailHtml = `
<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#faf7f2;color:#1c1917">
  <h1 style="margin:0 0 4px;font-size:20px">${esc(d.businessName)}</h1>
  <p style="margin:0 0 20px;color:#8c857c;font-size:13px">${esc(d.dayLabel)} &middot; ${d.businessDate}</p>
  ${
    d.hasSales
      ? `<table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #e7e0d5;border-radius:14px;padding:16px">
          ${row("Money in", formatMoney(d.revenueCents))}
          ${row("Cost", formatMoney(d.totalCostCents))}
          ${row(profitWord, `${profitAbs}  (${d.marginPct.toFixed(0)}%)`, true)}
          ${row("Orders", `${d.orders}`)}
          ${row("Items", `${d.items}`)}
          ${row("Average order", formatMoney(d.avgOrderCents))}
        </table>
        ${
          d.topDishes.length
            ? `<h2 style="font-size:14px;margin:20px 0 8px">Best sellers</h2><ol style="margin:0;padding-left:20px;font-size:14px;line-height:1.7">${d.topDishes
                .map(
                  (t) =>
                    `<li>${esc(t.emoji)} ${esc(t.name)} &mdash; ${t.qty} sold, ${esc(formatMoney(t.revenueCents))}</li>`,
                )
                .join("")}</ol>`
            : ""
        }`
      : `<p style="font-size:14px">No sales were recorded today.</p>`
  }
  ${
    d.openIssues.length
      ? `<h2 style="font-size:14px;margin:20px 0 8px;color:#be123c">${d.openIssues.length} problem(s) still open</h2><ul style="margin:0;padding-left:20px;font-size:14px;line-height:1.7">${d.openIssues
          .slice(0, 3)
          .map((i) => `<li>${esc(i.authorName)}: ${esc(i.body.slice(0, 160))}</li>`)
          .join("")}</ul>`
      : ""
  }
  <p style="margin-top:24px;font-size:12px;color:#8c857c">Sent automatically by Business Manager.</p>
</div>`.trim();

  return {
    push,
    sms,
    telegramHtml: tg.join("\n"),
    emailHtml,
    emailSubject: d.hasSales
      ? `${d.businessName}: ${formatMoney(d.revenueCents)} in, ${signed(d.profitCents)} kept (${d.businessDate})`
      : `${d.businessName}: no sales recorded ${d.businessDate}`,
  };
}

/* ------------------------------------------------------------------ helpers */

function shiftDay(key: DayKey, delta: number): DayKey {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

async function openIssuesFor(businessDate: DayKey, module: "restaurant" | "shop") {
  const rows = (await sql`
    SELECT n.body, COALESCE(u.name, 'Someone') AS author_name
    FROM notes n
    LEFT JOIN users u ON u.id = n.author_id
    WHERE n.module = ${module}
      AND n.deleted_at IS NULL
      AND n.kind = 'issue'
      AND n.resolved_at IS NULL
      AND n.note_date <= ${businessDate}::date
    ORDER BY n.created_at DESC
    LIMIT 5
  `) as Record<string, unknown>[];

  return rows.map((r) => ({ body: String(r.body), authorName: String(r.author_name) }));
}
