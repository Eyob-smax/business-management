import nodemailer, { type Transporter } from "nodemailer";

/**
 * SMTP transport, over nodemailer.
 *
 * Deliberately free of any Next.js import - including `server-only` - so the
 * `npm run mail:check` CLI can exercise exactly the same code path the app
 * uses, rather than a second copy that can drift out of step.
 *
 * Used for two things: password reset links, and the nightly summary when the
 * email channel is switched on.
 *
 * SMTP rather than a hosted API because it works with whatever the family
 * already has - a Gmail account with an app password, the mailbox that came
 * with their domain, or a provider's relay - without another signup or a
 * per-message bill.
 *
 *   SMTP_HOST      e.g. smtp.gmail.com
 *   SMTP_PORT      587 for STARTTLS (usual), 465 for implicit TLS
 *   SMTP_USER      the mailbox
 *   SMTP_PASS      an app password, NOT the account password
 *   MAIL_FROM      e.g. "ልዑል ማዕድ <reports@example.com>"; defaults to SMTP_USER
 *
 * If nothing is configured the caller is told explicitly rather than the email
 * silently vanishing - an admin locked out of their own numbers should never
 * be left guessing whether a link is coming.
 */

export type MailResult = { ok: boolean; error?: string };

function config() {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS;
  const port = Number(process.env.SMTP_PORT ?? 587);
  // Port 465 is implicit TLS; everything else starts plain and upgrades.
  const secure = process.env.SMTP_SECURE
    ? process.env.SMTP_SECURE === "true"
    : port === 465;
  const from =
    process.env.MAIL_FROM?.trim() || process.env.DIGEST_EMAIL_FROM?.trim() || user;

  return { host, port, secure, user, pass, from };
}

export function isMailConfigured(): boolean {
  const c = config();
  return Boolean(c.host && c.user && c.pass && c.from);
}

/** What is missing, so Settings can name the exact variable to set. */
export function missingMailConfig(): string[] {
  const c = config();
  const missing: string[] = [];
  if (!c.host) missing.push("SMTP_HOST");
  if (!c.user) missing.push("SMTP_USER");
  if (!c.pass) missing.push("SMTP_PASS");
  if (!c.from) missing.push("MAIL_FROM");
  return missing;
}

/**
 * One transporter per process. On a serverless host this is per warm instance,
 * which is exactly the reuse we want: a cold start pays the handshake, a warm
 * one does not.
 */
let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (transporter) return transporter;

  const c = config();
  if (!c.host || !c.user || !c.pass) return null;

  transporter = nodemailer.createTransport({
    host: c.host,
    port: c.port,
    secure: c.secure,
    auth: { user: c.user, pass: c.pass },
    // A hung SMTP dial-up must not hold a request open indefinitely.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });

  return transporter;
}

export async function sendMail({
  to,
  subject,
  html,
  text,
}: {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
}): Promise<MailResult> {
  const c = config();
  const tx = getTransporter();

  if (!tx || !c.from) {
    return {
      ok: false,
      error: `Email is not set up on the server (${missingMailConfig().join(", ")}).`,
    };
  }

  try {
    await tx.sendMail({
      from: c.from,
      to: Array.isArray(to) ? to.join(", ") : to,
      subject,
      text,
      html,
    });
    return { ok: true };
  } catch (err) {
    // A bad password or a blocked port surfaces here; pass the reason through
    // so Settings can show something actionable.
    return { ok: false, error: err instanceof Error ? err.message.slice(0, 300) : "send failed" };
  }
}

/** Proves the credentials work without sending anything. */
export async function verifyMail(): Promise<MailResult> {
  const tx = getTransporter();
  if (!tx) {
    return { ok: false, error: `Not configured (${missingMailConfig().join(", ")}).` };
  }
  try {
    await tx.verify();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message.slice(0, 300) : "verify failed" };
  }
}

