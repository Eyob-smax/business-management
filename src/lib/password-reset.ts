import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, gt, isNull, lt, or } from "drizzle-orm";
import { db } from "@/db";
import { passwordResets, users } from "@/db/schema";
import { hashPassword } from "./password";

/**
 * Password reset over email. Admins only - staff have no email and recover
 * through an admin resetting their code.
 *
 * Rules that make this safe rather than a back door:
 *  - Only the SHA-256 of the token is stored. A database dump does not hand
 *    anybody a working reset link.
 *  - One use. Consuming a token marks it used in the same statement that
 *    checks it, so a link cannot be replayed.
 *  - Short lived, and requesting a new link invalidates the outstanding ones.
 *  - Requesting a reset for an unknown address behaves identically to a known
 *    one, so the form cannot be used to discover who has an account.
 */

const TOKEN_TTL_MINUTES = 45;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export type ResetRequest = {
  /** The raw token, only ever in the email. Never stored, never logged. */
  token: string;
  expiresAt: Date;
};

/**
 * Issues a token for an admin with this email, or null if there is no such
 * admin. Callers MUST behave the same either way.
 */
export async function createResetToken(
  email: string,
  requestedIp?: string | null,
): Promise<{ request: ResetRequest; userId: string; name: string } | null> {
  const normalised = email.trim().toLowerCase();

  const [user] = await db
    .select({ id: users.id, name: users.name, role: users.role, accessLevel: users.accessLevel })
    .from(users)
    .where(eq(users.email, normalised))
    .limit(1);

  // Staff and blocked accounts cannot reset by email even if an address exists.
  if (!user || user.role !== "admin" || user.accessLevel === "blocked") return null;

  // A new request supersedes any outstanding one for this account.
  await db
    .update(passwordResets)
    .set({ usedAt: new Date() })
    .where(and(eq(passwordResets.userId, user.id), isNull(passwordResets.usedAt)));

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MINUTES * 60_000);

  await db.insert(passwordResets).values({
    userId: user.id,
    tokenHash: hashToken(token),
    expiresAt,
    requestedIp: requestedIp?.slice(0, 60) ?? null,
  });

  return { request: { token, expiresAt }, userId: user.id, name: user.name };
}

export type ConsumeResult =
  | { ok: true; userId: string; name: string }
  | { ok: false; reason: "invalid" | "expired" | "used" };

/**
 * Validates a token without consuming it - used to decide whether to render
 * the "choose a new password" form or an "this link has expired" message.
 */
export async function inspectResetToken(token: string): Promise<ConsumeResult> {
  if (!token || token.length < 20) return { ok: false, reason: "invalid" };

  const [row] = await db
    .select({
      id: passwordResets.id,
      userId: passwordResets.userId,
      expiresAt: passwordResets.expiresAt,
      usedAt: passwordResets.usedAt,
      name: users.name,
    })
    .from(passwordResets)
    .innerJoin(users, eq(users.id, passwordResets.userId))
    .where(eq(passwordResets.tokenHash, hashToken(token)))
    .limit(1);

  if (!row) return { ok: false, reason: "invalid" };
  if (row.usedAt) return { ok: false, reason: "used" };
  if (row.expiresAt.getTime() < Date.now()) return { ok: false, reason: "expired" };

  return { ok: true, userId: row.userId, name: row.name };
}

/**
 * Sets the new password and burns the token.
 *
 * The token is marked used in a conditional UPDATE, so two requests racing
 * with the same link cannot both succeed.
 */
export async function consumeResetToken(
  token: string,
  newPassword: string,
): Promise<ConsumeResult> {
  const check = await inspectResetToken(token);
  if (!check.ok) return check;

  const claimed = await db
    .update(passwordResets)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(passwordResets.tokenHash, hashToken(token)),
        isNull(passwordResets.usedAt),
        gt(passwordResets.expiresAt, new Date()),
      ),
    )
    .returning({ userId: passwordResets.userId });

  if (claimed.length === 0) return { ok: false, reason: "used" };

  await db
    .update(users)
    .set({ passwordHash: await hashPassword(newPassword), mustChangePassword: false })
    .where(eq(users.id, claimed[0].userId));

  return check;
}

/** Housekeeping: drop tokens that are spent or long past. */
export async function pruneResetTokens() {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  await db
    .delete(passwordResets)
    .where(or(lt(passwordResets.expiresAt, cutoff), lt(passwordResets.createdAt, cutoff)));
}

/** Constant-time compare, for anywhere a raw token is checked directly. */
export function tokensMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}
