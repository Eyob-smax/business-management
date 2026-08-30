"use client";
/**
 * The two halves of password recovery: ask for a link, then use it.
 *
 * Both are admin-only in effect. Staff have no email and recover by asking an
 * admin to reset their code from Team, which the copy here says plainly rather
 * than leaving a waitress typing an address that will never match.
 */
import * as React from "react";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { ArrowLeft, CircleCheck, KeyRound, Mail, TriangleAlert } from "lucide-react";
import { requestPasswordReset, resetPassword } from "@/app/actions/profile";
import type { ActionResult } from "@/app/actions/_result";
import { Button, Field, Input } from "@/components/ui/primitives";

function Alert({ tone, children }: { tone: "error" | "success"; children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className={
        tone === "error"
          ? "flex items-start gap-2 rounded-[14px] bg-loss-soft px-3.5 py-3 text-[13px] leading-snug font-medium text-loss"
          : "flex items-start gap-2 rounded-[14px] bg-profit-soft px-3.5 py-3 text-[13px] leading-snug font-medium text-profit"
      }
    >
      {tone === "error" ? (
        <TriangleAlert className="mt-px size-4 shrink-0" />
      ) : (
        <CircleCheck className="mt-px size-4 shrink-0" />
      )}
      {children}
    </p>
  );
}

export function ForgotPasswordForm() {
  const t = useTranslations("Reset");
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(
    requestPasswordReset,
    null,
  );

  // On success the form is replaced entirely: re-submitting would only send a
  // second link and invalidate the first.
  if (state?.ok) {
    return (
      <div className="space-y-4">
        <Alert tone="success">{state.message}</Alert>
        <p className="text-[12.5px] leading-relaxed text-ink-3">
          {t("checkInbox")}
        </p>
        <Link href="/login" className="block">
          <Button variant="secondary" block icon={<ArrowLeft className="size-4" />}>
            {t("backToSignIn")}
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <Field
        label={t("adminEmail")}
        required
        hint={t("adminEmailHint")}
      >
        <Input
          name="email"
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          placeholder={t("emailPlaceholder")}
          data-autofocus
        />
      </Field>

      {state?.error ? <Alert tone="error">{state.error}</Alert> : null}

      <Button
        type="submit"
        variant="primary"
        size="lg"
        block
        loading={pending}
        icon={<Mail className="size-4" />}
      >
        {t("sendLink")}
      </Button>

      <p className="text-center text-[12.5px] leading-relaxed text-ink-3">
        {t.rich("staffNote", {
          team: (chunks) => <span className="font-medium text-ink-2">{chunks}</span>,
        })}
      </p>

      <Link
        href="/login"
        className="block text-center text-[13px] font-medium text-ink-3 underline-offset-4 hover:underline"
      >
        {t("backToSignIn")}
      </Link>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const t = useTranslations("Reset");
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(
    resetPassword,
    null,
  );
  const [next, setNext] = React.useState("");
  const [confirm, setConfirm] = React.useState("");

  const mismatch = confirm.length > 0 && next !== confirm;
  const ready = next.length >= 8 && confirm.length > 0 && !mismatch;

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />

      <Field label={t("newPassword")} required hint={t("newPasswordHint")}>
        <Input
          name="next"
          type="password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          autoComplete="new-password"
          required
          data-autofocus
        />
      </Field>

      <Field
        label={t("newPasswordAgain")}
        required
        error={mismatch ? t("doNotMatch") : null}
      >
        <Input
          name="confirm"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          required
        />
      </Field>

      {state?.error ? <Alert tone="error">{state.error}</Alert> : null}

      <Button
        type="submit"
        variant="primary"
        size="lg"
        block
        loading={pending}
        disabled={!ready}
        icon={<KeyRound className="size-4" />}
      >
        {t("setPassword")}
      </Button>
    </form>
  );
}
