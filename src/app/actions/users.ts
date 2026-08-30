"use server";
/**
 * Team management (admin only).
 *
 * A new person gets a random 6-digit code that is shown to the admin exactly
 * once, and is required to replace it on first sign-in. Accounts are switched
 * off rather than deleted so their past sales keep their name.
 */
import { revalidatePath } from "next/cache";
import { and, eq, ne, sql as dsql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { activityLog, sales, users } from "@/db/schema";
import { hashPassword, normaliseHandle, randomCode, requireAdmin, validatePassword } from "@/lib/auth";
import { isAccessLevel, type AccessLevel } from "@/lib/access";
import { fail, ok, toActionError, type ActionResult } from "./_result";

const schema = z.object({
  id: z.string().uuid().optional().or(z.literal("")),
  name: z.string().trim().min(2, "Enter a name.").max(40),
  role: z.enum(["admin", "staff"]),
  avatar: z.string().trim().max(8).default("\u{1F464}"),
});

export type UserActionResult = ActionResult & {
  /** Present only when a code was just generated - shown once, never stored. */
  code?: string;
  name?: string;
};

export async function saveUser(
  _prev: UserActionResult | null,
  formData: FormData,
): Promise<UserActionResult> {
  try {
    const admin = await requireAdmin();

    const parsed = schema.safeParse({
      id: formData.get("id") ?? "",
      name: formData.get("name") ?? "",
      role: (formData.get("role") as string) || "staff",
      avatar: (formData.get("avatar") as string) || "\u{1F464}",
    });

    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Please check the form.");
    }
    const v = parsed.data;
    const handle = normaliseHandle(v.name);

    // Handles are the login identity, so they must stay unique.
    const clash = await db
      .select({ id: users.id })
      .from(users)
      .where(v.id ? and(eq(users.handle, handle), ne(users.id, v.id)) : eq(users.handle, handle))
      .limit(1);

    if (clash.length) {
      return fail(`Somebody already signs in as "${v.name}". Try adding a surname.`);
    }

    if (v.id) {
      await db
        .update(users)
        .set({ name: v.name, handle, role: v.role, avatar: v.avatar })
        .where(eq(users.id, v.id));

      await db.insert(activityLog).values({
        actorId: admin.id,
        action: "user-update",
        entity: "user",
        entityId: v.id,
        detail: { name: v.name, role: v.role },
      });

      revalidatePath("/admin/team");
      return { ok: true, message: `${v.name} updated.` };
    }

    const code = randomCode();
    const [row] = await db
      .insert(users)
      .values({
        name: v.name,
        handle,
        role: v.role,
        avatar: v.avatar,
        passwordHash: await hashPassword(code),
        mustChangePassword: true,
      })
      .returning({ id: users.id });

    await db.insert(activityLog).values({
      actorId: admin.id,
      action: "user-create",
      entity: "user",
      entityId: row.id,
      detail: { name: v.name, role: v.role },
    });

    revalidatePath("/admin/team");
    return {
      ok: true,
      message: `${v.name} can now sign in.`,
      code,
      name: v.name,
    };
  } catch (err) {
    return toActionError(err);
  }
}

/** Generates a fresh code for someone who forgot theirs. */
export async function resetUserCode(id: string): Promise<UserActionResult> {
  try {
    const admin = await requireAdmin();
    const code = randomCode();

    const [row] = await db
      .update(users)
      .set({ passwordHash: await hashPassword(code), mustChangePassword: true })
      .where(eq(users.id, id))
      .returning({ name: users.name });

    if (!row) return fail("That account no longer exists.");

    await db.insert(activityLog).values({
      actorId: admin.id,
      action: "user-reset-code",
      entity: "user",
      entityId: id,
    });

    revalidatePath("/admin/team");
    return { ok: true, message: `New code for ${row.name}.`, code, name: row.name };
  } catch (err) {
    return toActionError(err);
  }
}

