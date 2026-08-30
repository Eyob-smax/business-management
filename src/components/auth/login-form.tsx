"use client";
import * as React from "react";
import { useActionState } from "react";
import { LogIn, TriangleAlert } from "lucide-react";
import { login, type FormState } from "@/app/actions/auth";
import { Button, Field, Input } from "@/components/ui/primitives";
import { CodeInput } from "@/components/ui/code-input";
import { useTranslations } from 'next-intl';

const LAST_NAME_KEY = "bm-last-name";

export function LoginForm() {
  const t = useTranslations('LoginPage');
  const [state, action, pending] = useActionState<FormState, FormData>(login, null);
  const [name, setName] = React.useState("");
  const [code, setCode] = React.useState("");
  const formRef = React.useRef<HTMLFormElement>(null);

  // Remember the name on this device only - the phone belongs to one person.
  React.useEffect(() => {
    const saved = localStorage.getItem(LAST_NAME_KEY);
    if (saved) setName(saved);
  }, []);

  React.useEffect(() => {
    if (state?.error) setCode("");
  }, [state?.error]);

  return (
    <form
      ref={formRef}
      action={action}
      onSubmit={() => localStorage.setItem(LAST_NAME_KEY, name)}
      className="space-y-5"
    >
      <Field label={t('yourName')}>
        <Input
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('namePlaceholder')}
          autoComplete="username"
          autoCapitalize="words"
          enterKeyHint="next"
          required
          disabled={pending}
        />
      </Field>

      <CodeInput
        name="code"
        label={t('yourCode')}
        value={code}
        onChange={setCode}
        disabled={pending}
        invalid={Boolean(state?.error)}
        autoFocus={Boolean(name)}
        onComplete={() => {
          if (name.trim()) formRef.current?.requestSubmit();
        }}
      />

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
        icon={<LogIn className="size-4" />}
        disabled={!name.trim() || code.length < 6}
      >
        {pending ? t('signingIn') : t('signIn')}
      </Button>

      <p className="text-center text-[12.5px] leading-relaxed text-ink-3">
        {t('forgotCodeStart')}
        <span className="font-medium text-ink-2"> {t('forgotCodeTeam')} </span>
        {t('forgotCodeEnd')}
      </p>
    </form>
  );
}
