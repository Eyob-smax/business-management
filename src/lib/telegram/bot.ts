import "server-only";
import {
  getCategoryBreakdown,
  getExpenseBreakdown,
  getHourlyPattern,
  getItemPerformance,
  getRecentSales,
  getStaffPerformance,
  getSummary,
  getWeekdayPattern,
} from "@/lib/analytics";
import { getMenuForAdmin } from "@/lib/menu";
import { listRecentNotes } from "@/lib/notes";
import { listExpenses } from "@/lib/expenses";
import { getSettings } from "@/lib/settings";
import { buildDigest } from "@/lib/digest/build";
import {
  addDays,
  businessDateOf,
  formatDayLabel,
  previousRange,
  rangeFor,
  type DayKey,
  type Grain,
} from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { deltaPct } from "@/lib/utils";
import {
  answerCallback,
  editMessage,
  escapeHtml,
  sendMessage,
  type InlineButton,
} from "./api";
import { isAllowed } from "./access";

/**
 * The read-only Telegram bot.
 *
 * ── READ ONLY, DELIBERATELY ────────────────────────────────────────────────
 * Every function in this file only ever queries. Nothing here inserts,
 * updates or deletes anything, and it must stay that way: a chat message is
 * far too easy to spoof or fat-finger to be allowed to change what the
 * business believes it sold. Recording a sale, editing a price, filing an
 * expense and changing access all stay in the app, behind a real sign-in.
 *
 * The smoke test enforces this by scanning this directory for write calls, so
 * an accidental `db.insert` here fails the suite rather than shipping.
 */

/* ------------------------------------------------------------------ helpers */

const money = (cents: number) => escapeHtml(formatMoney(cents));
const compact = (cents: number) => escapeHtml(formatMoney(cents, { compact: true }));

function deltaLine(pct: number | null): string {
  if (pct === null || !Number.isFinite(pct)) return "";
  if (Math.abs(pct) < 0.5) return " <i>(flat)</i>";
  return ` <i>(${pct > 0 ? "+" : ""}${pct.toFixed(0)}%)</i>`;
}

async function today(): Promise<DayKey> {
  const { business } = await getSettings();
  return businessDateOf(new Date(), business.timezone, business.dayCutoffHour);
}

const HOME_KEYBOARD: InlineButton[][] = [
  [
    { text: "Today", callback_data: "r:day" },
    { text: "Week", callback_data: "r:week" },
  ],
  [
    { text: "Month", callback_data: "r:month" },
    { text: "Year", callback_data: "r:year" },
  ],
  [
    { text: "Best dishes", callback_data: "dishes" },
    { text: "People", callback_data: "staff" },
  ],
  [
    { text: "Costs", callback_data: "expenses" },
    { text: "Notes", callback_data: "notes" },
  ],
  [
    { text: "Menu & stock", callback_data: "menu" },
    { text: "Orders", callback_data: "orders" },
  ],
];

/**
 * The buttons that sit under the composer and stay there between messages.
 *
 * Commands are fine once you know them; nobody should have to. Each label
 * carries both languages because the reports themselves are still English -
 * the word in your own language is what makes the row scannable.
 *
 * Reply-keyboard buttons arrive as ordinary text, so every label is also a
 * spelling the bot understands (see BUTTON_ACTIONS).
 */
const MENU_BUTTONS: { label: string; action: string }[] = [
  { label: "\u{1F4CA} ዛሬ · Today", action: "r:day" },
  { label: "\u{1F4C5} ሳምንት · Week", action: "r:week" },
  { label: "\u{1F4C6} ወር · Month", action: "r:month" },
  { label: "\u{1F4C8} ዓመት · Year", action: "r:year" },
  { label: "\u{1F372} ምርጥ ምግቦች · Best dishes", action: "dishes" },
  { label: "\u{1F465} ሠራተኞች · People", action: "staff" },
  { label: "\u{1F4B8} ወጪዎች · Costs", action: "expenses" },
  { label: "\u{1F4DD} ማስታወሻዎች · Notes", action: "notes" },
  { label: "\u{1F4CB} ምናሌ · Menu", action: "menu" },
  { label: "\u{1F9FE} ትዕዛዞች · Orders", action: "orders" },
  { label: "❓ እገዛ · Help", action: "help" },
];

