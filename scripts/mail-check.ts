/**
 * Checks the SMTP settings in .env.local.
 *
 *   npm run mail:check                    -> connect and authenticate only
 *   npm run mail:check -- you@example.com -> also send a real test message
 *
 * Worth running before trusting the reset flow: a wrong app password or a
 * blocked port fails here in two seconds instead of at the moment somebody is
 * locked out of their own account.
 */
import { isMailConfigured, missingMailConfig, sendMail, verifyMail } from "../src/lib/smtp";

async function main() {
  const to = process.argv.slice(2).find((a) => a.includes("@"));

  console.log("\n  Host   :", process.env.SMTP_HOST || "(not set)");
  console.log("  Port   :", process.env.SMTP_PORT || "587 (default)");
  console.log("  User   :", process.env.SMTP_USER || "(not set)");
  console.log("  From   :", process.env.MAIL_FROM || process.env.SMTP_USER || "(not set)");
  console.log("  Secret :", process.env.SMTP_PASS ? "set" : "(not set)");

  if (!isMailConfigured()) {
    console.error(`\n  Not configured. Missing: ${missingMailConfig().join(", ")}\n`);
    process.exit(1);
  }

  console.log("\n  Connecting...");
  const verified = await verifyMail();
  if (!verified.ok) {
    console.error(`  FAILED: ${verified.error}`);
    console.error("\n  With Gmail this usually means an App Password is needed,");
    console.error("  not the normal account password.\n");
    process.exit(1);
  }
  console.log("  Connected and authenticated.");

  if (!to) {
    console.log("\n  Pass an address to send a real test:");
    console.log("    npm run mail:check -- you@example.com\n");
    return;
  }

  console.log(`\n  Sending a test message to ${to}...`);
  const sent = await sendMail({
    to,
    subject: "Business Manager - email is working",
    html: "<p>This is a test from Business Manager. Password reset links will arrive this way.</p>",
    text: "This is a test from Business Manager. Password reset links will arrive this way.",
  });

  if (!sent.ok) {
    console.error(`  FAILED: ${sent.error}\n`);
    process.exit(1);
  }
  console.log("  Sent. Check the inbox, and the spam folder.\n");
}

main().catch((err) => {
  console.error("\nFailed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