/** Admin sets a specific code, for when they want to tell someone in person. */
export async function setUserCode(id: string, code: string): Promise<UserActionResult> {
  try {
    const admin = await requireAdmin();
    const problem = validatePassword(code);
    if (problem) return fail(problem);

    const [row] = await db
      .update(users)
      .set({ passwordHash: await hashPassword(code), mustChangePassword: true })
      .where(eq(users.id, id))
      .returning({ name: users.name });

    if (!row) return fail("That account no longer exists.");

    await db.insert(activityLog).values({
      actorId: admin.id,
      action: "user-set-code",
      entity: "user",
      entityId: id,
    });

    revalidatePath("/admin/team");
    return { ok: true, message: `${row.name} can sign in with that code.` };
  } catch (err) {
    return toActionError(err);
  }
}

/**
 * Every admin with a working way in. Used to make sure a change can never
 * leave the business locked out of its own data.
 */
async function usableAdminIds(): Promise<string[]> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.role, "admin"), eq(users.accessLevel, "full")));
  return rows.map((r) => r.id);
}

/**
 * Move somebody between the three access levels.
 *
 *   full      can sign in and record sales
 *   read_only can sign in and see their own history, but records nothing
 *   blocked   cannot sign in at all
 *
 * Enforcement is not here - it is in lib/auth.ts, and the write path re-reads
 * this column on every action, so a change takes effect immediately even for a
 * phone that is already signed in.
 */
export async function setUserAccess(id: string, level: AccessLevel): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();

    if (!isAccessLevel(level)) return fail("Unknown access level.");
    if (id === admin.id && level !== "full") {
      return fail("You cannot limit your own access - ask the other admin to do it.");
    }

    if (level !== "full") {
      const admins = await usableAdminIds();
      if (admins.length <= 1 && admins.includes(id)) {
        return fail(
          "This is the last admin with full access. Give somebody else full admin access first.",
        );
      }
    }

    const [row] = await db
      .update(users)
      .set({ accessLevel: level })
      .where(eq(users.id, id))
      .returning({ name: users.name });

    if (!row) return fail("That account no longer exists.");

    await db.insert(activityLog).values({
      actorId: admin.id,
      action: "user-access",
      entity: "user",
      entityId: id,
      detail: { level, name: row.name },
    });

    revalidatePath("/admin/team");

    const message = {
      full: `${row.name} has full access again.`,
      read_only: `${row.name} can sign in but can no longer record sales.`,
      blocked: `${row.name} can no longer sign in.`,
    }[level];

    return ok(message);
  } catch (err) {
    return toActionError(err);
  }
}

/**
 * Permanently delete an account.
 *
 * Their sales are NOT deleted - `sales.staff_id` is ON DELETE SET NULL, so the
 * orders survive and simply stop naming anybody. That is the honest trade, and
 * the UI states the exact number of orders affected before asking. Use
 * `setUserAccess(id, "blocked")` instead when the history should keep the name,
 * which is almost always the better choice.
 */
export async function deleteUser(id: string): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();

    if (id === admin.id) return fail("You cannot delete your own account.");

    const [target] = await db
      .select({ name: users.name, role: users.role })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    if (!target) return fail("That account no longer exists.");

    if (target.role === "admin") {
      const admins = await usableAdminIds();
      if (admins.length <= 1 && admins.includes(id)) {
        return fail("This is the last admin with full access - you would lock everyone out.");
      }
    }

    // Count first: once the row is gone the link is gone with it.
    const [{ count: orderCount }] = await db
      .select({ count: dsql<number>`count(*)::int` })
      .from(sales)
      .where(eq(sales.staffId, id));

    await db.delete(users).where(eq(users.id, id));

    await db.insert(activityLog).values({
      actorId: admin.id,
      action: "user-delete",
      entity: "user",
      entityId: id,
      detail: { name: target.name, role: target.role, ordersUnlinked: orderCount },
    });

    revalidatePath("/admin/team");
    return ok(
      orderCount > 0
        ? `${target.name} deleted. ${orderCount} past order${orderCount === 1 ? "" : "s"} now show no name.`
        : `${target.name} deleted.`,
    );
  } catch (err) {
    return toActionError(err);
  }
}
