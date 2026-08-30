"use server";
/**
 * Sign in / sign out / change code.
 *
 * Deliberately forgiving about the name (case and spacing) and strict about
 * the code. Failures are reported with one generic message so the form cannot
 * be used to discover which names exist.
 */
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users, activityLog } from "@/db/schema";
import {
  canSignIn,
  createSession,
  destroySession,
  getSessionUser,
  hashPassword,
  normaliseHandle,
  requireUser,
  validatePassword,
  verifyPassword,
} from "@/lib/auth";

export type FormState = { ok: boolean; error?: string; message?: string } | null;

const GENERIC = "That name and code do not match. Please try again.";

export async function login(_prev: FormState, formData: FormData): Promise<FormState> {
  const name = String(formData.get("name") ?? "");
  const code = String(formData.get("code") ?? "");

  if (!name.trim()) return { ok: false, error: "Enter your name." };
  if (!/^\d{4,10}$/.test(code)) return { ok: false, error: "Enter your 6-digit code." };

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.handle, normaliseHandle(name)))
    .limit(1);

  // Hash even when the user is missing, so a wrong name and a wrong code take
  // the same amount of time.
  const stored = user?.passwordHash ?? "scrypt$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAA";
  const valid = await verifyPassword(code, stored);

  if (!user || !valid) return { ok: false, error: GENERIC };
  // Read-only accounts may still sign in; only "blocked" is turned away here.
  if (!canSignIn(user.accessLevel)) {
    return {
      ok: false,
      error: "This account has been switched off. Ask an admin to turn it back on.",
    };
  }

  await createSession({
    id: user.id,
    name: user.name,
    role: user.role,
    avatar: user.avatar,
  });

  await db
    .update(users)
    .set({ lastSeenAt: new Date() })
    .where(eq(users.id, user.id));

  await db.insert(activityLog).values({
    actorId: user.id,
    action: "login",
    entity: "user",
    entityId: user.id,
  });

  // An admin's first visit is where they swap the seeded code for a real
  // password and add the email a reset link would go to - both live on the
  // profile. Staff only have a code, so the simpler screen still fits them.
  if (user.mustChangePassword) redirect(user.role === "admin" ? "/profile?setup=1" : "/change-code");
  redirect(user.role === "admin" ? "/admin" : "/staff");
}

export async function logout() {
  const user = await getSessionUser();
  if (user) {
    await db.insert(activityLog).values({
      actorId: user.id,
      action: "logout",
      entity: "user",
      entityId: user.id,
    });
  }
  await destroySession();
  redirect("/login");
}

export async function changeCode(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireUser();
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  const [user] = await db.select().from(users).where(eq(users.id, session.id)).limit(1);
  if (!user) return { ok: false, error: "Account not found." };

  if (!(await verifyPassword(current, user.passwordHash))) {
    return { ok: false, error: "Your current code is not right." };
  }
  if (next !== confirm) return { ok: false, error: "The two new codes do not match." };

  const problem = validatePassword(next);
  if (problem) return { ok: false, error: problem };
  if (next === current) return { ok: false, error: "Choose a code you have not used before." };

  await db
    .update(users)
    .set({ passwordHash: await hashPassword(next), mustChangePassword: false })
    .where(eq(users.id, user.id));

  await db.insert(activityLog).values({
    actorId: user.id,
    action: "change-code",
    entity: "user",
    entityId: user.id,
  });

  revalidatePath("/", "layout");
  redirect(user.role === "admin" ? "/admin" : "/staff");
}
