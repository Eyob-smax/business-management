import "server-only";

/**
 * Outgoing email: password reset links, and the nightly summary when the email
 * channel is switched on.
 *
 * The transport lives in ./smtp so the mail:check script can reuse it without
 * dragging in server-only. This module adds the server guard and the templates.
 */
export {
  isMailConfigured,
  missingMailConfig,
  sendMail,
  verifyMail,
  type MailResult,
} from "./smtp";

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