/** Two per row, with the odd one out on its own. */
export const MENU_KEYBOARD: string[][] = MENU_BUTTONS.reduce<string[][]>((rows, b, i) => {
  if (i % 2 === 0) rows.push([b.label]);
  else rows[rows.length - 1].push(b.label);
  return rows;
}, []);

/**
 * Buttons come back as text, and people also just type "week". Both are
 * matched on a stripped-down form of the label, so an emoji change or a
 * different separator does not break the menu.
 */
const normalise = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

const BUTTON_ACTIONS = new Map<string, string>();
for (const b of MENU_BUTTONS) {
  BUTTON_ACTIONS.set(normalise(b.label), b.action);
  // ...and each half on its own, so the Amharic or the English alone both work.
  for (const part of b.label.split("·")) {
    const key = normalise(part);
    if (key) BUTTON_ACTIONS.set(key, b.action);
  }
}

/** The action a plain (non-slash) message asks for, if any. */
function actionForText(text: string): string | null {
  return BUTTON_ACTIONS.get(normalise(text)) ?? null;
}

const backKeyboard: InlineButton[][] = [[{ text: "\u{2190} Back", callback_data: "home" }]];

/* ------------------------------------------------------------------ reports */

async function homeText(): Promise<string> {
  const { business } = await getSettings();
  const day = await today();
  const summary = await getSummary(rangeFor("day", day));

  return [
    `<b>${escapeHtml(business.restaurantName)}</b>`,
    `<i>${escapeHtml(formatDayLabel(day))}</i>`,
    "",
    summary.orders > 0
      ? `So far today: <b>${money(summary.revenueCents)}</b> from ${summary.orders} order${summary.orders === 1 ? "" : "s"}.`
      : "No sales recorded yet today.",
    "",
    "Pick what you want to see:",
  ].join("\n");
}

async function periodReport(grain: Grain): Promise<string> {
  const day = await today();
  const range = rangeFor(grain, day);
  const [summary, previous, dishes] = await Promise.all([
    getSummary(range),
    getSummary(previousRange(range)),
    getItemPerformance(range, "restaurant", 3),
  ]);

  const lines = [
    `<b>${escapeHtml(range.label)}</b>`,
    `<i>${range.from}${range.from === range.to ? "" : ` to ${range.to}`}</i>`,
    "",
  ];

  if (summary.orders === 0) {
    lines.push("No sales recorded in this period.");
    if (summary.totalCostCents > 0) {
      lines.push("", `Running costs still came to ${money(summary.totalCostCents)}.`);
    }
    return lines.join("\n");
  }

  lines.push(
    `\u{1F4B5} <b>Money in</b>  ${money(summary.revenueCents)}${deltaLine(deltaPct(previous.revenueCents, summary.revenueCents))}`,
    `\u{1F4B8} <b>Cost</b>  ${money(summary.totalCostCents)}`,
    `   <i>food ${compact(summary.cogsCents)} · running ${compact(summary.overheadCents)}</i>`,
    `${summary.profitCents >= 0 ? "\u{2705}" : "\u{26A0}\u{FE0F}"} <b>${summary.profitCents >= 0 ? "Profit" : "Loss"}</b>  ${money(Math.abs(summary.profitCents))} (${summary.marginPct.toFixed(0)}%)${deltaLine(deltaPct(previous.profitCents, summary.profitCents))}`,
    "",
    `\u{1F9FE} ${summary.orders} orders · ${summary.items} items · average ${money(summary.avgOrderCents)}`,
  );

  if (dishes.length) {
    lines.push("", "<b>Top sellers</b>");
    dishes.forEach((d, i) => {
      lines.push(
        `${i + 1}. ${escapeHtml(d.emoji)} ${escapeHtml(d.name)} — ${d.qty} sold, ${money(d.revenueCents)}`,
      );
    });
  }

  if (summary.usedOverride) {
    lines.push(
      "",
      "<i>Food cost here comes from your recorded spending, not the per-plate estimates.</i>",
    );
  }

  return lines.join("\n");
}

