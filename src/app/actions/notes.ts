"use server";
/**
 * Notes, messages and comment threads.
 *
 * Anyone signed in can post; only admins can pin, resolve or delete. Notes
 * posted from a staff phone go through the offline outbox instead of this
 * action, so a message written in a dead spot survives exactly like a sale.
 */
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { notes } from "@/db/schema";
import { AccessError, requireAdmin, requireWriteAccess } from "@/lib/auth";
import { getBusinessSettings } from "@/lib/settings";
import { businessDateOf } from "@/lib/dates";
import { notifyAdmins } from "@/lib/push";
import { newId } from "@/lib/utils";
import { fail, ok, toActionError, type ActionResult } from "./_result";

const schema = z.object({
  body: z.string().trim().min(1, "Write something first.").max(4000),
  kind: z.enum(["note", "message", "handover", "issue"]).default("note"),
  noteDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  parentId: z.string().uuid().optional().or(z.literal("")),
});

export async function postNote(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    // Read-only staff can read the board but not post to it.
    const user = await requireWriteAccess();
    const business = await getBusinessSettings();

    const parsed = schema.safeParse({
      body: formData.get("body") ?? "",
      kind: (formData.get("kind") as string) || "note",
      noteDate: (formData.get("noteDate") as string) || "",
      parentId: (formData.get("parentId") as string) || "",
    });

    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Please check the form.");
    }
    const v = parsed.data;

    const noteDate =
      v.noteDate || businessDateOf(new Date(), business.timezone, business.dayCutoffHour);

    const [row] = await db
      .insert(notes)
      .values({
        clientId: newId(),
        module: "restaurant",
        kind: v.kind,
        noteDate,
        body: v.body,
        authorId: user.id,
        parentId: v.parentId || null,
      })
      .returning({ id: notes.id });

    // Tell the other admins (never the author) - replies included, so a
    // conversation actually reaches the person who is not looking at the app.
    await notifyAdmins(
      {
        title: v.parentId
          ? `${user.name} replied`
          : v.kind === "issue"
            ? `${user.name} reported a problem`
            : `${user.name} left a ${v.kind}`,
        body: v.body.slice(0, 140),
        url: "/notes",
        kind: "note",
        tag: `note-${row.id}`,
        urgent: v.kind === "issue",
      },
      user.id,
    ).catch(() => {});

    revalidatePath("/notes");
    revalidatePath("/admin");
    revalidatePath("/admin/log");
    return ok(v.parentId ? "Reply sent." : "Note saved.");
  } catch (err) {
    if (err instanceof AccessError) return fail(err.message);
    return toActionError(err);
  }
}

export async function togglePinned(id: string, pinned: boolean): Promise<ActionResult> {
  try {
    await requireAdmin();
    await db.update(notes).set({ isPinned: pinned }).where(eq(notes.id, id));
    revalidatePath("/notes");
    return ok(pinned ? "Pinned to the top." : "Unpinned.");
  } catch (err) {
    return toActionError(err);
  }
}

export async function toggleResolved(id: string, resolved: boolean): Promise<ActionResult> {
  try {
    await requireAdmin();
    await db
      .update(notes)
      .set({ resolvedAt: resolved ? new Date() : null })
      .where(eq(notes.id, id));
    revalidatePath("/notes");
    revalidatePath("/admin/log");
    return ok(resolved ? "Marked as handled." : "Reopened.");
  } catch (err) {
    return toActionError(err);
  }
}

/** Authors can delete their own note; admins can delete any. */
export async function deleteNote(id: string): Promise<ActionResult> {
  try {
    const user = await requireWriteAccess();
    const where =
      user.role === "admin"
        ? eq(notes.id, id)
        : and(eq(notes.id, id), eq(notes.authorId, user.id));

    const [row] = await db
      .update(notes)
      .set({ deletedAt: new Date() })
      .where(where)
      .returning({ id: notes.id });

    if (!row) return fail("You can only delete your own notes.");

    revalidatePath("/notes");
    revalidatePath("/admin/log");
    return ok("Note deleted.");
  } catch (err) {
    if (err instanceof AccessError) return fail(err.message);
    return toActionError(err);
  }
}
