"use client";
/**
 * Your own profile: name, picture, admin email, and your code or password.
 *
 * Two separate forms on purpose. Changing your name should not require typing
 * your password, and changing your password should not risk saving a
 * half-edited name.
 */
import * as React from "react";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { AtSign, KeyRound, Save, ShieldCheck, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { changeSecret, updateProfile } from "@/app/actions/profile";
import type { ActionResult } from "@/app/actions/_result";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Field,
  Input,
} from "@/components/ui/primitives";
import { CodeInput } from "@/components/ui/code-input";
import { useToast } from "@/components/ui/toast";

/** A wide set so everyone can find a face or a thing that feels like them. */
export const AVATAR_CHOICES = [
  "\u{1F464}", "\u{1F467}", "\u{1F466}", "\u{1F469}", "\u{1F468}", "\u{1F475}", "\u{1F474}",
  "\u{1F9D1}", "\u{1F471}", "\u{1F473}", "\u{1F472}", "\u{1F9D5}", "\u{1F470}", "\u{1F934}",
  "\u{1F935}", "\u{1F936}", "\u{1F454}", "\u{1F4CB}", "\u{1F373}", "\u{1F35B}", "\u{1F958}",
  "\u{2615}", "\u{1F37D}", "\u{1F374}", "\u{1F52A}", "\u{1F9C2}", "\u{1F4B0}", "\u{1F4B5}",
  "\u{1F31F}", "\u{2B50}", "\u{1F338}", "\u{1F33B}", "\u{1F339}", "\u{1F340}", "\u{1F332}",
  "\u{1F981}", "\u{1F98B}", "\u{1F426}", "\u{1F41D}", "\u{1F433}", "\u{1F41F}", "\u{1F308}",
  "\u{2600}", "\u{1F319}", "\u{26A1}", "\u{1F525}", "\u{1F4A7}", "\u{1F3C6}", "\u{1F3AF}",
  "\u{1F3B5}", "\u{1F4DA}", "\u{1F5DD}", "\u{1F680}",
];

