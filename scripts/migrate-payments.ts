/**
 * One-time migration: sales.payment_method from a Postgres enum to text.
 *
 *   npx tsx --env-file=.env.local scripts/migrate-payments.ts
 *
 * The enum could only hold the five values it was created with, so recording a
 * payment through Awash Bank or M-Pesa needed a schema change. Text plus the
 * validated catalog in src/lib/payments.ts means adding a bank is one line of
 * code and no migration at all.
 *
 * Safe to run more than once. Existing values ("cash", "telebirr", ...) already
 * match catalog ids, so nothing needs rewriting.
 */
import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL missing.");
const sql = neon(url);

async function main() {
  const [col] = (await sql`
    SELECT data_type, udt_name FROM information_schema.columns
    WHERE table_name = 'sales' AND column_name = 'payment_method'
  `) as { data_type: string; udt_name: string }[];

  if (!col) throw new Error("sales.payment_method not found.");

  if (col.data_type === "text") {
    console.log("\n  Already text - nothing to do.\n");
  } else {
    console.log(`\n  Converting from ${col.udt_name} to text...`);
    await sql`
      ALTER TABLE sales
      ALTER COLUMN payment_method TYPE text
      USING payment_method::text
    `;
    await sql`ALTER TABLE sales ALTER COLUMN payment_method SET DEFAULT 'cash'`;
    console.log("  Done.");
  }

  // The old enum type lingers once nothing references it.
  await sql`DROP TYPE IF EXISTS payment_method`.catch(() => {});

  const rows = (await sql`
    SELECT payment_method, count(*)::int AS n
    FROM sales GROUP BY payment_method ORDER BY n DESC
  `) as { payment_method: string; n: number }[];

  console.log("\n  Recorded payment methods:");
  for (const r of rows) console.log(`    ${r.payment_method.padEnd(16)} ${r.n}`);
  console.log("");
}

main().catch((err) => {
  console.error("\nMigration failed:", err);
  process.exit(1);
});
