/**
 * Password hashing, deliberately free of any Next.js import so that CLI
 * scripts (seeding, admin recovery) can use exactly the same code path as the
 * running app.
 *
 * scrypt from node:crypto - no native build step, no extra dependency, and
 * memory-hard enough that a 6-digit code is not trivially brute-forced from a
 * database dump.
 */
import { randomBytes, scrypt as _scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(_scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/** ~64 MB of memory per hash: slow for an attacker, invisible to a user. */
const PARAMS = { N: 16384, r: 8, p: 1, maxmem: 96 * 1024 * 1024 };

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 64, PARAMS);
  return `scrypt$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltB64, keyB64] = stored.split("$");
  if (scheme !== "scrypt" || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, "base64url");
  const actual = await scrypt(password, Buffer.from(saltB64, "base64url"), expected.length, PARAMS);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** Login handles are case- and space-insensitive: "Aster  M" -> "aster m". */
export const normaliseHandle = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ");

/** Staff codes are exactly 6 digits - fast on a phone keypad, easy to recall. */
export const PASSWORD_LENGTH = 6;

/**
 * Staff use a 6-digit code because they type it many times a shift on a phone
 * behind a counter. Admins use a real password: their account can see every
 * number in the business and can be reset over email, so it is worth more to
 * an attacker and is typed far less often.
 */
export function validateCode(code: string): string | null {
  if (!/^\d{6}$/.test(code)) return "The code must be exactly 6 digits.";
  if (/^(\d)\1{5}$/.test(code)) return "Do not use the same digit six times.";
  if (["123456", "654321", "012345", "123123"].includes(code)) {
    return "That code is too easy to guess.";
  }
  return null;
}

const WEAK_PASSWORDS = new Set([
  "password", "password1", "12345678", "qwertyui", "letmein1",
  "admin123", "restaurant", "abcd1234", "11111111",
]);

export function validateAdminPassword(password: string): string | null {
  if (password.length < 8) return "The password must be at least 8 characters.";
  if (password.length > 200) return "That password is too long.";
  if (!/[a-zA-Z]/.test(password)) return "Include at least one letter.";
  if (!/\d/.test(password)) return "Include at least one number.";
  if (WEAK_PASSWORDS.has(password.toLowerCase())) return "That password is too easy to guess.";
  return null;
}

/** Picks the right rule for the role. */
export function validateSecret(secret: string, role: "admin" | "staff"): string | null {
  return role === "admin" ? validateAdminPassword(secret) : validateCode(secret);
}

/** Kept for the seed and reset scripts, which only ever deal with codes. */
export const validatePassword = validateCode;

export const isValidEmail = (email: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());

export function randomCode(): string {
  for (;;) {
    const code = String(randomBytes(4).readUInt32BE(0) % 1_000_000).padStart(6, "0");
    if (!validatePassword(code)) return code;
  }
}