export function ProfileForm({
  user,
}: {
  user: {
    id: string;
    name: string;
    avatar: string;
    email: string | null;
    role: "admin" | "staff";
    mustChangePassword: boolean;
  };
}) {
  const { toast } = useToast();
  const c = useTranslations("Common");
  const isAdmin = user.role === "admin";

  const [profileState, profileAction, profilePending] = useActionState<
    ActionResult | null,
    FormData
  >(updateProfile, null);
  const [secretState, secretAction, secretPending] = useActionState<ActionResult | null, FormData>(
    changeSecret,
    null,
  );

  const [avatar, setAvatar] = React.useState(user.avatar);

  // Staff type a 6-digit code; admins type a real password.
  const [current, setCurrent] = React.useState("");
  const [next, setNext] = React.useState("");
  const [confirm, setConfirm] = React.useState("");

  React.useEffect(() => {
    if (!profileState) return;
    toast(
      profileState.ok
        ? { tone: "success", title: profileState.message ?? "Saved" }
        : { tone: "error", title: profileState.error ?? "Could not save", duration: 7000 },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileState]);

  React.useEffect(() => {
    if (!secretState) return;
    toast(
      secretState.ok
        ? { tone: "success", title: secretState.message ?? "Saved" }
        : { tone: "error", title: secretState.error ?? "Could not save", duration: 7000 },
    );
    if (secretState?.ok) {
      setCurrent("");
      setNext("");
      setConfirm("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secretState]);

  const mismatch = confirm.length > 0 && next !== confirm;
  const secretReady = isAdmin
    ? current.length > 0 && next.length >= 8 && confirm.length > 0 && !mismatch
    : current.length === 6 && next.length === 6 && confirm.length === 6 && !mismatch;

  return (
    <div className="space-y-4">
      {/* ---- who you are ---- */}
      <Card className="pb-4">
        <CardHeader title="You" subtitle="How your name appears on every sale you record" />

        <form action={profileAction} className="space-y-4 px-4 pt-3">
          <input type="hidden" name="avatar" value={avatar} />

          <Field label="Name" required hint="This is also what you type to sign in.">
            <Input name="name" defaultValue={user.name} required maxLength={40} />
          </Field>

          <div>
            <span className="mb-1.5 block text-[13px] font-semibold text-ink-2">Picture</span>
            <div className="grid grid-cols-8 gap-1.5 sm:grid-cols-10">
              {AVATAR_CHOICES.map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setAvatar(a)}
                  aria-label={`Use ${a}`}
                  className={cn(
                    "flex aspect-square items-center justify-center rounded-[10px] border text-[19px] transition active:scale-95",
                    avatar === a ? "border-brand bg-brand-soft" : "border-line bg-surface",
                  )}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>

          {isAdmin ? (
            <Field
              label="Email"
              hint="Only used to send you a reset link if you forget your password. Admins only."
            >
              <Input
                name="email"
                type="email"
                defaultValue={user.email ?? ""}
                placeholder="you@example.com"
                autoComplete="email"
                inputMode="email"
              />
            </Field>
          ) : null}

          <Button
            type="submit"
            variant="primary"
            size="lg"
            block
            loading={profilePending}
            icon={<Save className="size-4" />}
          >
            {c("save")}
          </Button>
        </form>
      </Card>

      {/* ---- your secret ---- */}
      <Card className="pb-4">
        <CardHeader
          icon={<KeyRound className="size-4" />}
          title={isAdmin ? "Your password" : "Your code"}
          subtitle={
            isAdmin
              ? "At least 8 characters, with a letter and a number"
              : "Six digits, typed every time you sign in"
          }
          action={
            user.mustChangePassword ? <Badge tone="warn">not changed yet</Badge> : undefined
          }
        />

        <form action={secretAction} className="space-y-4 px-4 pt-3">
          {isAdmin ? (
            <>
              <input type="hidden" name="current" value={current} />
              <input type="hidden" name="next" value={next} />
              <input type="hidden" name="confirm" value={confirm} />

              <Field label="Current password">
                <Input
                  type="password"
                  value={current}
                  onChange={(e) => setCurrent(e.target.value)}
                  autoComplete="current-password"
                />
              </Field>
              <Field label="New password">
                <Input
                  type="password"
                  value={next}
                  onChange={(e) => setNext(e.target.value)}
                  autoComplete="new-password"
                />
              </Field>
              <Field label="New password again" error={mismatch ? "These do not match." : null}>
                <Input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                />
              </Field>
            </>
          ) : (
            <>
              <CodeInput
                name="current"
                label="Current code"
                value={current}
                onChange={setCurrent}
              />
              <CodeInput name="next" label="New code" value={next} onChange={setNext} />
              <CodeInput
                name="confirm"
                label="New code again"
                value={confirm}
                onChange={setConfirm}
                invalid={mismatch}
              />
              {mismatch ? (
                <p className="text-[12.5px] font-medium text-loss">These do not match.</p>
              ) : null}
            </>
          )}

          <Button
            type="submit"
            variant="primary"
            size="lg"
            block
            loading={secretPending}
            disabled={!secretReady}
            icon={<KeyRound className="size-4" />}
          >
            {isAdmin ? "Change password" : "Change code"}
          </Button>
        </form>
      </Card>

      {isAdmin && !user.email ? (
        <Card className="flex items-start gap-2.5 border-warn/30 bg-warn-soft p-4">
          <TriangleAlert className="mt-px size-4 shrink-0 text-warn" />
          <p className="text-[12.5px] leading-relaxed text-warn">
            You have not added an email yet. Without one there is no way to reset your own
            password if you forget it - you would need the other admin to do it for you.
          </p>
        </Card>
      ) : null}

      {isAdmin && user.email ? (
        <p className="flex items-start gap-2 px-1 pb-2 text-[11.5px] leading-relaxed text-ink-3">
          <ShieldCheck className="mt-px size-3.5 shrink-0" />
          <span>
            <AtSign className="mr-0.5 inline size-3" />
            Reset links go to <strong className="text-ink-2">{user.email}</strong> and expire
            after 45 minutes.
          </span>
        </p>
      ) : null}
    </div>
  );
}
