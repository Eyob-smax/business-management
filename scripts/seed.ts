/**
 * Seeds the database with the accounts, categories and starting menu.
 *
 *   npm run seed              -> accounts + menu + settings (safe to re-run)
 *   npm run seed -- --demo    -> also generates ~6 weeks of sample sales and
 *                                expenses, so the analytics screens have
 *                                something to show on day one
 *   npm run seed -- --reset-codes -> also force existing accounts to the codes
 *                                  currently in .env.local
 *   npm run seed -- --wipe-demo  -> removes everything --demo created
 *
 * Re-running without a flag never duplicates: every insert is keyed on a
 * natural unique column.
 */
import { neon } from "@neondatabase/serverless";
import { hashPassword, randomCode, validatePassword } from "../src/lib/password";

const DEMO_TAG = "demo-seed";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL missing. Run with: npm run seed");
const sql = neon(url);

const args = process.argv.slice(2);
const withDemo = args.includes("--demo");
const wipeDemo = args.includes("--wipe-demo");
/**
 * Apply the codes in .env.local to accounts that already exist. Without this,
 * seeding is create-only and editing a SEED_*_CODE would appear to do nothing.
 */
const resetCodes = args.includes("--reset-codes");

/* --------------------------------------------------------------- the menu */

type SeedItem = {
  name: string;
  emoji: string;
  price: number;
  cost: number;
  unit?: string;
};
type SeedCat = {
  name: string;
  emoji: string;
  color: string;
  items: SeedItem[];
};

/** Prices in Birr; cost is a starting estimate the admin will refine. */
const MENU: SeedCat[] = [
  {
    name: "Main dishes",
    emoji: "\u{1F35B}",
    color: "amber",
    items: [
      { name: "Doro Wat", emoji: "\u{1F357}", price: 320, cost: 165 },
      { name: "Key Wat", emoji: "\u{1F372}", price: 280, cost: 150 },
      { name: "Tibs", emoji: "\u{1F356}", price: 380, cost: 205 },
      { name: "Kitfo", emoji: "\u{1F969}", price: 450, cost: 260 },
      { name: "Beyaynetu", emoji: "\u{1F957}", price: 250, cost: 105 },
      { name: "Shiro", emoji: "\u{1F958}", price: 180, cost: 62 },
      { name: "Misir Wat", emoji: "\u{1F373}", price: 170, cost: 58 },
      { name: "Gomen", emoji: "\u{1F96C}", price: 150, cost: 48 },
      { name: "Firfir", emoji: "\u{1F958}", price: 160, cost: 65 },
      { name: "Tere Siga", emoji: "\u{1F969}", price: 520, cost: 330 },
      { name: "Dulet", emoji: "\u{1F372}", price: 340, cost: 185 },
    ],
  },
  {
    name: "Fasting",
    emoji: "\u{1F33F}",
    color: "emerald",
    items: [
      { name: "Fasting Beyaynetu", emoji: "\u{1F957}", price: 230, cost: 88 },
      { name: "Atkilt", emoji: "\u{1F955}", price: 160, cost: 52 },
      { name: "Timatim Fitfit", emoji: "\u{1F345}", price: 140, cost: 45 },
    ],
  },
  {
    name: "Fast food",
    emoji: "\u{1F354}",
    color: "orange",
    items: [
      { name: "Burger", emoji: "\u{1F354}", price: 260, cost: 130 },
      { name: "Club Sandwich", emoji: "\u{1F96A}", price: 220, cost: 105 },
      { name: "Pasta", emoji: "\u{1F35D}", price: 190, cost: 70 },
      {
        name: "Sambusa",
        emoji: "\u{1F959}",
        price: 40,
        cost: 14,
        unit: "piece",
      },
      { name: "Chips", emoji: "\u{1F35F}", price: 130, cost: 45 },
    ],
  },
  {
    name: "Hot drinks",
    emoji: "\u{2615}",
    color: "stone",
    items: [
      {
        name: "Buna (coffee)",
        emoji: "\u{2615}",
        price: 40,
        cost: 12,
        unit: "cup",
      },
      {
        name: "Macchiato",
        emoji: "\u{2615}",
        price: 60,
        cost: 20,
        unit: "cup",
      },
      {
        name: "Shai (tea)",
        emoji: "\u{1F375}",
        price: 30,
        cost: 8,
        unit: "cup",
      },
      { name: "Spris", emoji: "\u{1F964}", price: 90, cost: 34, unit: "glass" },
    ],
  },
  {
    name: "Cold drinks",
    emoji: "\u{1F964}",
    color: "sky",
    items: [
      {
        name: "Soft drink",
        emoji: "\u{1F964}",
        price: 50,
        cost: 30,
        unit: "bottle",
      },
      {
        name: "Ambo water",
        emoji: "\u{1F4A7}",
        price: 35,
        cost: 20,
        unit: "bottle",
      },
      {
        name: "Avocado juice",
        emoji: "\u{1F951}",
        price: 120,
        cost: 48,
        unit: "glass",
      },
      {
        name: "Mango juice",
        emoji: "\u{1F96D}",
        price: 120,
        cost: 50,
        unit: "glass",
      },
      { name: "Beer", emoji: "\u{1F37B}", price: 90, cost: 58, unit: "bottle" },
      { name: "Tej", emoji: "\u{1F36F}", price: 110, cost: 45, unit: "glass" },
    ],
  },
];

