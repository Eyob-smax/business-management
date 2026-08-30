/**
 * Recovery hatch for a forgotten sign-in code.
 *
 *   npm run reset-admin -- Admin           -> prints a fresh random code
 *   npm run reset-admin -- Admin 482913    -> sets that exact code
 *   npm run reset-admin -- --list          -> shows who has an account
 *
 * The new code is marked "must change", so the person is asked to pick their
 * own the moment they sign in.
 */
import { neon } from "@neondatabase/serverless";
import { hashPassword, randomCode, validatePassword } from "../src/lib/password";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL missing.");
const sql = neon(url);

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--");

  if (!args.length || args[0] === "--list") {
    const rows = (await sql`
      SELECT name, role, access_level, must_change_password
      FROM users ORDER BY role, name
    `) as {
      name: string;
      role: string;
      access_level: string;
      must_change_password: boolean;
    }[];
    console.log("\nAccounts:");
    for (const r of rows) {
      const flags = [
        r.access_level === "full"
          ? "full access"
          : r.access_level === "read_only"
            ? "READ ONLY"
            : "NO ACCESS",
        r.must_change_password ? "must change code" : "",
      ]
        .filter(Boolean)
        .join(", ");
      console.log(`  ${r.role.padEnd(5)}  ${r.name.padEnd(14)} ${flags}`);
    }
    console.log("\nUsage: npm run reset-admin -- <name> [6-digit code]\n");
    return;
  }

  const name = args[0];
  const explicit = args[1];

  if (explicit) {
    const problem = validatePassword(explicit);
    if (problem) throw new Error(problem);
  }
  const code = explicit || randomCode();
  const hash = await hashPassword(code);

  const rows = (await sql`
    UPDATE users
    SET password_hash = ${hash},
        must_change_password = true,
        -- A code reset is also the recovery path for a locked-out admin, so it
        -- restores access as well as the code.
        access_level = 'full' 
    WHERE handle = ${name.trim().toLowerCase()}
    RETURNING name, role
  `) as { name: string; role: string }[];

  if (!rows.length) {
    console.error(`No account named "${name}". Run with --list to see the names.`);
    process.exit(1);
  }

  console.log(`\n  ${rows[0].name} (${rows[0].role}) can now sign in with code: ${code}`);
  console.log("  They will be asked to choose a new one.\n");
}

main().catch((err) => {
  console.error("\nFailed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
