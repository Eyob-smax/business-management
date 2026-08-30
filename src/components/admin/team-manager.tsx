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
import { useRouter } from "next/navigation";
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
        Add somebody
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
                        admin
                      </Badge>
                    ) : (
                      <Badge tone="neutral">staff</Badge>
                    )}
                    {m.id === currentUserId ? <Badge tone="info">you</Badge> : null}
                    <Badge tone={spec.tone}>{spec.label}</Badge>
                    {m.mustChangePassword ? <Badge tone="warn">code not changed</Badge> : null}
                    {m.devices > 0 ? (
                      <Badge tone="profit">
                        <Bell className="size-3" />
                        {m.devices}
                      </Badge>
                    ) : null}
                  </p>

                  <p className="nums mt-1 text-[12px] text-ink-3">
                    {m.orders30} order{m.orders30 === 1 ? "" : "s"} in 30 days
                    {m.orders30 > 0
                      ? ` - ${formatMoney(m.revenue30Cents, { compact: true })}`
                      : ""}
                    {m.ordersTotal > 0 ? ` - ${m.ordersTotal} all time` : ""}
                  </p>
                  <p className="mt-0.5 text-[11.5px] text-ink-3">
                    {m.lastSeenAt
                      ? `Last signed in ${relativeTime(m.lastSeenAt)}`
                      : "Never signed in"}
                  </p>
                </div>

                <div className="flex shrink-0 flex-col gap-0.5">
                  <IconButton label={`Edit ${m.name}`} onClick={() => setEditing(m)}>
                    <Pencil className="size-4" />
                  </IconButton>
                  <IconButton label={`Reset code for ${m.name}`} onClick={() => setCodeFor(m)}>
                    <KeyRound className="size-4" />
                  </IconButton>
                  <IconButton
                    label={`Access for ${m.name}`}
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
          How access works
        </p>
        <ul className="mt-2.5 space-y-2 text-[12.5px] leading-relaxed text-ink-2">
          {ACCESS_LEVELS.map((level) => (
            <li key={level} className="flex gap-2">
              <span className="mt-0.5 shrink-0 text-ink-3">{ACCESS_ICON[level]}</span>
              <span>
                <strong className="text-ink">{ACCESS[level].label}</strong> -{" "}
                {ACCESS[level].description}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 border-t border-line pt-3 text-[12.5px] leading-relaxed text-ink-3">
          A change applies the next time that phone does anything - it does not wait for them to
          sign out. Anything they already recorded is always kept and still syncs.
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
        ? { tone: "success", title: res.message ?? "Access updated" }
        : { tone: "error", title: res.error ?? "Could not change access" },
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
        title={`What can ${member.name} do?`}
        subtitle="Takes effect immediately, on every device they use."
        size="md"
      >
        <div className="space-y-4 pt-1 pb-2">
          {locked ? (
            <p className="rounded-[12px] bg-warn-soft px-3 py-2.5 text-[12.5px] leading-relaxed text-warn">
              {isSelf
                ? "This is your own account. Ask the other admin to change your access - the app will not let you lock yourself out."
                : "This is the last admin with full access. Give somebody else full admin access first, otherwise nobody could get back in."}
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
                    {spec.label}
                    {current ? <Badge tone="brand">now</Badge> : null}
                    {busy === level ? <Badge tone="info">saving</Badge> : null}
                  </p>
                  <p className="mt-1.5 pl-6 text-[12.5px] leading-relaxed text-ink-2">
                    {spec.description}
                  </p>
                </button>
              );
            })}
          </div>

          <div className="border-t border-line pt-4">
            <p className="text-[12px] font-bold tracking-[0.05em] text-ink-3 uppercase">
              Remove for good
            </p>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-3">
              Deleting the account cannot be undone. Their orders are kept, but{" "}
              {member.ordersTotal > 0 ? (
                <>
                  <strong className="text-ink">
                    {member.ordersTotal} past order{member.ordersTotal === 1 ? "" : "s"}
                  </strong>{" "}
                  would stop showing their name.
                </>
              ) : (
                "they would no longer appear anywhere."
              )}{" "}
              Choosing <strong className="text-ink">No access</strong> above keeps the name on the
              history and is almost always the better choice.
            </p>
            <Button
              variant="ghost"
              className="mt-2.5 justify-start text-loss"
              icon={<Trash2 className="size-4" />}
              disabled={isSelf || isLastFullAdmin}
              onClick={() => setConfirmDelete(true)}
            >
              Delete {member.name} permanently
            </Button>
          </div>
        </div>
      </Sheet>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={`Delete ${member.name}?`}
        body={
          member.ordersTotal > 0
            ? `This cannot be undone. ${member.ordersTotal} past order${member.ordersTotal === 1 ? "" : "s"} will stay in your records but will no longer show who recorded ${member.ordersTotal === 1 ? "it" : "them"}.`
            : "This cannot be undone."
        }
        confirmLabel="Delete permanently"
        destructive
        loading={deleting}
        onConfirm={async () => {
          setDeleting(true);
          const res = await deleteUser(member.id);
          setDeleting(false);
          setConfirmDelete(false);
          toast(
            res.ok
              ? { tone: "success", title: res.message ?? "Deleted" }
              : { tone: "error", title: res.error ?? "Could not delete" },
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
      toast({ tone: "success", title: state.message ?? "Saved" });
      if (state.code && state.name) onRevealCode(state.name, state.code);
      router.refresh();
      onClose();
    } else {
      toast({ tone: "error", title: state.error ?? "Could not save" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <Sheet
      open
      onClose={onClose}
      title={member ? `Edit ${member.name}` : "Add somebody"}
      subtitle={member ? undefined : "They get a 6-digit code you can give them."}
      size="sm"
    >
      <form action={action} className="space-y-4 pt-1 pb-2">
        <input type="hidden" name="id" value={member?.id ?? ""} />
        <input type="hidden" name="avatar" value={avatar} />
        <input type="hidden" name="role" value={role} />

        <Field label="Name" required hint="This is what they type to sign in.">
          <Input
            name="name"
            defaultValue={member?.name ?? ""}
            placeholder="e.g. Aster"
            required
            maxLength={40}
            data-autofocus
          />
        </Field>

        <div>
          <span className="mb-1.5 block text-[13px] font-semibold text-ink-2">
            What can they do?
          </span>
          {canChangeRole ? (
            <Segmented<"admin" | "staff">
              value={role}
              onChange={setRole}
              options={[
                { value: "staff", label: "Record sales" },
                { value: "admin", label: "See everything" },
              ]}
            />
          ) : (
            <p className="rounded-[12px] bg-surface-2 px-3 py-2.5 text-[12.5px] leading-relaxed text-ink-2">
              They will be able to record sales on the till and see their own shift. They never
              see costs, profit, or anybody else&rsquo;s numbers. You can make somebody an admin
              later by editing their account.
            </p>
          )}
          {canChangeRole ? (
            <p className="mt-1.5 text-[12px] leading-snug text-ink-3">
              {role === "staff"
                ? "The till and their own sales. They never see costs, profit or other people's numbers."
                : "Full access: reports, expenses, menu, team, and notifications."}
            </p>
          ) : null}
        </div>

        <div>
          <span className="mb-1.5 block text-[13px] font-semibold text-ink-2">Picture</span>
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
            Cancel
          </Button>
          <Button type="submit" variant="primary" block loading={pending}>
            {member ? "Save" : "Create account"}
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
  const { toast } = useToast();
  const router = useRouter();
  const [mode, setMode] = React.useState<"random" | "choose">("random");
  const [code, setCode] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  return (
    <Sheet
      open
      onClose={onClose}
      title={`New code for ${member.name}`}
      subtitle="They will be asked to change it when they sign in."
      size="sm"
      footer={
        <div className="flex gap-2.5">
          <Button variant="secondary" block onClick={onClose} disabled={busy}>
            Cancel
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
                  ? { tone: "success", title: res.message ?? "Done" }
                  : { tone: "error", title: res.error ?? "Could not set the code" },
              );
            }}
          >
            Set code
          </Button>
        </div>
      }
    >
      <div className="space-y-4 pt-1 pb-2">
        <Segmented<"random" | "choose">
          value={mode}
          onChange={setMode}
          options={[
            { value: "random", label: "Generate one" },
            { value: "choose", label: "Type one" },
          ]}
        />

        {mode === "choose" ? (
          <CodeInput
            name="code"
            label="New 6-digit code"
            value={code}
            onChange={setCode}
            autoFocus
          />
        ) : (
          <p className="text-[13px] leading-relaxed text-ink-2">
            A random 6-digit code will be generated and shown to you once.
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
  const { toast } = useToast();

  return (
    <Sheet
      open={Boolean(reveal)}
      onClose={onClose}
      title="Write this down"
      subtitle={reveal ? `${reveal.name} needs this code to sign in` : undefined}
      size="sm"
      dismissable={false}
      footer={
        <Button variant="primary" block onClick={onClose}>
          I have written it down
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
              toast({ tone: "success", title: "Copied" });
            } catch {
              toast({ tone: "error", title: "Could not copy - please write it down" });
            }
          }}
        >
          Copy
        </Button>

        <p className="text-center text-[12px] leading-relaxed text-ink-3">
          This code is not stored anywhere you can read it again. If it gets lost, generate a new
          one.
        </p>
      </div>
    </Sheet>
  );
}
