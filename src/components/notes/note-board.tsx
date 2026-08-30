"use client";
/**
 * Notes, messages and comment threads.
 *
 * Staff post through the offline outbox, so a message written with no signal
 * behaves exactly like a sale: stored on the phone, sent later, never lost.
 * Admins post directly, since they are reading reports anyway.
 */
import * as React from "react";
import { useRouter } from "@/i18n/routing";
import {
  CircleCheck,
  CircleDot,
  MessageSquare,
  Pin,
  PinOff,
  Lock,
  Reply,
  Send,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { cn, newId } from "@/lib/utils";
import { formatDayLabel, relativeTime, today } from "@/lib/dates";
import type { NoteThread } from "@/lib/notes";
import { deleteNote, postNote, togglePinned, toggleResolved } from "@/app/actions/notes";
import type { ActionResult } from "@/app/actions/_result";
import { useSync } from "@/components/providers/sync-provider";
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  IconButton,
  Segmented,
  Textarea,
} from "@/components/ui/primitives";
import { ConfirmDialog } from "@/components/ui/overlay";
import { useToast } from "@/components/ui/toast";

type Kind = "note" | "message" | "handover" | "issue";

const KIND_META: Record<Kind, { label: string; tone: "neutral" | "info" | "warn" | "loss" }> = {
  note: { label: "Note", tone: "neutral" },
  message: { label: "Message", tone: "info" },
  handover: { label: "Handover", tone: "warn" },
  issue: { label: "Problem", tone: "loss" },
};

