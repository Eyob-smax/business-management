/**
 * Adds the non-fasting (የፍስክ) group and pairs it with fasting (ጾም).
 *
 *   npx tsx --env-file=.env.local scripts/add-fasting-categories.ts
 *
 * An Ethiopian menu splits first on fasting rather than on course, so these
 * two groups do most of the work of finding a dish during a rush.
 *
 * Only dishes that unambiguously contain meat are moved. Shiro, Misir, Gomen
 * and Beyaynetu are left where they are: whether they count as fasting depends
 * on how this kitchen makes them, and that is the owner's call, not a script's.
 */
import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL missing.");
const sql = neon(url);

/** Dishes that always contain meat. */
const MEAT_DISHES = [
  "doro wat", "key wat", "tibs", "kitfo", "tere siga", "dulet", "firfir",
];

async function main() {
  console.log("\nOrganising the menu by fasting...\n");

  const [existing] = (await sql`
    SELECT id::text FROM categories
    WHERE module = 'restaurant' AND name ILIKE '%fisk%' OR name ILIKE '%non-fasting%'
    LIMIT 1
  `) as { id: string }[];

  let nonFastingId: string;
  if (existing) {
    nonFastingId = existing.id;
    console.log("  Non-fasting group already exists.");
  } else {
    const [row] = (await sql`
      INSERT INTO categories (module, name, emoji, color, sort_order)
      VALUES ('restaurant', 'Non-fasting (የፍስክ)', '🍖', 'rose', 10)
      RETURNING id::text
    `) as { id: string }[];
    nonFastingId = row.id;
    console.log("  Added: 🍖 Non-fasting (የፍስክ)");
  }

  // Name the existing fasting group the same way, so the pair reads together
  // in both languages.
  const renamed = (await sql`
    UPDATE categories SET name = 'Fasting (ጾም)', emoji = '🌿'
    WHERE module = 'restaurant' AND name = 'Fasting'
    RETURNING 1
  `) as unknown[];
  if (renamed.length) console.log("  Renamed: Fasting -> Fasting (ጾም)");

  // A sensible reading order: mains, then the fasting split, then the rest.
  const order: [string, number][] = [
    ["Main dishes", 0],
    ["Non-fasting (የፍስክ)", 10],
    ["Fasting (ጾም)", 20],
    ["Fast food", 30],
    ["Hot drinks", 40],
    ["Cold drinks", 50],
  ];
  for (const [name, sort] of order) {
    await sql`
      UPDATE categories SET sort_order = ${sort}
      WHERE module = 'restaurant' AND name = ${name}
    `;
  }

  const moved = (await sql`
    UPDATE menu_items
    SET category_id = ${nonFastingId}::uuid, updated_at = now()
    WHERE module = 'restaurant'
      AND archived_at IS NULL
      AND lower(name) = ANY(${MEAT_DISHES})
      AND (category_id IS DISTINCT FROM ${nonFastingId}::uuid)
    RETURNING name
  `) as { name: string }[];

  console.log(
    moved.length
      ? `\n  Moved into Non-fasting: ${moved.map((m) => m.name).join(", ")}`
      : "\n  No dishes needed moving.",
  );

  const cats = (await sql`
    SELECT c.name, c.emoji,
           (SELECT count(*)::int FROM menu_items m
             WHERE m.category_id = c.id AND m.archived_at IS NULL) AS n
    FROM categories c
    WHERE c.module = 'restaurant' AND c.archived_at IS NULL
    ORDER BY c.sort_order
  `) as { name: string; emoji: string; n: number }[];

  console.log("\n  Menu groups now:");
  for (const c of cats) console.log(`    ${c.emoji} ${c.name} (${c.n})`);
  console.log("\n  Anything else can be moved from Menu in the app.\n");
}

main().catch((err) => {
  console.error("\nFailed:", err);
  process.exit(1);
});