async function dishesReport(): Promise<string> {
  const day = await today();
  const range = rangeFor("month", day);
  const { business } = await getSettings();
  const items = await getItemPerformance(range, "restaurant", 100);

  if (!items.length) return `<b>Best dishes</b>\n\nNothing sold this month yet.`;

  const byProfit = [...items].sort((a, b) => b.profitCents - a.profitCents);
  const thin = [...items]
    .filter((i) => i.qty >= 3)
    .sort((a, b) => a.marginPct - b.marginPct)
    .slice(0, 3);

  const lines = [`<b>Dishes — ${escapeHtml(range.label)}</b>`, "", "<b>Most money in</b>"];

  items.slice(0, 5).forEach((d, i) => {
    lines.push(
      `${i + 1}. ${escapeHtml(d.emoji)} ${escapeHtml(d.name)} — ${d.qty} sold, ${money(d.revenueCents)}`,
    );
  });

  lines.push("", "<b>Most money kept</b>");
  byProfit.slice(0, 5).forEach((d, i) => {
    lines.push(
      `${i + 1}. ${escapeHtml(d.emoji)} ${escapeHtml(d.name)} — ${money(d.profitCents)} (${d.marginPct.toFixed(0)}%)`,
    );
  });

  if (thin.length) {
    lines.push("", `<b>\u{26A0}\u{FE0F} Thinnest margins</b> <i>(target ${business.lowMarginPct}%)</i>`);
    for (const d of thin) {
      lines.push(
        `· ${escapeHtml(d.name)} — ${d.marginPct.toFixed(0)}%, ${d.qty} sold`,
      );
    }
  }

  const categories = await getCategoryBreakdown(range);
  if (categories.length) {
    lines.push("", "<b>By group</b>");
    for (const c of categories.slice(0, 6)) {
      lines.push(`· ${escapeHtml(c.category)} — ${compact(c.revenueCents)}`);
    }
  }

  return lines.join("\n");
}

async function staffReport(): Promise<string> {
  const day = await today();
  const range = rangeFor("month", day);
  const [staff, hourly, weekday] = await Promise.all([
    getStaffPerformance(range),
    getHourlyPattern(range),
    getWeekdayPattern(range),
  ]);

  const lines = [`<b>People — ${escapeHtml(range.label)}</b>`, ""];

  if (!staff.length) {
    lines.push("Nobody has recorded a sale this month.");
  } else {
    for (const s of staff) {
      lines.push(
        `${escapeHtml(s.avatar)} <b>${escapeHtml(s.name)}</b> — ${s.orders} orders, ${money(s.revenueCents)}`,
        `   <i>average ${money(s.avgOrderCents)} · ${s.items} items</i>`,
      );
    }
  }

  const busiest = [...hourly].sort((a, b) => b.revenueCents - a.revenueCents)[0];
  if (busiest && busiest.revenueCents > 0) {
    lines.push("", `\u{23F0} Busiest hour: <b>${escapeHtml(busiest.label)}</b> (${compact(busiest.revenueCents)})`);
  }

  const bestDay = [...weekday].sort((a, b) => b.avgRevenueCents - a.avgRevenueCents)[0];
  const worstDay = [...weekday].filter((d) => d.days > 0).sort((a, b) => a.avgRevenueCents - b.avgRevenueCents)[0];
  if (bestDay && bestDay.avgRevenueCents > 0) {
    lines.push(`\u{1F4C5} Best day: <b>${bestDay.label}</b> (${compact(bestDay.avgRevenueCents)} average)`);
  }
  if (worstDay && worstDay !== bestDay) {
    lines.push(`\u{1F4C9} Quietest: <b>${worstDay.label}</b> (${compact(worstDay.avgRevenueCents)} average)`);
  }

  return lines.join("\n");
}

