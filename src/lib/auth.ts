/**
 * Authentication: name + 6-digit password, signed-cookie sessions.
 *
 * Server-only. Passwords are hashed with scrypt from node:crypto (no native
 * build step, no extra dependency). Sessions are stateless JWTs in an
 * httpOnly cookie so a staff phone stays logged in across offline restarts -
 * which matters, because a waitress must be able to open the app and keep
 * ringing up sales with no network at all.
 */
import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users, type User } from "@/db/schema";
import {
  ACCESS,
  WRITE_BLOCKED_CODE,
  canSignIn,
  canWrite,
  type AccessLevel,
} from "./access";

export { ACCESS, ACCESS_LEVELS, canSignIn, canWrite, type AccessLevel } from "./access";

export {
  hashPassword,
  verifyPassword,
  normaliseHandle,
  validatePassword,
  validateCode,
  validateAdminPassword,
  validateSecret,
  isValidEmail,
  randomCode,
  PASSWORD_LENGTH,
} from "./password";

const COOKIE = "bm_session";

/**
 * 24 hours, refreshed on every authenticated request (see `touchSession`).
 *
 * A phone in daily use therefore never expires. The case to know about: a
 * device left offline for more than a day cannot renew, so it asks for a
 * sign-in when it next has signal. Nothing is lost when that happens - queued
 * sales stay in the outbox, a 401 is treated as "retry later" rather than a
 * reason to discard, and they sync straight after the new sign-in.
 */
const SESSION_HOURS = 24;
/** Renew when less than this is left, so we are not re-signing every request. */
const RENEW_WHEN_UNDER_HOURS = 20;

function secret(): Uint8Array {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) {
    throw new Error("SESSION_SECRET is missing or too short (need 16+ chars).");
  }
  return new TextEncoder().encode(s);
}

/* ---------------------------------------------------------------- sessions */

export type SessionUser = {
  id: string;
  name: string;
  role: "admin" | "staff";
  avatar: string;
};

export async function createSession(user: SessionUser) {
  const token = await new SignJWT({
    sub: user.id,
    name: user.name,
    role: user.role,
    avatar: user.avatar,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_HOURS}h`)
    .sign(secret());

  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_HOURS * 60 * 60,
  });
}

/**
 * Slide the session forward once it is more than a fifth used.
 *
 * Best effort on purpose: a cookie cannot be set while a response is already
 * streaming, so this throws in some render paths and the failure is swallowed.
 * A missed renewal costs a sign-in, never data.
 */
async function touchSession(payload: {
  sub?: string;
  name?: unknown;
  role?: unknown;
  avatar?: unknown;
  exp?: number;
}) {
  if (!payload.exp || !payload.sub) return;
  const secondsLeft = payload.exp - Math.floor(Date.now() / 1000);
  if (secondsLeft > RENEW_WHEN_UNDER_HOURS * 3600) return;

  try {
    await createSession({
      id: payload.sub,
      name: String(payload.name ?? "User"),
      role: payload.role === "admin" ? "admin" : "staff",
      avatar: String(payload.avatar ?? "\u{1F464}"),
    });
  } catch {
    /* read-only render context - the next mutation renews it instead */
  }
}

export async function destroySession() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

/** Current user from the cookie, or null. Never throws on a bad token. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (!payload.sub) return null;

    // Keeps an actively used phone signed in without widening the window a
    // stolen cookie stays valid for.
    await touchSession(payload as Parameters<typeof touchSession>[0]);

    return {
      id: payload.sub,
      name: String(payload.name ?? "User"),
      role: payload.role === "admin" ? "admin" : "staff",
      avatar: String(payload.avatar ?? "\u{1F464}"),
    };
  } catch {
    return null;
  }
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new AuthError("Not signed in");
  return user;
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

/** Thrown when the person is signed in but not allowed to do this. */
export class AccessError extends Error {
  readonly code: string;
  readonly accessLevel: AccessLevel;

  constructor(message: string, accessLevel: AccessLevel, code = WRITE_BLOCKED_CODE) {
    super(message);
    this.name = "AccessError";
    this.code = code;
    this.accessLevel = accessLevel;
  }
}

/* ------------------------------------------------------- access enforcement */

export type AuthedUser = SessionUser & {
  accessLevel: AccessLevel;
  mustChangePassword: boolean;
};

/**
 * The signed-in person as the DATABASE currently sees them.
 *
 * The session cookie lasts 120 days, so it cannot be the authority on what
 * somebody is allowed to do - an admin who blocks a phone at 2pm needs that to
 * bite immediately, not at the next login. Role and access level are therefore
 * always re-read here, and `cache` collapses that to one query per request no
 * matter how many guards ask.
 *
 * Returns null if there is no session, or the account has since been deleted.
 */
export const getAuthedUser = cache(async function getAuthedUser(): Promise<AuthedUser | null> {
  const session = await getSessionUser();
  if (!session) return null;

  const [row] = await db
    .select({
      id: users.id,
      name: users.name,
      role: users.role,
      avatar: users.avatar,
      accessLevel: users.accessLevel,
      mustChangePassword: users.mustChangePassword,
    })
    .from(users)
    .where(eq(users.id, session.id))
    .limit(1);

  if (!row) return null;

  return {
    id: row.id,
    name: row.name,
    role: row.role,
    avatar: row.avatar,
    accessLevel: row.accessLevel,
    mustChangePassword: row.mustChangePassword,
  };
});

/** Signed in and still allowed through the door. Null otherwise. */
export async function getActiveUser(): Promise<AuthedUser | null> {
  const user = await getAuthedUser();
  if (!user || !canSignIn(user.accessLevel)) return null;
  return user;
}

export async function requireActiveUser(): Promise<AuthedUser> {
  const user = await getAuthedUser();
  if (!user) throw new AuthError("Not signed in");
  if (!canSignIn(user.accessLevel)) {
    throw new AccessError(ACCESS[user.accessLevel].writeDeniedMessage, user.accessLevel, "blocked");
  }
  return user;
}

/**
 * The guard every write goes through. Read-only staff get a clear reason
 * rather than a silent failure, and the caller decides whether that reason is
 * shown in a toast or returned to a syncing device.
 */
export async function requireWriteAccess(): Promise<AuthedUser> {
  const user = await requireActiveUser();
  if (!canWrite(user.accessLevel)) {
    throw new AccessError(ACCESS[user.accessLevel].writeDeniedMessage, user.accessLevel);
  }
  return user;
}

/** Role is re-read from the database, so a demoted admin loses access at once. */
export async function requireAdmin(): Promise<AuthedUser> {
  const user = await requireActiveUser();
  if (user.role !== "admin") throw new AuthError("Admins only");
  return user;
}

/** Full DB record for the signed-in user (settings pages need more than the JWT). */
export async function getCurrentUserRecord(): Promise<User | null> {
  const session = await getSessionUser();
  if (!session) return null;
  const [row] = await db.select().from(users).where(eq(users.id, session.id)).limit(1);
  return row ?? null;
}
