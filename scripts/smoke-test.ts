/**
 * Smoke test against a running server. Exercises the security boundary, the
 * offline-sync contract (including replay and a lying client), and every page.
 *
 *   npm run smoke                     # against http://localhost:3000
 *   npm run smoke -- http://host:3111
 *
 * It cleans up after itself: every row it creates is prefixed `e2e-` and
 * deleted at the end.
 */
import { readdirSync, readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { SignJWT } from "jose";

const BASE = process.argv[2] ?? process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const sql = neon(process.env.DATABASE_URL!);
const secret = new TextEncoder().encode(process.env.SESSION_SECRET!);

let pass = 0;
let fail = 0;

function check(name: string, condition: boolean, extra = "") {
  if (condition) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name} ${extra}`);
  }
}

async function cookieFor(role: "admin" | "staff") {
  const rows = (await sql`
    SELECT id::text, name, role, avatar FROM users
    WHERE role = ${role} AND access_level = 'full' LIMIT 1
  `) as { id: string; name: string; role: string; avatar: string }[];
  if (!rows.length) throw new Error(`no ${role} user`);
  const u = rows[0];
  const token = await new SignJWT({ sub: u.id, name: u.name, role: u.role, avatar: u.avatar })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(secret);
  return { cookie: `bm_session=${token}`, user: u };
}

async function get(path: string, cookie?: string) {
  const res = await fetch(BASE + path, {
    headers: cookie ? { cookie } : {},
    redirect: "manual",
  });
  const body = await res.text();
  return { status: res.status, body, headers: res.headers };
}

async function postJSON(path: string, data: unknown, cookie?: string) {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(data),
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non-json */
  }
  return { status: res.status, json: json as Record<string, unknown> | null, text };
}

async function main() {
  console.log(`\nTesting ${BASE}\n`);

  /* ---- unauthenticated ---- */
  console.log("Unauthenticated:");
  const login = await get("/login");
  check("GET /login is 200", login.status === 200);
  check("login page has the code field", login.body.includes("6-digit code"));

  const rootRedirect = await get("/");
  check("GET / redirects when signed out", [307, 302, 303].includes(rootRedirect.status),
    `got ${rootRedirect.status}`);

  const staffBlocked = await get("/staff");
  check("GET /staff redirects when signed out", [307, 302, 303].includes(staffBlocked.status),
    `got ${staffBlocked.status}`);

  const syncBlocked = await postJSON("/api/sync", { ops: [] });
  check("POST /api/sync is 401 when signed out", syncBlocked.status === 401,
    `got ${syncBlocked.status}`);

  const exportBlocked = await get("/api/export");
  check("GET /api/export is 403 when signed out", exportBlocked.status === 403,
    `got ${exportBlocked.status}`);

  /* ---- staff session ---- */
  const staff = await cookieFor("staff");
  console.log(`\nStaff session (${staff.user.name}):`);

  const till = await get("/staff", staff.cookie);
  check("GET /staff is 200", till.status === 200, `got ${till.status}`);

  const menu = await postJSON("/api/menu", null, staff.cookie);
  const menuGet = await get("/api/menu", staff.cookie);
  const menuJson = JSON.parse(menuGet.body) as {
    items: { id: string; name: string; priceCents: number; estCostCents: number; categoryName: string | null }[];
  };
  check("GET /api/menu returns items", menuJson.items.length > 0, `${menuJson.items.length} items`);
  void menu;

  const adminOnlyForStaff = await get("/admin", staff.cookie);
  check("staff cannot reach /admin", [307, 302, 303].includes(adminOnlyForStaff.status),
    `got ${adminOnlyForStaff.status}`);

  /* ---- the sync contract ---- */
  console.log("\nSync:");
  const item = menuJson.items[0];
  const clientId = `e2e-${Date.now()}`;
  const salePayload = {
    module: "restaurant",
    soldAt: new Date().toISOString(),
    paymentMethod: "cash",
    discountCents: 500,
    tableLabel: "E2E",
    customerNote: "automated test",
    deviceId: "e2e-device",
    lines: [
      {
        menuItemId: item.id,
        name: item.name,
        emoji: "\u{1F35B}",
        categoryName: item.categoryName,
        qty: 2,
        unitPriceCents: item.priceCents,
        unitCostCents: item.estCostCents,
      },
    ],
  };

  const first = await postJSON(
    "/api/sync",
    { ops: [{ kind: "sale", clientId, payload: salePayload }] },
    staff.cookie,
  );
  const firstResults = (first.json?.results ?? []) as { verdict: string }[];
  check("first send applies the sale", firstResults[0]?.verdict === "applied",
    JSON.stringify(first.json));

  const replay = await postJSON(
    "/api/sync",
    { ops: [{ kind: "sale", clientId, payload: salePayload }] },
    staff.cookie,
  );
  const replayResults = (replay.json?.results ?? []) as { verdict: string }[];
  check("replaying the same clientId is a duplicate", replayResults[0]?.verdict === "duplicate",
    JSON.stringify(replay.json));

  const dbRows = (await sql`
    SELECT s.total_cents, s.total_cost_cents, s.item_count, s.discount_cents,
           (SELECT count(*)::int FROM sale_items si WHERE si.sale_id = s.id) AS lines
    FROM sales s WHERE s.client_id = ${clientId}
  `) as { total_cents: number; total_cost_cents: number; item_count: number; discount_cents: number; lines: number }[];

  check("exactly one sale row exists after the replay", dbRows.length === 1, `${dbRows.length} rows`);
  const expectedTotal = item.priceCents * 2 - 500;
  check(
    "server recomputed the total",
    dbRows[0]?.total_cents === expectedTotal,
    `${dbRows[0]?.total_cents} vs ${expectedTotal}`,
  );
  check("cost snapshot stored", dbRows[0]?.total_cost_cents === item.estCostCents * 2,
    `${dbRows[0]?.total_cost_cents}`);
  check("one line stored, not two", dbRows[0]?.lines === 1, `${dbRows[0]?.lines} lines`);

  // A client that lies about the total must not win.
  const liarId = `e2e-liar-${Date.now()}`;
  const liar = await postJSON(
    "/api/sync",
    {
      ops: [
        {
          kind: "sale",
          clientId: liarId,
          payload: { ...salePayload, totalCents: 1, lines: salePayload.lines },
        },
      ],
    },
    staff.cookie,
  );
  const liarRows = (await sql`
    SELECT total_cents FROM sales WHERE client_id = ${liarId}
  `) as { total_cents: number }[];
  check(
    "a client-supplied total is ignored",
    liarRows[0]?.total_cents === expectedTotal,
    `${liarRows[0]?.total_cents}`,
  );
  void liar;

  // Malformed op -> whole batch rejected at the envelope, nothing written.
  const badEnvelope = await postJSON(
    "/api/sync",
    { ops: [{ kind: "sale", clientId: "e2e-bad", payload: { lines: [] } }] },
    staff.cookie,
  );
  check("a malformed op is refused with 400", badEnvelope.status === 400,
    `got ${badEnvelope.status}`);

  // Staff may not file expenses.
  const staffExpense = await postJSON(
    "/api/sync",
    {
      ops: [
        {
          kind: "expense",
          clientId: `e2e-exp-${Date.now()}`,
          payload: {
            module: "restaurant",
            scope: "one_off",
            label: "should be refused",
            category: "other",
            amountCents: 1000,
            effectiveDate: new Date().toISOString().slice(0, 10),
            replacesItemCosts: false,
          },
        },
      ],
    },
    staff.cookie,
  );
  const expenseVerdict = (staffExpense.json?.results as { verdict: string; reason?: string }[])?.[0];
  check("staff expense op is rejected, not applied", expenseVerdict?.verdict === "rejected",
    JSON.stringify(expenseVerdict));

  // A note from a staff device works.
  const noteId = `e2e-note-${Date.now()}`;
  const note = await postJSON(
    "/api/sync",
    {
      ops: [
        {
          kind: "note",
          clientId: noteId,
          payload: {
            module: "restaurant",
            kind: "handover",
            noteDate: new Date().toISOString().slice(0, 10),
            body: "Automated test note - safe to delete.",
          },
        },
      ],
    },
    staff.cookie,
  );
  check("a note syncs", (note.json?.results as { verdict: string }[])?.[0]?.verdict === "applied",
    JSON.stringify(note.json));

  /* ---- access control ---- */
  console.log("\nAccess control:");

  const setAccess = async (level: string) => {
    await sql`UPDATE users SET access_level = ${level} WHERE id = ${staff.user.id}::uuid`;
  };

  const blockedSaleId = `e2e-blocked-${Date.now()}`;
  const blockedOps = {
    ops: [{ kind: "sale", clientId: blockedSaleId, payload: salePayload }],
  };

  try {
    // read_only: may still sign in and look, may not record.
    await setAccess("read_only");

    const roSync = await postJSON("/api/sync", blockedOps, staff.cookie);
    check("read-only staff cannot sync a sale (403)", roSync.status === 403,
      `got ${roSync.status}`);
    check("the refusal is labelled write-blocked", roSync.json?.code === "write-blocked",
      JSON.stringify(roSync.json));

    const notWritten = (await sql`
      SELECT 1 FROM sales WHERE client_id = ${blockedSaleId}
    `) as unknown[];
    check("nothing was written for the refused sale", notWritten.length === 0);

    const roTill = await get("/staff", staff.cookie);
    check("read-only staff can still open the till", roTill.status === 200,
      `got ${roTill.status}`);
    check("the till says recording is paused", roTill.body.includes("Recording is paused"));

    const roMenu = await get("/api/menu", staff.cookie);
    check("read-only staff can still read the menu", roMenu.status === 200);

    // blocked: cannot get in at all.
    await setAccess("blocked");

    const blockedTill = await get("/staff", staff.cookie);
    check(
      "blocked staff are bounced off the till",
      [307, 302, 303].includes(blockedTill.status),
      `got ${blockedTill.status}`,
    );
    check(
      "...and sent to the sign-in page with a reason",
      (blockedTill.headers.get("location") ?? "").includes("blocked=1"),
      blockedTill.headers.get("location") ?? "(no location)",
    );

    const blockedSync = await postJSON("/api/sync", blockedOps, staff.cookie);
    check("blocked staff cannot sync (403)", blockedSync.status === 403,
      `got ${blockedSync.status}`);

    const blockedNotes = await get("/notes", staff.cookie);
    check(
      "blocked staff are bounced off the notes board",
      [307, 302, 303].includes(blockedNotes.status),
      `got ${blockedNotes.status}`,
    );
  } finally {
    // Always hand access back, even if a check above threw.
    await setAccess("full");
  }

  const restored = await postJSON("/api/sync", blockedOps, staff.cookie);
  const restoredVerdict = (restored.json?.results as { verdict: string }[])?.[0]?.verdict;
  check(
    "the same queued sale goes through once access is restored",
    restoredVerdict === "applied",
    JSON.stringify(restored.json),
  );

  /* ---- admin session ---- */
  const admin = await cookieFor("admin");
  console.log(`\nAdmin session (${admin.user.name}):`);

  const pages: [string, string][] = [
    ["/admin", "dashboard"],
    ["/admin?grain=week", "dashboard week"],
    ["/admin?grain=month", "dashboard month"],
    ["/admin?grain=year", "dashboard year"],
    ["/admin/analytics", "reports"],
    ["/admin/analytics?grain=month", "reports month"],
    ["/admin/log", "day log"],
    ["/admin/log?tab=notes", "day log notes"],
    ["/admin/expenses", "expenses"],
    ["/admin/menu", "menu"],
    ["/admin/team", "team"],
    ["/admin/settings", "settings"],
    ["/notes", "notes board"],
    ["/shop", "shop stub"],
    ["/offline", "offline page"],
    ["/staff", "till as admin"],
    ["/staff/shift", "shift view"],
  ];

  pages.push([`/admin/dish/${item.id}`, "dish detail"]);
  pages.push(["/admin/dish/00000000-0000-0000-0000-000000000000", "unknown dish is 404"]);

  for (const [path, label] of pages) {
    const res = await get(path, admin.cookie);
    const expected = label.includes("404") ? 404 : 200;
    check(`GET ${path} (${label})`, res.status === expected, `got ${res.status}`);
  }

  const notif = await get("/api/notifications", admin.cookie);
  const notifJson = JSON.parse(notif.body) as { unread: number; items: unknown[] };
  check("notifications endpoint works", notif.status === 200 && Array.isArray(notifJson.items),
    `unread=${notifJson.unread}`);

  const pushInfo = await get("/api/push", admin.cookie);
  const pushJson = JSON.parse(pushInfo.body) as { configured: boolean };
  check("push is configured on the server", pushJson.configured === true);

  const csv = await get("/api/export?grain=month", admin.cookie);
  check("CSV export works", csv.status === 200 && csv.body.includes("SUMMARY"),
    `got ${csv.status}`);
  check("CSV has all four sections",
    ["SUMMARY", "DAILY TOTALS", "ORDERS", "BY DISH"].every((s) => csv.body.includes(s)));

  /* ---- nightly summary ---- */
  console.log("\nNightly summary:");

  const cronSecret = process.env.CRON_SECRET ?? "";
  check("CRON_SECRET is configured", cronSecret.length > 10);

  const noKey = await get("/api/cron/daily-digest");
  check("cron endpoint refuses a request with no key", noKey.status === 401,
    `got ${noKey.status}`);

  const wrongKey = await get("/api/cron/daily-digest?key=definitely-not-the-secret");
  check("cron endpoint refuses a wrong key", wrongKey.status === 401,
    `got ${wrongKey.status}`);

  // A signed-in admin session must NOT be enough - this endpoint is for the
  // scheduler only, so an admin's browser cannot trigger sends by accident.
  const adminNoKey = await get("/api/cron/daily-digest", admin.cookie);
  check("an admin cookie alone does not trigger the cron", adminNoKey.status === 401,
    `got ${adminNoKey.status}`);

  const withKey = await get(`/api/cron/daily-digest?key=${encodeURIComponent(cronSecret)}`);
  check("cron endpoint accepts the right key", withKey.status === 200,
    `got ${withKey.status}`);

  const cronBody = JSON.parse(withKey.body || "{}") as {
    skipped?: boolean;
    reason?: string;
    results?: { channel: string; sent: number }[];
    businessDate?: string;
  };
  check(
    "...and answers with either a send or a documented reason for skipping",
    cronBody.skipped === true ? Boolean(cronBody.reason) : Array.isArray(cronBody.results),
    JSON.stringify(cronBody).slice(0, 200),
  );

  // The guarantee that matters: one (day, channel) can only ever be claimed
  // once, so a scheduler firing hourly cannot send twelve identical messages.
  const probeDay = "1999-01-02";
  await sql`DELETE FROM digest_runs WHERE business_date = ${probeDay}::date`;
  const firstClaim = (await sql`
    INSERT INTO digest_runs (module, business_date, channel)
    VALUES ('restaurant', ${probeDay}::date, 'telegram')
    ON CONFLICT DO NOTHING RETURNING id
  `) as unknown[];
  const secondClaim = (await sql`
    INSERT INTO digest_runs (module, business_date, channel)
    VALUES ('restaurant', ${probeDay}::date, 'telegram')
    ON CONFLICT DO NOTHING RETURNING id
  `) as unknown[];
  check("a day+channel can be claimed once", firstClaim.length === 1);
  check("...and never twice", secondClaim.length === 0);
  await sql`DELETE FROM digest_runs WHERE business_date = ${probeDay}::date`;

  /* ---- telegram bot ---- */
  console.log("\nTelegram bot:");

  const hookNoSecret = await postJSON("/api/telegram/webhook", { update_id: 1 });
  check("webhook refuses an update with no secret header", hookNoSecret.status === 401,
    `got ${hookNoSecret.status}`);

  const hookBadSecret = await fetch(BASE + "/api/telegram/webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-telegram-bot-api-secret-token": "wrong-secret",
    },
    body: JSON.stringify({ update_id: 1 }),
  });
  check("webhook refuses a wrong secret", hookBadSecret.status === 401,
    `got ${hookBadSecret.status}`);

  /**
   * The bot must never be able to change anything. Scanning the source is a
   * blunt check, but it is the one that keeps being true as the file grows -
   * a stray db.insert here would otherwise ship silently.
   */
  const botDir = "src/lib/telegram";
  const botFiles = readdirSync(botDir).filter((f) => f.endsWith(".ts"));
  const writeCalls: string[] = [];
  for (const file of botFiles) {
    const source = readFileSync(`${botDir}/${file}`, "utf8");
    for (const pattern of [/db\s*\.\s*insert\s*\(/, /db\s*\.\s*update\s*\(/, /db\s*\.\s*delete\s*\(/]) {
      if (pattern.test(source)) writeCalls.push(`${file}: ${pattern.source}`);
    }
    // Raw SQL writes would slip past the drizzle patterns above.
    if (/\b(INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM)\b/i.test(source)) {
      writeCalls.push(`${file}: raw SQL write`);
    }
  }
  check("the bot contains no write operations", writeCalls.length === 0, writeCalls.join(", "));
  check("the bot module was actually scanned", botFiles.length >= 3, `${botFiles.length} files`);

  const manifest = await get("/manifest.webmanifest");
  const manifestJson = JSON.parse(manifest.body) as { icons: unknown[]; display: string };
  check("manifest is served", manifest.status === 200 && manifestJson.display === "standalone");
  check("manifest has icons", manifestJson.icons.length >= 6);

  const sw = await get("/sw.js");
  check("service worker is served", sw.status === 200 && sw.body.includes("bm-outbox-sync"));

  /* ---- notification side effects ---- */
  const notifRows = (await sql`
    SELECT count(*)::int AS n FROM notifications WHERE kind IN ('sale','note')
  `) as { n: number }[];
  check("sync created admin notifications", (notifRows[0]?.n ?? 0) > 0, `${notifRows[0]?.n}`);

  /* ---- cleanup ---- */
  await sql`DELETE FROM sales WHERE client_id LIKE 'e2e-%'`;
  await sql`DELETE FROM notes WHERE client_id LIKE 'e2e-%'`;
  await sql`DELETE FROM expenses WHERE client_id LIKE 'e2e-%'`;
  await sql`DELETE FROM notifications WHERE body LIKE '%Automated test%' OR title LIKE '%E2E%'`;

  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("\nE2E crashed:", err);
  process.exit(1);
});