/* -------------------------------------------------------------------- main */

async function main() {
  if (wipeDemo) return wipeDemoData();

  console.log("Seeding...\n");

  /* ---- settings ---- */
  await sql`
    INSERT INTO settings (key, value) VALUES
      ('business', ${JSON.stringify({
        restaurantName: process.env.RESTAURANT_NAME || "Our Restaurant",
        shopName: process.env.SHOP_NAME || "Our Mobile Shop",
        currency: "ETB",
        timezone: "Africa/Addis_Ababa",
        dayCutoffHour: 4,
        costingMode: "auto",
        lowMarginPct: 15,
      })}::jsonb)
    ON CONFLICT (key) DO NOTHING
  `;

  /* ---- accounts ---- */
  /**
   * Names and codes come from .env.local so they are not baked into the repo,
   * and so the family can decide them before the first run. A blank NAME skips
   * that account; a blank CODE gets a generated one. Admins add everybody else
   * from inside the app.
   */
  const accounts: { name: string; role: "admin" | "staff"; avatar: string; code: string }[] = [];

  const planned = [
    { env: "ADMIN", fallbackName: "Admin", role: "admin" as const, avatar: "\u{1F454}" },
    { env: "MANAGER", fallbackName: "Manager", role: "admin" as const, avatar: "\u{1F4CB}" },
    { env: "STAFF", fallbackName: "Waitress", role: "staff" as const, avatar: "\u{1F467}" },
  ];

  for (const plan of planned) {
    // SEED_* is the documented form; the older bare names still work.
    const rawName =
      process.env[`SEED_${plan.env}_NAME`] ?? process.env[`${plan.env}_NAME`];
    const name = (rawName ?? plan.fallbackName).trim();
    if (!name) continue; // deliberately skipped

    const rawCode = (
      process.env[`SEED_${plan.env}_CODE`] ??
      process.env[`${plan.env}_CODE`] ??
      ""
    ).trim();

    if (rawCode) {
      const problem = validatePassword(rawCode);
      if (problem) throw new Error(`SEED_${plan.env}_CODE is not usable: ${problem}`);
    }

    accounts.push({
      name,
      role: plan.role,
      avatar: plan.avatar,
      code: rawCode || randomCode(),
    });
  }

  if (!accounts.some((a) => a.role === "admin")) {
    throw new Error("At least one admin is required. Set SEED_ADMIN_NAME in .env.local.");
  }

  const created: { name: string; role: string; code: string }[] = [];
  const skipped: string[] = [];

  for (const a of accounts) {
    const handle = a.name.trim().toLowerCase();
    const hash = await hashPassword(a.code);
    const rows = (await sql`
      INSERT INTO users (name, handle, password_hash, role, avatar, must_change_password, access_level)
      VALUES (${a.name}, ${handle}, ${hash}, ${a.role}, ${a.avatar}, true, 'full')
      ON CONFLICT (handle) DO NOTHING
      RETURNING id::text
    `) as { id: string }[];

    if (rows.length) {
      created.push({ name: a.name, role: a.role, code: a.code });
      continue;
    }

    if (resetCodes) {
      // The account is already there; make the env code the real one and put
      // access back, which doubles as the recovery path for a locked-out admin.
      await sql`
        UPDATE users
        SET password_hash = ${hash},
            must_change_password = true,
            access_level = 'full'
        WHERE handle = ${handle}
      `;
      created.push({ name: a.name, role: a.role, code: a.code });
    } else {
      skipped.push(a.name);
    }
  }

  /* ---- categories + items ---- */
  let catCount = 0;
  let itemCount = 0;

  for (const [ci, cat] of MENU.entries()) {
    const existing = (await sql`
      SELECT id::text FROM categories
      WHERE module = 'restaurant' AND lower(name) = ${cat.name.toLowerCase()}
      LIMIT 1
    `) as { id: string }[];

    let catId: string;
    if (existing.length) {
      catId = existing[0].id;
    } else {
      const rows = (await sql`
        INSERT INTO categories (module, name, emoji, color, sort_order)
        VALUES ('restaurant', ${cat.name}, ${cat.emoji}, ${cat.color}, ${ci * 10})
        RETURNING id::text
      `) as { id: string }[];
      catId = rows[0].id;
      catCount++;
    }

    for (const [ii, item] of cat.items.entries()) {
      const dupe = (await sql`
        SELECT 1 FROM menu_items
        WHERE module = 'restaurant' AND lower(name) = ${item.name.toLowerCase()}
        LIMIT 1
      `) as unknown[];
      if (dupe.length) continue;

      await sql`
        INSERT INTO menu_items
          (module, category_id, name, emoji, price_cents, est_cost_cents, unit, sort_order, is_featured)
        VALUES
          ('restaurant', ${catId}::uuid, ${item.name}, ${item.emoji},
           ${Math.round(item.price * 100)}, ${Math.round(item.cost * 100)},
           ${item.unit ?? "plate"}, ${ii * 10}, ${ii < 2 && ci < 2})
      `;
      itemCount++;
    }
  }

  console.log(`  categories added : ${catCount}`);
  console.log(`  menu items added : ${itemCount}`);

  if (created.length) {
    console.log(
      "\n  ── SIGN-IN CODES (write these down, they are shown once) ──",
    );
    for (const c of created) {
      console.log(
        `   ${c.role.padEnd(5)}  name: ${c.name.padEnd(10)}  code: ${c.code}`,
      );
    }
    console.log(
      "  Each account is asked to pick a new code on first sign-in.\n",
    );
  }

  if (skipped.length) {
    console.log(`\n  Already existed, codes unchanged: ${skipped.join(", ")}`);
    console.log("  Forgot one? Run: npm run reset-admin -- <name>\n");
  }

  console.log(
    "  Admins add and manage everybody else from Team & codes inside the app.",
  );

  if (withDemo) await seedDemo();

  console.log("Done.");
}