export function NoteBoard({
  threads,
  currentUser,
  noteDate = today(),
  compact,
  canPost = true,
}: {
  threads: NoteThread[];
  currentUser: { id: string; name: string; role: "admin" | "staff"; avatar: string };
  /** Which trading day new notes attach to. */
  noteDate?: string;
  /** Hide the day label on each note (used inside a single-day view). */
  compact?: boolean;
  /** False for read-only accounts: they can read the board but not add to it. */
  canPost?: boolean;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const sync = useSync();

  const [kind, setKind] = React.useState<Kind>("note");
  const [body, setBody] = React.useState("");
  const [posting, setPosting] = React.useState(false);
  const [replyTo, setReplyTo] = React.useState<string | null>(null);
  const [replyBody, setReplyBody] = React.useState("");
  const [deleting, setDeleting] = React.useState<{ id: string; body: string } | null>(null);

  /**
   * Staff go through the outbox so a note survives being offline. Admins post
   * straight to the server, so the thread updates immediately.
   */
  const submit = async (text: string, parentId: string | null, noteKind: Kind) => {
    const trimmed = text.trim();
    if (!trimmed) return false;
    setPosting(true);

    try {
      if (currentUser.role === "staff") {
        await sync.queue(
          "note",
          { module: "restaurant", kind: noteKind, noteDate, body: trimmed, parentId },
          `${KIND_META[noteKind].label}: ${trimmed.slice(0, 40)}`,
          newId(),
        );
        toast(
          sync.online
            ? { tone: "success", title: "Sent to the office" }
            : {
                tone: "offline",
                title: "Saved on this phone",
                body: "It will reach the office when you have internet.",
              },
        );
        // The optimistic copy lives in the outbox; refresh once it lands.
        setTimeout(() => router.refresh(), 800);
        return true;
      }

      const fd = new FormData();
      fd.set("body", trimmed);
      fd.set("kind", noteKind);
      fd.set("noteDate", noteDate);
      if (parentId) fd.set("parentId", parentId);

      const res = await postNote(null, fd);
      toast(
        res.ok
          ? { tone: "success", title: res.message ?? "Saved" }
          : { tone: "error", title: res.error ?? "Could not save" },
      );
      if (res.ok) router.refresh();
      return res.ok;
    } finally {
      setPosting(false);
    }
  };

  const act = async (fn: () => Promise<ActionResult>) => {
    const res = await fn();
    toast(
      res.ok
        ? { tone: "success", title: res.message ?? "Done" }
        : { tone: "error", title: res.error ?? "Could not do that" },
    );
    if (res.ok) router.refresh();
  };

  return (
    <div className="space-y-4">
      {/* Composer */}
      {!canPost ? (
        <Card className="flex items-start gap-2.5 border-warn/30 bg-warn-soft p-3.5">
          <Lock className="mt-px size-4 shrink-0 text-warn" />
          <p className="text-[12.5px] leading-relaxed text-warn">
            An admin has paused your ability to post. You can still read everything here.
          </p>
        </Card>
      ) : (
      <Card className="p-3.5">
        <Segmented<Kind>
          value={kind}
          onChange={setKind}
          size="sm"
          options={[
            { value: "note", label: "Note" },
            { value: "message", label: "Message" },
            { value: "handover", label: "Handover" },
            { value: "issue", label: "Problem" },
          ]}
        />

        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          maxLength={4000}
          className="mt-3"
          placeholder={
            kind === "issue"
              ? "What went wrong? e.g. the fridge stopped working around 2pm"
              : kind === "handover"
                ? "What should the next shift know?"
                : kind === "message"
                  ? "Write a message to the family..."
                  : `What happened on ${formatDayLabel(noteDate).toLowerCase()}?`
          }
        />

        <div className="mt-2.5 flex items-center justify-between gap-3">
          <p className="text-[11.5px] text-ink-3">
            {kind === "issue"
              ? "Admins get an urgent notification."
              : `Attached to ${formatDayLabel(noteDate)}`}
          </p>
          <Button
            variant="primary"
            size="sm"
            loading={posting}
            disabled={!body.trim()}
            icon={<Send className="size-3.5" />}
            onClick={async () => {
              const ok = await submit(body, null, kind);
              if (ok) setBody("");
            }}
          >
            {sync.online ? "Post" : "Save"}
          </Button>
        </div>
      </Card>
      )}

      {/* Threads */}
      {threads.length === 0 ? (
        <EmptyState
          icon={<MessageSquare className="size-6" />}
          title="No notes yet"
          body="Use this for anything worth remembering: a complaint, a delivery that was short, a message for the family."
        />
      ) : (
        <ul className="space-y-2.5">
          {threads.map(({ root, replies }) => {
            const meta = KIND_META[root.kind];
            const canDelete = currentUser.role === "admin" || root.authorId === currentUser.id;

            return (
              <li key={root.id}>
                <Card
                  className={cn(
                    "overflow-hidden",
                    root.kind === "issue" && !root.resolvedAt && "border-loss/30",
                    root.isPinned && "border-brand/40",
                  )}
                >
                  <div className="p-3.5">
                    <div className="flex items-start gap-2.5">
                      <Avatar emoji={root.authorAvatar} name={root.authorName} size={32} />
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="text-[13.5px] font-bold text-ink">
                            {root.authorName}
                          </span>
                          {root.authorRole === "admin" ? (
                            <Badge tone="brand">admin</Badge>
                          ) : null}
                          <Badge tone={meta.tone}>{meta.label}</Badge>
                          {root.isPinned ? (
                            <Badge tone="brand">
                              <Pin className="size-3" />
                              pinned
                            </Badge>
                          ) : null}
                          {root.kind === "issue" ? (
                            root.resolvedAt ? (
                              <Badge tone="profit">
                                <CircleCheck className="size-3" />
                                handled
                              </Badge>
                            ) : (
                              <Badge tone="loss">
                                <TriangleAlert className="size-3" />
                                open
                              </Badge>
                            )
                          ) : null}
                        </p>
                        <p className="mt-0.5 text-[11.5px] text-ink-3">
                          {relativeTime(root.createdAt)}
                          {!compact ? ` - about ${formatDayLabel(root.noteDate)}` : ""}
                        </p>
                      </div>

                      {currentUser.role === "admin" ? (
                        <div className="flex shrink-0 gap-0.5">
                          <IconButton
                            label={root.isPinned ? "Unpin" : "Pin"}
                            onClick={() => act(() => togglePinned(root.id, !root.isPinned))}
                          >
                            {root.isPinned ? (
                              <PinOff className="size-4" />
                            ) : (
                              <Pin className="size-4" />
                            )}
                          </IconButton>
                          {root.kind === "issue" ? (
                            <IconButton
                              label={root.resolvedAt ? "Reopen" : "Mark handled"}
                              onClick={() =>
                                act(() => toggleResolved(root.id, !root.resolvedAt))
                              }
                            >
                              {root.resolvedAt ? (
                                <CircleDot className="size-4" />
                              ) : (
                                <CircleCheck className="size-4" />
                              )}
                            </IconButton>
                          ) : null}
                        </div>
                      ) : null}
                    </div>

                    <p className="mt-2.5 text-[14px] leading-relaxed whitespace-pre-wrap text-ink">
                      {root.body}
                    </p>

                    <div className="mt-2.5 flex items-center gap-3">
                      <button
                        disabled={!canPost && replies.length === 0}
                        onClick={() => {
                          setReplyTo(replyTo === root.id ? null : root.id);
                          setReplyBody("");
                        }}
                        className="inline-flex items-center gap-1.5 text-[12px] font-bold text-brand"
                      >
                        <Reply className="size-3.5" />
                        {replies.length > 0
                          ? `${replies.length} repl${replies.length === 1 ? "y" : "ies"}`
                          : "Reply"}
                      </button>
                      {canDelete ? (
                        <button
                          onClick={() => setDeleting({ id: root.id, body: root.body })}
                          className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-ink-3"
                        >
                          <Trash2 className="size-3.5" />
                          Delete
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {replies.length > 0 ? (
                    <ul className="space-y-3 border-t border-line bg-surface-2/50 px-3.5 py-3">
                      {replies.map((r) => (
                        <li key={r.id} className="flex items-start gap-2.5">
                          <Avatar emoji={r.authorAvatar} name={r.authorName} size={26} />
                          <div className="min-w-0 flex-1">
                            <p className="flex items-center gap-2">
                              <span className="text-[12.5px] font-bold text-ink">
                                {r.authorName}
                              </span>
                              <span className="text-[11px] text-ink-3">
                                {relativeTime(r.createdAt)}
                              </span>
                            </p>
                            <p className="mt-0.5 text-[13.5px] leading-relaxed whitespace-pre-wrap text-ink-2">
                              {r.body}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  {replyTo === root.id && canPost ? (
                    <div className="border-t border-line bg-surface-2/50 px-3.5 py-3">
                      <Textarea
                        value={replyBody}
                        onChange={(e) => setReplyBody(e.target.value)}
                        rows={2}
                        maxLength={4000}
                        placeholder="Write a reply..."
                        data-autofocus
                      />
                      <div className="mt-2 flex justify-end gap-2">
                        <Button size="sm" variant="ghost" onClick={() => setReplyTo(null)}>
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          variant="primary"
                          loading={posting}
                          disabled={!replyBody.trim()}
                          onClick={async () => {
                            const ok = await submit(replyBody, root.id, "note");
                            if (ok) {
                              setReplyBody("");
                              setReplyTo(null);
                            }
                          }}
                        >
                          Reply
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Delete this note?"
        body={deleting?.body.slice(0, 160)}
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          if (!deleting) return;
          const id = deleting.id;
          setDeleting(null);
          await act(() => deleteNote(id));
        }}
      />
    </div>
  );
}