async function expensesReport(): Promise<string> {
  const day = await today();
  const range = rangeFor("month", day);
  const [expenses, breakdown, summary] = await Promise.all([
    listExpenses({ includeEnded: false }),
    getExpenseBreakdown(range),
    getSummary(range),
  ]);

  const perDay = expenses
    .filter((e) => e.scope !== "one_off")
    .reduce((t, e) => t + e.perDayCents, 0);

  const lines = [
    `<b>Costs — ${escapeHtml(range.label)}</b>`,
    "",
    `Running cost per day: <b>${money(perDay)}</b>`,
    `<i>You need at least this much every day, before food, to break even.</i>`,
    "",
    `Food cost this month: ${money(summary.cogsCents)}`,
    `Running cost this month: ${money(summary.overheadCents)}`,
    "",
  ];

  if (breakdown.length) {
    lines.push("<b>Where it went</b>");
    for (const b of breakdown.slice(0, 8)) {
      lines.push(
        `· ${escapeHtml(b.category)} — ${money(b.allocatedCents)}${b.isOverride ? " <i>(replaces estimates)</i>" : ""}`,
      );
    }
  }

  if (expenses.length) {
    lines.push("", "<b>Still running</b>");
    for (const e of expenses.slice(0, 8)) {
      lines.push(
        `· ${escapeHtml(e.label)} — ${money(e.amountCents)} ${escapeHtml(e.scope.replace("_", " "))}`,
      );
    }
  }

  return lines.join("\n");
}

async function notesReport(): Promise<string> {
  const notes = await listRecentNotes({ limit: 8 });
  const lines = ["<b>Notes & messages</b>", ""];

  if (!notes.length) {
    lines.push("Nothing has been written yet.");
    return lines.join("\n");
  }

  const open = notes.filter((n) => n.kind === "issue" && !n.resolvedAt);
  if (open.length) {
    lines.push(`<b>\u{26A0}\u{FE0F} ${open.length} problem(s) still open</b>`);
    for (const n of open) {
      lines.push(`· <b>${escapeHtml(n.authorName)}</b>: ${escapeHtml(n.body.slice(0, 200))}`);
    }
    lines.push("");
  }

  lines.push("<b>Latest</b>");
  for (const n of notes.slice(0, 6)) {
    lines.push(
      `· <b>${escapeHtml(n.authorName)}</b> <i>(${escapeHtml(n.noteDate)})</i>: ${escapeHtml(n.body.slice(0, 160))}`,
    );
  }

  return lines.join("\n");
}

async function menuReport(): Promise<string> {
  const { items } = await getMenuForAdmin("restaurant");
  const live = items.filter((i) => !i.isArchived);
  const soldOut = live.filter((i) => !i.isAvailable);

  const lines = [
    `<b>Menu</b>`,
    "",
    `${live.length} dishes on the menu.`,
  ];

  if (soldOut.length) {
    lines.push("", `<b>\u{1F6AB} Marked sold out (${soldOut.length})</b>`);
    for (const i of soldOut.slice(0, 15)) {
      lines.push(`· ${escapeHtml(i.emoji)} ${escapeHtml(i.name)}`);
    }
  } else {
    lines.push("", "\u{2705} Everything is in stock.");
  }

  const quiet = live
    .filter((i) => i.isAvailable && i.soldLast30 === 0)
    .slice(0, 10);
  if (quiet.length) {
    lines.push("", `<b>Nothing sold in 30 days (${quiet.length})</b>`);
    for (const i of quiet) {
      lines.push(`· ${escapeHtml(i.emoji)} ${escapeHtml(i.name)} — ${money(i.priceCents)}`);
    }
  }

  return lines.join("\n");
}

