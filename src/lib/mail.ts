import "server-only";

/**
 * Transactional email, used only for password resets.
 *
 * Resend's free tier (3,000/month) is far more than a family restaurant will
 * ever need for this. If it is not configured the caller is told explicitly
 * rather than the email silently vanishing - an admin locked out of their own
 * numbers should never be left guessing whether a link is coming.
 */

export type MailResult = { ok: boolean; error?: string };

export const isMailConfigured = () =>
  Boolean(process.env.RESEND_API_KEY && process.env.DIGEST_EMAIL_FROM);

export async function sendMail({
  to,
  subject,
  html,
  text,
}: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<MailResult> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.DIGEST_EMAIL_FROM;

  if (!key || !from) {
    return { ok: false, error: "Email is not set up on the server (RESEND_API_KEY / DIGEST_EMAIL_FROM)." };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject, html, text }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { ok: false, error: `Resend ${res.status}: ${detail.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "network error" };
  }
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The reset email. Deliberately plain: one sentence, one button, one warning. */
export function resetEmail({
  name,
  url,
  businessName,
  minutes,
}: {
  name: string;
  url: string;
  businessName: string;
  minutes: number;
}) {
  const html = `
<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1c1917">
  <h1 style="font-size:19px;margin:0 0 16px">${esc(businessName)}</h1>
  <p style="font-size:15px;line-height:1.6;margin:0 0 20px">
    Hello ${esc(name)}, somebody asked to reset the password for your admin account.
  </p>
  <p style="margin:0 0 24px">
    <a href="${esc(url)}"
       style="display:inline-block;background:#d97706;color:#fff;text-decoration:none;
              padding:12px 22px;border-radius:12px;font-weight:600;font-size:15px">
      Choose a new password
    </a>
  </p>
  <p style="font-size:13px;line-height:1.6;color:#57534e;margin:0 0 8px">
    This link works once and expires in ${minutes} minutes.
  </p>
  <p style="font-size:13px;line-height:1.6;color:#57534e;margin:0">
    If this was not you, ignore this email - your password has not changed.
  </p>
  <p style="font-size:12px;color:#8c857c;margin:24px 0 0;word-break:break-all">${esc(url)}</p>
</div>`.trim();

  const text = [
    `${businessName}`,
    "",
    `Hello ${name}, somebody asked to reset the password for your admin account.`,
    "",
    `Choose a new password: ${url}`,
    "",
    `This link works once and expires in ${minutes} minutes.`,
    "If this was not you, ignore this email - your password has not changed.",
  ].join("\n");

  return { html, text };
}
