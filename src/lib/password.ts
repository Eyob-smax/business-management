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

export function validatePassword(password: string): string | null {
  if (!/^\d{6}$/.test(password)) return "The code must be exactly 6 digits.";
  if (/^(\d)\1{5}$/.test(password)) return "Do not use the same digit six times.";
  if (["123456", "654321", "012345", "123123"].includes(password)) {
    return "That code is too easy to guess.";
  }
  return null;
}

export function randomCode(): string {
  for (;;) {
    const code = String(randomBytes(4).readUInt32BE(0) % 1_000_000).padStart(6, "0");
    if (!validatePassword(code)) return code;
  }
}