async function ordersReport(): Promise<string> {
  const day = await today();
  const sales = await getRecentSales(rangeFor("day", day), "restaurant", 12);

  const lines = [`<b>Latest orders — ${escapeHtml(formatDayLabel(day))}</b>`, ""];

  if (!sales.length) {
    lines.push("Nothing recorded today yet.");
    return lines.join("\n");
  }

  for (const s of sales) {
    const when = new Date(s.soldAt);
    const time = when.toISOString().slice(11, 16);
    const items = s.lines.map((l) => `${l.qty}x ${l.name}`).join(", ");
    lines.push(
      `<b>${money(s.totalCents)}</b>${s.status === "void" ? " <i>(cancelled)</i>" : ""} · ${escapeHtml(s.staffName)} · <i>${time} UTC</i>`,
      `   ${escapeHtml(items.slice(0, 120))}`,
    );
  }

  return lines.join("\n");
}

/** /find <name> - one dish, across the timeframes. */
async function findDish(query: string): Promise<string> {
  const term = query.trim().toLowerCase();
  if (term.length < 2) return "Give me at least two letters, e.g. <code>/find tibs</code>";

  const day = await today();
  const year = await getItemPerformance(rangeFor("year", day), "restaurant", 400);
  const matches = year.filter((i) => i.name.toLowerCase().includes(term));

  if (!matches.length) return `Nothing sold this year matches “${escapeHtml(query)}”.`;

  const [dayItems, weekItems, monthItems] = await Promise.all([
    getItemPerformance(rangeFor("day", day), "restaurant", 400),
    getItemPerformance(rangeFor("week", day), "restaurant", 400),
    getItemPerformance(rangeFor("month", day), "restaurant", 400),
  ]);

  const lines: string[] = [];
  for (const match of matches.slice(0, 3)) {
    const find = (list: typeof year) => list.find((i) => i.key === match.key);
    const d = find(dayItems);
    const w = find(weekItems);
    const m = find(monthItems);

    lines.push(
      `${escapeHtml(match.emoji)} <b>${escapeHtml(match.name)}</b>`,
      `Today: ${d ? `${d.qty} sold, ${money(d.revenueCents)}` : "none"}`,
      `This week: ${w ? `${w.qty} sold, ${money(w.revenueCents)}` : "none"}`,
      `This month: ${m ? `${m.qty} sold, ${money(m.revenueCents)}` : "none"}`,
      `This year: ${match.qty} sold, ${money(match.revenueCents)}`,
      `Kept this year: ${money(match.profitCents)} (${match.marginPct.toFixed(0)}%)`,
      "",
    );
  }

  return lines.join("\n").trim();
}

const HELP = [
  "<b>What I can show you</b>",
  "",
  "/today — today's takings and profit",
  "/yesterday — the same for yesterday",
  "/week /month /year — wider periods",
  "/dishes — best sellers and thin margins",
  "/staff — who sold what, busiest hours",
  "/expenses — running costs and where money goes",
  "/notes — messages and open problems",
  "/menu — what is on and what is sold out",
  "/orders — the last few orders today",
  "/find tibs — one dish across every timeframe",
  "/summary — the full nightly summary, now",
  "",
  "<i>I can only read. Recording sales, prices, expenses and access all stay in the app.</i>",
].join("\n");

/* ------------------------------------------------------------------ routing */

/**
 * Resolves an action name to a report. Shared by commands, buttons and the
 * preview script, which is how the report text gets checked without a live bot.
 */
