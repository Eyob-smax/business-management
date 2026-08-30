"use client";
/**
 * Team management.
 *
 * Admins own the staff list entirely: add somebody, change what they can do,
 * reset a forgotten code, or delete the account.
 *
 * Access has three levels rather than an on/off switch, because "off" is too
 * blunt for a family business - see lib/access.ts. The picker spells out what
 * each level means in the words an owner would use, since getting it wrong
 * either strands a waitress mid-shift or leaves a departed employee able to
 * record sales.
 *
 * A generated sign-in code is shown exactly once, in a dialog the admin has to
 * dismiss - it is never stored in readable form, so no screen can leak it later.
 */
import * as React from "react";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/routing";
import {
  Bell,
  Copy,
  Eye,
  KeyRound,
  Lock,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  Unlock,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/money";
import { relativeTime } from "@/lib/dates";
import type { TeamMember } from "@/lib/team";
import { ACCESS, ACCESS_LEVELS, type AccessLevel } from "@/lib/access";
import {
  deleteUser,
  resetUserCode,
  saveUser,
  setUserAccess,
  setUserCode,
  type UserActionResult,
} from "@/app/actions/users";
import {
  Avatar,
  Badge,
  Button,
  Card,
  Field,
  IconButton,
  Input,
  Segmented,
} from "@/components/ui/primitives";
import { CodeInput } from "@/components/ui/code-input";
import { ConfirmDialog, Sheet } from "@/components/ui/overlay";
import { useToast } from "@/components/ui/toast";

import { AVATAR_CHOICES as AVATARS } from "@/components/auth/profile-form";

/**
 * lib/access.ts owns the policy; the words for each level live in the catalog
 * so they can be read in Amharic. Keyed by level id, not by English label.
 */
function useAccessWords() {
  const t = useTranslations("Access");
  return {
    label: (level: AccessLevel) => t(`${level}.label` as never),
    description: (level: AccessLevel) => t(`${level}.description` as never),
  };
}

const ACCESS_ICON: Record<AccessLevel, React.ReactNode> = {
  full: <Unlock className="size-4" />,
  read_only: <Eye className="size-4" />,
  blocked: <Lock className="size-4" />,
};

export function TeamManager({
  members,
  currentUserId,
}: {
  members: TeamMember[];
  currentUserId: string;
}) {
  const t = useTranslations("AdminTeam");
  const { label: accessLabel, description: accessDescription } = useAccessWords();
  const [editing, setEditing] = React.useState<TeamMember | "new" | null>(null);
  const [codeFor, setCodeFor] = React.useState<TeamMember | null>(null);
  const [accessFor, setAccessFor] = React.useState<TeamMember | null>(null);
  const [revealed, setRevealed] = React.useState<{ name: string; code: string } | null>(null);

  const fullAdmins = members.filter((m) => m.role === "admin" && m.accessLevel === "full").length;

  return (
    <div className="space-y-4">
      <Button
        variant="primary"
        size="lg"
        block
        icon={<Plus className="size-4" />}
        onClick={() => setEditing("new")}
      >
        {t("addSomebody")}
      </Button>

      <Card className="divide-y divide-line">
        {members.map((m) => {
          const spec = ACCESS[m.accessLevel];
          return (
            <div
              key={m.id}
              className={cn("p-3.5", m.accessLevel === "blocked" && "opacity-60")}
            >
              <div className="flex items-start gap-3">
                <Avatar emoji={m.avatar} name={m.name} size={38} />

                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[14.5px] font-bold text-ink">{m.name}</span>
                    {m.role === "admin" ? (
                      <Badge tone="brand">
                        <ShieldCheck className="size-3" />
                        {t("adminBadge")}
                      </Badge>
                    ) : (
                      <Badge tone="neutral">{t("staffBadge")}</Badge>
                    )}
                    {m.id === currentUserId ? <Badge tone="info">{t("youBadge")}</Badge> : null}
                    <Badge tone={spec.tone}>{accessLabel(m.accessLevel)}</Badge>
                    {m.mustChangePassword ? (
                      <Badge tone="warn">{t("codeNotChanged")}</Badge>
                    ) : null}
                    {m.devices > 0 ? (
                      <Badge tone="profit">
                        <Bell className="size-3" />
                        {m.devices}
                      </Badge>
                    ) : null}
                  </p>

                  <p className="nums mt-1 text-[12px] text-ink-3">
                    {t("ordersIn30", { count: m.orders30 })}
                    {m.orders30 > 0
                      ? ` - ${formatMoney(m.revenue30Cents, { compact: true })}`
                      : ""}
                    {m.ordersTotal > 0 ? t("allTime", { count: m.ordersTotal }) : ""}
                  </p>
                  <p className="mt-0.5 text-[11.5px] text-ink-3">
                    {m.lastSeenAt
                      ? t("lastSignedIn", { when: relativeTime(m.lastSeenAt) })
                      : t("neverSignedIn")}
                  </p>
                </div>

                <div className="flex shrink-0 flex-col gap-0.5">
                  <IconButton label={t("editMember", { name: m.name })} onClick={() => setEditing(m)}>
                    <Pencil className="size-4" />
                  </IconButton>
                  <IconButton label={t("resetCodeFor", { name: m.name })} onClick={() => setCodeFor(m)}>
                    <KeyRound className="size-4" />
                  </IconButton>
                  <IconButton
                    label={t("accessFor", { name: m.name })}
                    onClick={() => setAccessFor(m)}
                    className={
                      m.accessLevel === "full"
                        ? undefined
                        : m.accessLevel === "read_only"
                          ? "text-warn"
                          : "text-loss"
                    }
                  >
                    {ACCESS_ICON[m.accessLevel]}
                  </IconButton>
                </div>
              </div>
            </div>
          );
        })}
      </Card>

      <Card className="p-4">
        <p className="flex items-center gap-2 text-[13px] font-bold text-ink">
          <Users className="size-4 text-ink-3" />
          {t("howAccessWorks")}
        </p>
        <ul className="mt-2.5 space-y-2 text-[12.5px] leading-relaxed text-ink-2">
          {ACCESS_LEVELS.map((level) => (
            <li key={level} className="flex gap-2">
              <span className="mt-0.5 shrink-0 text-ink-3">{ACCESS_ICON[level]}</span>
              <span>
                <strong className="text-ink">{accessLabel(level)}</strong> -{" "}
                {accessDescription(level)}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 border-t border-line pt-3 text-[12.5px] leading-relaxed text-ink-3">
          {t("accessFootnote")}
        </p>
      </Card>

      {editing ? (
        <MemberSheet
          member={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onRevealCode={(name, code) => setRevealed({ name, code })}
        />
      ) : null}

      {codeFor ? (
        <CodeSheet
          member={codeFor}
          onClose={() => setCodeFor(null)}
          onRevealCode={(name, code) => setRevealed({ name, code })}
        />
      ) : null}

      {accessFor ? (
        <AccessSheet
          member={accessFor}
          isSelf={accessFor.id === currentUserId}
          isLastFullAdmin={
            accessFor.role === "admin" && accessFor.accessLevel === "full" && fullAdmins <= 1
          }
          onClose={() => setAccessFor(null)}
        />
      ) : null}

      <RevealCodeDialog reveal={revealed} onClose={() => setRevealed(null)} />
    </div>
  );
}

/* ------------------------------------------------------------- access sheet */

function AccessSheet({
  member,
  isSelf,
  isLastFullAdmin,
  onClose,
}: {
  member: TeamMember;
  isSelf: boolean;
  isLastFullAdmin: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("AdminTeam");
  const { label: accessLabel, description: accessDescription } = useAccessWords();
  const { toast } = useToast();
  const router = useRouter();
  const [busy, setBusy] = React.useState<AccessLevel | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  const locked = isSelf || isLastFullAdmin;

  const apply = async (level: AccessLevel) => {
    if (level === member.accessLevel) return;
    setBusy(level);
    const res = await setUserAccess(member.id, level);
    setBusy(null);
    toast(
      res.ok
        ? { tone: "success", title: res.message ?? t("accessUpdated") }
        : { tone: "error", title: res.error ?? t("couldNotChangeAccess") },
    );
    if (res.ok) {
      router.refresh();
      onClose();
    }
  };

  return (
    <>
      <Sheet
        open
        onClose={onClose}
        title={t("whatCanTheyDo", { name: member.name })}
        subtitle={t("accessSubtitle")}
        size="md"
      >
        <div className="space-y-4 pt-1 pb-2">
          {locked ? (
            <p className="rounded-[12px] bg-warn-soft px-3 py-2.5 text-[12.5px] leading-relaxed text-warn">
              {isSelf
                ? t("selfLocked")
                : t("lastAdminLocked")}
            </p>
          ) : null}

          <div className="space-y-2">
            {ACCESS_LEVELS.map((level) => {
              const spec = ACCESS[level];
              const current = member.accessLevel === level;
              return (
                <button
                  key={level}
                  type="button"
                  disabled={locked || busy !== null}
                  onClick={() => apply(level)}
                  className={cn(
                    "w-full rounded-[14px] border p-3.5 text-left transition active:scale-[0.99]",
                    current
                      ? "border-brand bg-brand-soft"
                      : "border-line bg-surface hover:bg-surface-2",
                    (locked || busy !== null) && "opacity-60",
                  )}
                >
                  <p className="flex items-center gap-2 text-[13.5px] font-bold text-ink">
                    <span
                      className={cn(
                        "size-4 shrink-0 rounded-full border-2",
                        current ? "border-brand bg-brand" : "border-line-strong",
                      )}
                    />
                    {accessLabel(level)}
                    {current ? <Badge tone="brand">{t("now")}</Badge> : null}
                    {busy === level ? <Badge tone="info">{t("saving")}</Badge> : null}
                  </p>
                  <p className="mt-1.5 pl-6 text-[12.5px] leading-relaxed text-ink-2">
                    {accessDescription(level)}
                  </p>
                </button>
              );
            })}
          </div>

          <div className="border-t border-line pt-4">
            <p className="text-[12px] font-bold tracking-[0.05em] text-ink-3 uppercase">
              {t("removeForGood")}
            </p>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-3">
              {member.ordersTotal > 0
                ? t("deleteNoteWithOrders", { count: member.ordersTotal })
                : t("deleteNoteNoOrders")}
            </p>
            <Button
              variant="ghost"
              className="mt-2.5 justify-start text-loss"
              icon={<Trash2 className="size-4" />}
              disabled={isSelf || isLastFullAdmin}
              onClick={() => setConfirmDelete(true)}
            >
              {t("deletePermanently", { name: member.name })}
            </Button>
          </div>
        </div>
      </Sheet>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={t("deleteTitle", { name: member.name })}
        body={
          member.ordersTotal > 0
            ? t("deleteBodyWithOrders", { count: member.ordersTotal })
            : t("deleteBodyNoOrders")
        }
        confirmLabel={t("deleteConfirm")}
        destructive
        loading={deleting}
        onConfirm={async () => {
          setDeleting(true);
          const res = await deleteUser(member.id);
          setDeleting(false);
          setConfirmDelete(false);
          toast(
            res.ok
              ? { tone: "success", title: res.message ?? t("deleted") }
              : { tone: "error", title: res.error ?? t("couldNotDelete") },
          );
          if (res.ok) {
            router.refresh();
            onClose();
          }
        }}
      />
    </>
  );
}

/* ------------------------------------------------------------- member form */

function MemberSheet({
  member,
  onClose,
  onRevealCode,
}: {
  member: TeamMember | null;
  onClose: () => void;
  onRevealCode: (name: string, code: string) => void;
}) {
  const t = useTranslations("AdminTeam");
  const c = useTranslations("Common");
  const { toast } = useToast();
  const router = useRouter();
  const [state, action, pending] = useActionState<UserActionResult | null, FormData>(
    saveUser,
    null,
  );
  const [avatar, setAvatar] = React.useState(member?.avatar ?? "\u{1F464}");
  // New accounts are staff. Promoting somebody to admin is a deliberate act on
  // an existing account, not something to do by accident while adding a
  // waitress mid-shift.
  const [role, setRole] = React.useState<"admin" | "staff">(member?.role ?? "staff");
  const canChangeRole = Boolean(member);

  React.useEffect(() => {
    if (!state) return;
    if (state.ok) {
      toast({ tone: "success", title: state.message ?? c("save") });
      if (state.code && state.name) onRevealCode(state.name, state.code);
      router.refresh();
      onClose();
    } else {
      toast({ tone: "error", title: state.error ?? c("couldNotSave") });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <Sheet
      open
      onClose={onClose}
      title={member ? t("editMember", { name: member.name }) : t("addTitle")}
      subtitle={member ? undefined : t("addSubtitle")}
      size="sm"
    >
      <form action={action} className="space-y-4 pt-1 pb-2">
        <input type="hidden" name="id" value={member?.id ?? ""} />
        <input type="hidden" name="avatar" value={avatar} />
        <input type="hidden" name="role" value={role} />

        <Field label={t("name")} required hint={t("nameHint")}>
          <Input
            name="name"
            defaultValue={member?.name ?? ""}
            placeholder={t("namePlaceholder")}
            required
            maxLength={40}
            data-autofocus
          />
        </Field>

        <div>
          <span className="mb-1.5 block text-[13px] font-semibold text-ink-2">
            {t("capability")}
          </span>
          {canChangeRole ? (
            <Segmented<"admin" | "staff">
              value={role}
              onChange={setRole}
              options={[
                { value: "staff", label: t("recordSales") },
                { value: "admin", label: t("seeEverything") },
              ]}
            />
          ) : (
            <p className="rounded-[12px] bg-surface-2 px-3 py-2.5 text-[12.5px] leading-relaxed text-ink-2">
              {t("newStaffNote")}
            </p>
          )}
          {canChangeRole ? (
            <p className="mt-1.5 text-[12px] leading-snug text-ink-3">
              {role === "staff"
                ? t("staffCapability")
                : t("adminCapability")}
            </p>
          ) : null}
        </div>

        <div>
          <span className="mb-1.5 block text-[13px] font-semibold text-ink-2">{t("picture")}</span>
          <div className="no-scrollbar flex gap-1.5 overflow-x-auto pb-1">
            {AVATARS.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setAvatar(a)}
                aria-label={`Use ${a}`}
                className={cn(
                  "flex size-11 shrink-0 items-center justify-center rounded-full border text-[20px]",
                  avatar === a ? "border-brand bg-brand-soft" : "border-line bg-surface",
                )}
              >
                {a}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2.5">
          <Button type="button" variant="secondary" block onClick={onClose} disabled={pending}>
            {c("cancel")}
          </Button>
          <Button type="submit" variant="primary" block loading={pending}>
            {member ? c("save") : t("createAccount")}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}

/* --------------------------------------------------------------- code reset */

function CodeSheet({
  member,
  onClose,
  onRevealCode,
}: {
  member: TeamMember;
  onClose: () => void;
  onRevealCode: (name: string, code: string) => void;
}) {
  const t = useTranslations("AdminTeam");
  const c = useTranslations("Common");
  const { toast } = useToast();
  const router = useRouter();
  const [mode, setMode] = React.useState<"random" | "choose">("random");
  const [code, setCode] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  return (
    <Sheet
      open
      onClose={onClose}
      title={t("newCodeFor", { name: member.name })}
      subtitle={t("codeSubtitle")}
      size="sm"
      footer={
        <div className="flex gap-2.5">
          <Button variant="secondary" block onClick={onClose} disabled={busy}>
            {c("cancel")}
          </Button>
          <Button
            variant="primary"
            block
            loading={busy}
            disabled={mode === "choose" && code.length !== 6}
            onClick={async () => {
              setBusy(true);
              const res =
                mode === "random"
                  ? await resetUserCode(member.id)
                  : await setUserCode(member.id, code);
              setBusy(false);
              if (res.ok) {
                if (res.code && res.name) onRevealCode(res.name, res.code);
                else onRevealCode(member.name, code);
                router.refresh();
                onClose();
              }
              toast(
                res.ok
                  ? { tone: "success", title: res.message ?? t("done") }
                  : { tone: "error", title: res.error ?? t("couldNotSetCode") },
              );
            }}
          >
            {t("setCode")}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 pt-1 pb-2">
        <Segmented<"random" | "choose">
          value={mode}
          onChange={setMode}
          options={[
            { value: "random", label: t("generateOne") },
            { value: "choose", label: t("typeOne") },
          ]}
        />

        {mode === "choose" ? (
          <CodeInput
            name="code"
            label={t("newSixDigit")}
            value={code}
            onChange={setCode}
            autoFocus
          />
        ) : (
          <p className="text-[13px] leading-relaxed text-ink-2">
            {t("randomNote")}
          </p>
        )}
      </div>
    </Sheet>
  );
}

function RevealCodeDialog({
  reveal,
  onClose,
}: {
  reveal: { name: string; code: string } | null;
  onClose: () => void;
}) {
  const t = useTranslations("AdminTeam");
  const { toast } = useToast();

  return (
    <Sheet
      open={Boolean(reveal)}
      onClose={onClose}
      title={t("writeThisDown")}
      subtitle={reveal ? t("needsThisCode", { name: reveal.name }) : undefined}
      size="sm"
      dismissable={false}
      footer={
        <Button variant="primary" block onClick={onClose}>
          {t("writtenItDown")}
        </Button>
      }
    >
      <div className="space-y-3 pt-2 pb-2">
        <div className="rounded-[16px] bg-brand-soft py-6 text-center">
          <p className="nums text-[38px] leading-none font-bold tracking-[0.2em] text-brand-ink">
            {reveal?.code}
          </p>
        </div>

        <Button
          variant="secondary"
          block
          icon={<Copy className="size-4" />}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(reveal?.code ?? "");
              toast({ tone: "success", title: t("copied") });
            } catch {
              toast({ tone: "error", title: t("couldNotCopy") });
            }
          }}
        >
          {t("copy")}
        </Button>

        <p className="text-center text-[12px] leading-relaxed text-ink-3">
          {t("codeNotStored")}
        </p>
      </div>
    </Sheet>
  );
}
