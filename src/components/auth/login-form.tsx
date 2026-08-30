"use client";
/**
 * One form, two kinds of secret.
 *
 * Staff type a 6-digit code into the boxes; admins type a real password. The
 * server does not care which - it verifies whatever was typed against the
 * stored hash - so the toggle here is purely about giving each person the
 * right keyboard. It deliberately does NOT ask the server which kind a name
 * uses, because that would turn the form into a way to discover which names
 * are admins.
 */
import * as React from "react";
import { useActionState } from "react";
import { Link } from "@/i18n/routing";
import { useTranslations } from "next-intl";
import { KeyRound, LogIn, TriangleAlert } from "lucide-react";
import { login, type FormState } from "@/app/actions/auth";
import { Button, Field, Input } from "@/components/ui/primitives";
import { CodeInput } from "@/components/ui/code-input";

const LAST_NAME_KEY = "bm-last-name";
const LAST_MODE_KEY = "bm-last-mode";

export function LoginForm() {
  const t = useTranslations("LoginPage");
  const [state, action, pending] = useActionState<FormState, FormData>(login, null);
  const [name, setName] = React.useState("");
  const [code, setCode] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [mode, setMode] = React.useState<"code" | "password">("code");
  const formRef = React.useRef<HTMLFormElement>(null);

  // The phone belongs to one person, so remembering both is a convenience,
  // not a disclosure.
  React.useEffect(() => {
    const savedName = localStorage.getItem(LAST_NAME_KEY);
    if (savedName) setName(savedName);
    if (localStorage.getItem(LAST_MODE_KEY) === "password") setMode("password");
  }, []);

  React.useEffect(() => {
    if (state?.error) {
      setCode("");
      setPassword("");
    }
  }, [state?.error]);

  const ready = name.trim().length > 0 && (mode === "code" ? code.length === 6 : password.length > 0);

  return (
    <form
      ref={formRef}
      action={action}
      onSubmit={() => {
        localStorage.setItem(LAST_NAME_KEY, name);
        localStorage.setItem(LAST_MODE_KEY, mode);
      }}
      className="space-y-5"
    >
      <Field label={t("yourName")}>
        <Input
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("namePlaceholder")}
          autoComplete="username"
          autoCapitalize="words"
          enterKeyHint="next"
          required
          disabled={pending}
        />
      </Field>

      {mode === "code" ? (
        <>
          {/* The hidden field carries whichever secret is in use, so the server
              action sees one consistent field name. */}
          <CodeInput
            name="code"
            label={t("yourCode")}
            value={code}
            onChange={setCode}
            disabled={pending}
            invalid={Boolean(state?.error)}
            autoFocus={Boolean(name)}
            onComplete={() => {
              if (name.trim()) formRef.current?.requestSubmit();
            }}
          />
          <button
            type="button"
            onClick={() => setMode("password")}
            className="text-[12.5px] font-semibold text-brand underline-offset-4 hover:underline"
          >
            {t("usePasswordInstead")}
          </button>
        </>
      ) : (
        <>
          <Field label={t("yourPassword")}>
            <Input
              name="code"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              enterKeyHint="go"
              required
              disabled={pending}
              autoFocus={Boolean(name)}
            />
          </Field>
          <button
            type="button"
            onClick={() => setMode("code")}
            className="text-[12.5px] font-semibold text-brand underline-offset-4 hover:underline"
          >
            {t("useCodeInstead")}
          </button>
        </>
      )}

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
        icon={mode === "code" ? <LogIn className="size-4" /> : <KeyRound className="size-4" />}
        disabled={!ready}
      >
        {pending ? t("signingIn") : t("signIn")}
      </Button>

      <div className="space-y-1.5 text-center">
        <Link
          href="/forgot"
          className="block text-[12.5px] font-semibold text-brand underline-offset-4 hover:underline"
        >
          {t("forgotPassword")}
        </Link>
        <p className="text-[12.5px] leading-relaxed text-ink-3">
          {t("forgotCodeStart")}
          <span className="font-medium text-ink-2">{t("forgotCodeTeam")}</span>
          {t("forgotCodeEnd")}
        </p>
      </div>
    </form>
  );
}