export async function renderAction(action: string, argument = ""): Promise<{ text: string; keyboard: InlineButton[][] }> {
  switch (action) {
    case "home":
      return { text: await homeText(), keyboard: HOME_KEYBOARD };
    case "help":
      return { text: HELP, keyboard: backKeyboard };
    case "r:day":
      return { text: await periodReport("day"), keyboard: backKeyboard };
    case "r:week":
      return { text: await periodReport("week"), keyboard: backKeyboard };
    case "r:month":
      return { text: await periodReport("month"), keyboard: backKeyboard };
    case "r:year":
      return { text: await periodReport("year"), keyboard: backKeyboard };
    case "yesterday": {
      const day = addDays(await today(), -1);
      const summary = await getSummary(rangeFor("day", day));
      const dishes = await getItemPerformance(rangeFor("day", day), "restaurant", 3);
      const lines = [
        `<b>${escapeHtml(formatDayLabel(day))}</b>`,
        "",
        summary.orders === 0
          ? "No sales were recorded."
          : [
              `\u{1F4B5} Money in  ${money(summary.revenueCents)}`,
              `\u{1F4B8} Cost  ${money(summary.totalCostCents)}`,
              `${summary.profitCents >= 0 ? "\u{2705}" : "\u{26A0}\u{FE0F}"} ${summary.profitCents >= 0 ? "Profit" : "Loss"}  ${money(Math.abs(summary.profitCents))} (${summary.marginPct.toFixed(0)}%)`,
              "",
              `\u{1F9FE} ${summary.orders} orders · ${summary.items} items`,
            ].join("\n"),
      ];
      if (dishes.length) {
        lines.push("", "<b>Top sellers</b>");
        dishes.forEach((d, i) =>
          lines.push(`${i + 1}. ${escapeHtml(d.name)} — ${d.qty} sold, ${money(d.revenueCents)}`),
        );
      }
      return { text: lines.join("\n"), keyboard: backKeyboard };
    }
    case "dishes":
      return { text: await dishesReport(), keyboard: backKeyboard };
    case "staff":
      return { text: await staffReport(), keyboard: backKeyboard };
    case "expenses":
      return { text: await expensesReport(), keyboard: backKeyboard };
    case "notes":
      return { text: await notesReport(), keyboard: backKeyboard };
    case "menu":
      return { text: await menuReport(), keyboard: backKeyboard };
    case "orders":
      return { text: await ordersReport(), keyboard: backKeyboard };
    case "summary": {
      const digest = await buildDigest(await today());
      return { text: digest.text.telegramHtml, keyboard: backKeyboard };
    }
    case "find":
      return { text: await findDish(argument), keyboard: backKeyboard };
    default:
      return { text: HELP, keyboard: HOME_KEYBOARD };
  }
}

const WELCOME = [
  "\u{1F44B} <b>ልዑል ማዕድ</b>",
  "",
  "The buttons below stay put - tap one any time.",
  "Type <code>/find shiro</code> to follow a single dish, or <code>/help</code> for everything.",
  "",
  "<i>Read only. Nothing here can change a sale, a price or an expense.</i>",
].join("\n");

const COMMAND_MAP: Record<string, string> = {
  start: "home",
  buttons: "home",
  keyboard: "home",
  home: "home",
  help: "help",
  today: "r:day",
  yesterday: "yesterday",
  week: "r:week",
  month: "r:month",
  year: "r:year",
  dishes: "dishes",
  food: "dishes",
  staff: "staff",
  people: "staff",
  expenses: "expenses",
  costs: "expenses",
  notes: "notes",
  menu: "menu",
  stock: "menu",
  orders: "orders",
  summary: "summary",
  find: "find",
};

export type TelegramUpdate = {
  message?: {
    message_id: number;
    chat: { id: number };
    text?: string;
    from?: { first_name?: string; username?: string };
  };
  callback_query?: {
    id: string;
    data?: string;
    message?: { message_id: number; chat: { id: number } };
  };
};

/**
 * Handles one update. Always resolves - an unhandled throw here would make
 * Telegram retry the same update forever.
 */
