"use client";
import * as React from "react";
import { useTranslations } from "next-intl";
import { useActionState } from "react";
import Link from "next/link";
import { KeyRound, TriangleAlert } from "lucide-react";
import { changeCode, type FormState } from "@/app/actions/auth";
import { Button } from "@/components/ui/primitives";
import { CodeInput } from "@/components/ui/code-input";

export function ChangeCodeForm({
  forced,
  role,
}: {
  forced: boolean;
  role: "admin" | "staff";
}) {
  const t = useTranslations("ChangeCode");
  const c = useTranslations("Common");
  const [state, action, pending] = useActionState<FormState, FormData>(changeCode, null);
  const [current, setCurrent] = React.useState("");
  const [next, setNext] = React.useState("");
  const [confirm, setConfirm] = React.useState("");

  const mismatch = confirm.length === 6 && next !== confirm;
  const ready = current.length === 6 && next.length === 6 && confirm.length === 6 && !mismatch;

  return (
    <form action={action} className="space-y-5">
      <CodeInput
        name="current"
        label={forced ? t("given") : t("current")}
        value={current}
        onChange={setCurrent}
        autoFocus
        disabled={pending}
      />
      <CodeInput
        name="next"
        label={t("newCode")}
        value={next}
        onChange={setNext}
        disabled={pending}
      />
      <CodeInput
        name="confirm"
        label={t("newCodeAgain")}
        value={confirm}
        onChange={setConfirm}
        disabled={pending}
        invalid={mismatch}
      />

      {mismatch ? (
        <p className="text-[12.5px] font-medium text-loss">{t("mismatch")}</p>
      ) : null}

      {state?.error ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-[14px] bg-loss-soft px-3.5 py-3 text-[13px] font-medium text-loss"
        >
          <TriangleAlert className="mt-px size-4 shrink-0" />
          {state.error}
        </p>
      ) : null}

      <Button
        type="submit"
        variant="primary"
        size="lg"
        block
        loading={pending}
        disabled={!ready}
        icon={<KeyRound className="size-4" />}
      >
        {t("saveCode")}
      </Button>

      {!forced ? (
        <Link
          href={role === "admin" ? "/admin" : "/staff"}
          className="block text-center text-[13px] font-medium text-ink-3 underline-offset-4 hover:underline"
        >
          {c("cancel")}
        </Link>
      ) : (
        <p className="text-center text-[12px] leading-relaxed text-ink-3">
          {t("hint")}
        </p>
      )}
    </form>
  );
}
