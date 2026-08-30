/**
 * One-time migration: users.is_active (boolean) -> users.access_level (enum).
 *
 *   npx tsx --env-file=.env.local scripts/migrate-access.ts
 *
 * Safe to run more than once. Ordering matters and is why this is a script
 * rather than a `db:push`: the old column has to be read to fill the new one
 * before it can be dropped, and push gives no control over that.
 */
import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL missing.");
const sql = neon(url);

async function main() {
  console.log("Migrating user access...\n");

  // 1. The enum type.
  await sql`
    DO $$ BEGIN
      CREATE TYPE access_level AS ENUM ('full', 'read_only', 'blocked');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$
  `;
  console.log("  access_level type ready");

  // 2. The new column, defaulting everyone to full access.
  await sql`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS access_level access_level NOT NULL DEFAULT 'full'
  `;
  console.log("  users.access_level added");

  // 3. Carry the old flag across, if it is still there.
  const hasOld = (await sql`
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'is_active'
  `) as unknown[];

  if (hasOld.length) {
    const moved = (await sql`
      UPDATE users SET access_level = 'blocked'
      WHERE is_active = false AND access_level = 'full'
      RETURNING 1
    `) as unknown[];
    console.log(`  ${moved.length} switched-off account(s) carried over as 'blocked'`);

    await sql`ALTER TABLE users DROP COLUMN is_active`;
    console.log("  users.is_active dropped");
  } else {
    console.log("  users.is_active already gone - nothing to carry over");
  }

  const summary = (await sql`
    SELECT access_level, role, count(*)::int AS n
    FROM users GROUP BY access_level, role ORDER BY role, access_level
  `) as { access_level: string; role: string; n: number }[];

  console.log("\n  Current accounts:");
  for (const r of summary) {
    console.log(`    ${r.role.padEnd(5)}  ${r.access_level.padEnd(10)}  ${r.n}`);
  }
  console.log("\nDone.");
}

main().catch((err) => {
  console.error("\nMigration failed:", err);
  process.exit(1);
});