export async function handleUpdate(update: TelegramUpdate): Promise<void> {
  try {
    if (update.callback_query) return await handleCallback(update.callback_query);
    if (update.message) return await handleMessage(update.message);
  } catch (err) {
    console.error("[telegram] update failed", err);
    const chatId =
      update.message?.chat.id ?? update.callback_query?.message?.chat.id ?? null;
    if (chatId && isAllowed(chatId)) {
      await sendMessage(chatId, "Something went wrong reading that. Please try again.").catch(
        () => {},
      );
    }
  }
}

async function handleMessage(message: NonNullable<TelegramUpdate["message"]>) {
  const chatId = message.chat.id;

  if (!isAllowed(chatId)) {
    // Say who to ask, and include the id so the owner can allowlist them - but
    // reveal nothing about the business itself.
    await sendMessage(
      chatId,
      [
        "This bot is private to one business.",
        "",
        `If you should have access, ask the owner to add this ID:`,
        `<code>${chatId}</code>`,
      ].join("\n"),
    );
    return;
  }

  const text = (message.text ?? "").trim();

  if (!text.startsWith("/")) {
    // A tapped menu button arrives here as ordinary text.
    const tapped = actionForText(text);
    const { text: body, keyboard } = await renderAction(tapped ?? "home");
    await sendMessage(chatId, body, { keyboard });
    return;
  }

  // "/find tibs@MyBot" -> command "find", argument "tibs"
  const [rawCommand, ...rest] = text.slice(1).split(/\s+/);
  const command = rawCommand.split("@")[0].toLowerCase();
  const argument = rest.join(" ");

  // /start - and /buttons, for chats that were here before the menu existed -
  // installs the persistent keyboard. Telegram allows one set of buttons per
  // message, so the greeting carries it and the report follows behind.
  if (command === "start" || command === "buttons" || command === "keyboard") {
    await sendMessage(chatId, WELCOME, { replyKeyboard: MENU_KEYBOARD });
    const home = await renderAction("home");
    await sendMessage(chatId, home.text, { keyboard: home.keyboard });
    return;
  }

  const action = COMMAND_MAP[command];
  if (!action) {
    await sendMessage(chatId, `I do not know <code>/${escapeHtml(command)}</code>.\n\n${HELP}`, {
      keyboard: HOME_KEYBOARD,
    });
    return;
  }

  const { text: body, keyboard } = await renderAction(action, argument);
  await sendMessage(chatId, body, { keyboard });
}

async function handleCallback(query: NonNullable<TelegramUpdate["callback_query"]>) {
  const chatId = query.message?.chat.id;
  const messageId = query.message?.message_id;

  if (!chatId || !isAllowed(chatId)) {
    await answerCallback(query.id, "Not allowed.");
    return;
  }

  await answerCallback(query.id);

  const { text, keyboard } = await renderAction(query.data ?? "home");
  if (messageId) await editMessage(chatId, messageId, text, { keyboard });
  else await sendMessage(chatId, text, { keyboard });
}

/** Registered with Telegram so the commands show in its menu button. */
export const BOT_COMMANDS = [
  { command: "today", description: "Today's takings and profit" },
  { command: "yesterday", description: "Yesterday's numbers" },
  { command: "week", description: "This week" },
  { command: "month", description: "This month" },
  { command: "year", description: "This year" },
  { command: "dishes", description: "Best sellers and thin margins" },
  { command: "staff", description: "Who sold what" },
  { command: "expenses", description: "Running costs" },
  { command: "notes", description: "Messages and open problems" },
  { command: "menu", description: "What is on and what is sold out" },
  { command: "orders", description: "The last few orders today" },
  { command: "find", description: "One dish across every timeframe" },
  { command: "summary", description: "The full nightly summary, now" },
  { command: "help", description: "What I can show you" },
  { command: "buttons", description: "Show the button menu again" },
];