/* ------------------------------------------------------------- demo data */

async function seedDemo() {
  console.log("\nGenerating sample trading history...");

  const items = (await sql`
    SELECT m.id::text, m.name, m.emoji, m.price_cents, m.est_cost_cents,
           c.name AS category
    FROM menu_items m LEFT JOIN categories c ON c.id = m.category_id
    WHERE m.module = 'restaurant' AND m.archived_at IS NULL
  `) as {
    id: string;
    name: string;
    emoji: string;
    price_cents: number;
    est_cost_cents: number;
    category: string | null;
  }[];

  const staff = (await sql`
    SELECT id::text, name FROM users ORDER BY role DESC, name
  `) as { id: string; name: string }[];

  if (!items.length || !staff.length) {
    console.log("  (no menu or users yet - skipping)");
    return;
  }

  const DAYS = 45;
  // Deterministic pseudo-random so re-running --demo gives the same history.
  let seed = 12345;
  const rnd = () =>
    (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const pick = <T>(arr: T[]) => arr[Math.floor(rnd() * arr.length)];

  const today = new Date();
  let sales = 0;

  for (let d = DAYS; d >= 0; d--) {
    const date = new Date(today);
    date.setDate(date.getDate() - d);
    const key = date.toISOString().slice(0, 10);
    const dow = date.getDay();

    // Weekends busier, Mondays quiet - gives the weekday chart something real.
    const busy = dow === 0 || dow === 6 ? 1.45 : dow === 1 ? 0.7 : 1;
    const orders = Math.round((14 + rnd() * 16) * busy);

    for (let o = 0; o < orders; o++) {
      // Two humps: lunch around 13:00, dinner around 20:00.
      const lunch = rnd() < 0.55;
      const hour = lunch
        ? 11 + Math.floor(rnd() * 4)
        : 18 + Math.floor(rnd() * 4);
      const soldAt = new Date(date);
      soldAt.setHours(hour, Math.floor(rnd() * 60), Math.floor(rnd() * 60), 0);

      const lineCount = 1 + Math.floor(rnd() * 3);
      const lines: Record<string, unknown>[] = [];
      for (let l = 0; l < lineCount; l++) {
        const item = pick(items);
        const qty = 1 + (rnd() < 0.22 ? 1 : 0);
        lines.push({
          menu_item_id: item.id,
          name: item.name,
          emoji: item.emoji,
          category: item.category,
          qty,
          unit_price: item.price_cents,
          unit_cost: item.est_cost_cents,
        });
      }

      const gross = lines.reduce(
        (t, l) => t + (l.qty as number) * (l.unit_price as number),
        0,
      );
      const cost = lines.reduce(
        (t, l) => t + (l.qty as number) * (l.unit_cost as number),
        0,
      );
      const count = lines.reduce((t, l) => t + (l.qty as number), 0);
      const person = pick(staff);
      const clientId = `${DEMO_TAG}-${key}-${o}`;
      const payment = rnd() < 0.7 ? "cash" : rnd() < 0.8 ? "telebirr" : "card";

      await sql`
        WITH ins AS (
          INSERT INTO sales (client_id, module, staff_id, sold_at, business_date, payment_method,
                             total_cents, total_cost_cents, discount_cents, item_count, device_id)
          VALUES (${clientId}, 'restaurant', ${person.id}::uuid, ${soldAt.toISOString()}::timestamptz,
                  ${key}::date, ${payment}, ${gross}, ${cost}, 0, ${count}, ${DEMO_TAG})
          ON CONFLICT (client_id) DO NOTHING
          RETURNING id
        )
        INSERT INTO sale_items (sale_id, menu_item_id, name_snapshot, emoji_snapshot,
                                category_name_snapshot, qty, unit_price_cents, unit_cost_cents,
                                line_total_cents, line_cost_cents)
        SELECT ins.id, x.menu_item_id, x.name, x.emoji, x.category, x.qty,
               x.unit_price, x.unit_cost, x.qty * x.unit_price, x.qty * x.unit_cost
        FROM ins CROSS JOIN jsonb_to_recordset(${JSON.stringify(lines)}::jsonb) AS x(
          menu_item_id uuid, name text, emoji text, category text,
          qty int, unit_price int, unit_cost int
        )
      `;
      sales++;
    }
  }

  /* Recurring overheads + one weekly override, so the costing modes have
     something to demonstrate. */
  const firstDay = new Date(today);
  firstDay.setDate(firstDay.getDate() - DAYS);
  const from = firstDay.toISOString().slice(0, 10);
  const admin = staff[0].id;

  const overheads = [
    { label: "Rent", category: "rent", amount: 45000, scope: "monthly" },
    {
      label: "Staff salary",
      category: "salary",
      amount: 62000,
      scope: "monthly",
    },
    {
      label: "Electricity & water",
      category: "utilities",
      amount: 3200,
      scope: "weekly",
    },
    {
      label: "Cooking gas",
      category: "utilities",
      amount: 900,
      scope: "weekly",
    },
    {
      label: "Charcoal & sundries",
      category: "supplies",
      amount: 250,
      scope: "daily",
    },
  ];

  for (const e of overheads) {
    await sql`
      INSERT INTO expenses (client_id, module, scope, label, category, amount_cents,
                            effective_date, replaces_item_costs, created_by_id, note)
      VALUES (${`${DEMO_TAG}-exp-${e.label}`}, 'restaurant', ${e.scope}, ${e.label},
              ${e.category}, ${e.amount * 100}, ${from}::date, false, ${admin}::uuid,
              'Sample data from seeding')
      ON CONFLICT (client_id) DO NOTHING
    `;
  }

  console.log(`  sample sales     : ${sales}`);
  console.log(`  sample expenses  : ${overheads.length}`);
  console.log("  Remove them any time with: npm run seed -- --wipe-demo");
}

async function wipeDemoData() {
  console.log("Removing sample data...");
  const sales = (await sql`
    DELETE FROM sales WHERE client_id LIKE ${DEMO_TAG + "%"} RETURNING 1
  `) as unknown[];
  const exp = (await sql`
    DELETE FROM expenses WHERE client_id LIKE ${DEMO_TAG + "%"} RETURNING 1
  `) as unknown[];
  console.log(`  sales removed    : ${sales.length}`);
  console.log(`  expenses removed : ${exp.length}`);
  console.log("Real data was left untouched.");
}

main().catch((err) => {
  console.error("\nSeed failed:", err);
  process.exit(1);
});
