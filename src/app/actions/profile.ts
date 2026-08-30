"use server";
/**
 * Profile and password recovery.
 *
 * Everything here needs the network on purpose - identity is not something to
 * change from a queued offline write. Offline begins after sign-in.
 */
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq, ne, and } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { activityLog, users } from "@/db/schema";
import {
  AccessError,
  createSession,
  hashPassword,
  isValidEmail,
  normaliseHandle,
  requireActiveUser,
  validateSecret,
  verifyPassword,
} from "@/lib/auth";
import { getBusinessSettings } from "@/lib/settings";
import { consumeResetToken, createResetToken } from "@/lib/password-reset";
import { isMailConfigured, resetEmail, sendMail } from "@/lib/mail";
import { fail, ok, toActionError, type ActionResult } from "./_result";

/* ------------------------------------------------------------------ profile */

const profileSchema = z.object({
  name: z.string().trim().min(2, "Enter your name.").max(40),
  avatar: z.string().trim().max(8),
  email: z.string().trim().max(160).optional(),
});

/**
 * Name, picture, and (admins only) the email a reset link would go to.
 *
 * Changing the name changes the login handle, so it re-issues the session
 * cookie - otherwise the header would greet them by the old name until the
 * cookie happened to expire.
 */
export async function updateProfile(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const me = await requireActiveUser();

    const parsed = profileSchema.safeParse({
      name: formData.get("name") ?? "",
      avatar: (formData.get("avatar") as string) || "\u{1F464}",
      email: (formData.get("email") as string) ?? "",
    });

    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Please check the form.");
    }
    const v = parsed.data;
    const handle = normaliseHandle(v.name);

    const clash = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.handle, handle), ne(users.id, me.id)))
      .limit(1);
    if (clash.length) {
      return fail(`Somebody already signs in as "${v.name}". Try adding a surname.`);
    }

    // Email is an admin concept: it exists to receive a reset link, and staff
    // recover through an admin instead.
    let email: string | null | undefined;
    if (me.role === "admin") {
      const raw = (v.email ?? "").trim().toLowerCase();
      if (raw) {
        if (!isValidEmail(raw)) return fail("That email address does not look right.");
        const taken = await db
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.email, raw), ne(users.id, me.id)))
          .limit(1);
        if (taken.length) return fail("Another admin is already using that email.");
        email = raw;
      } else {
        email = null;
      }
    }

    await db
      .update(users)
      .set({
        name: v.name,
        handle,
        avatar: v.avatar,
        ...(email !== undefined ? { email } : {}),
      })
      .where(eq(users.id, me.id));

    await createSession({ id: me.id, name: v.name, role: me.role, avatar: v.avatar });

    await db.insert(activityLog).values({
      actorId: me.id,
      action: "profile-update",
      entity: "user",
      entityId: me.id,
      detail: { name: v.name, emailSet: Boolean(email) },
    });

    revalidatePath("/", "layout");
    return ok("Profile saved.");
  } catch (err) {
    if (err instanceof AccessError) return fail(err.message);
    return toActionError(err);
  }
}

/* ---------------------------------------------------------- change secret */

/**
 * Change your own code (staff) or password (admin). The rule applied depends
 * on the role, not on what was typed.
 */
export async function changeSecret(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const me = await requireActiveUser();
    const current = String(formData.get("current") ?? "");
    const next = String(formData.get("next") ?? "");
    const confirm = String(formData.get("confirm") ?? "");

    const [row] = await db
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, me.id))
      .limit(1);
    if (!row) return fail("Account not found.");

    if (!(await verifyPassword(current, row.passwordHash))) {
      return fail(
        me.role === "admin"
          ? "Your current password is not right."
          : "Your current code is not right.",
      );
    }
    if (next !== confirm) return fail("The two new entries do not match.");
    if (next === current) return fail("Choose something you have not used before.");

    const problem = validateSecret(next, me.role);
    if (problem) return fail(problem);

    await db
      .update(users)
      .set({ passwordHash: await hashPassword(next), mustChangePassword: false })
      .where(eq(users.id, me.id));

    await db.insert(activityLog).values({
      actorId: me.id,
      action: "change-secret",
      entity: "user",
      entityId: me.id,
    });

    revalidatePath("/", "layout");
    return ok(me.role === "admin" ? "Password changed." : "Code changed.");
  } catch (err) {
    if (err instanceof AccessError) return fail(err.message);
    return toActionError(err);
  }
}

/* ------------------------------------------------------------ reset by email */

/**
 * Always reports success.
 *
 * Saying "no account with that email" would turn this form into a way to
 * discover which addresses belong to admins, so the answer is identical
 * whether or not the address exists.
 */
export async function requestPasswordReset(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const generic =
    "If that email belongs to an admin account, a reset link is on its way. It expires in 45 minutes.";

  try {
    const email = String(formData.get("email") ?? "").trim();
    if (!isValidEmail(email)) return fail("That email address does not look right.");

    if (!isMailConfigured()) {
      // A configuration gap must not masquerade as a delivered email.
      return fail(
        "Email is not set up on this server yet, so a reset link cannot be sent. Ask the other admin to reset your password from Team.",
      );
    }

    const hdrs = await headers();
    const issued = await createResetToken(
      email,
      hdrs.get("x-forwarded-for") ?? hdrs.get("x-real-ip"),
    );

    if (issued) {
      const business = await getBusinessSettings();
      const origin =
        process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "") ||
        `https://${hdrs.get("host") ?? "localhost:3000"}`;
      const url = `${origin}/reset?token=${encodeURIComponent(issued.request.token)}`;

      const { html, text } = resetEmail({
        name: issued.name,
        url,
        businessName: business.restaurantName,
        minutes: 45,
      });

      const sent = await sendMail({
        to: email.toLowerCase(),
        subject: `Reset your ${business.restaurantName} password`,
        html,
        text,
      });

      if (!sent.ok) {
        console.error("[reset] send failed", sent.error);
        return fail("The email could not be sent just now. Please try again in a minute.");
      }

      await db.insert(activityLog).values({
        actorId: issued.userId,
        action: "password-reset-requested",
        entity: "user",
        entityId: issued.userId,
      });
    }

    return ok(generic);
  } catch (err) {
    console.error("[reset] request failed", err);
    // Still generic: an internal error must not reveal whether the email existed.
    return ok(generic);
  }
}

export async function resetPassword(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const token = String(formData.get("token") ?? "");
    const next = String(formData.get("next") ?? "");
    const confirm = String(formData.get("confirm") ?? "");

    if (next !== confirm) return fail("The two passwords do not match.");

    const problem = validateSecret(next, "admin");
    if (problem) return fail(problem);

    const result = await consumeResetToken(token, next);
    if (!result.ok) {
      return fail(
        result.reason === "expired"
          ? "That link has expired. Ask for a new one."
          : result.reason === "used"
            ? "That link has already been used. Ask for a new one."
            : "That link is not valid. Ask for a new one.",
      );
    }

    await db.insert(activityLog).values({
      actorId: result.userId,
      action: "password-reset-completed",
      entity: "user",
      entityId: result.userId,
    });
  } catch (err) {
    return toActionError(err);
  }

  // Outside the try: redirect throws by design.
  redirect("/login?reset=1");
}
