import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Stable id for offline-created rows. Falls back for older WebViews. */
export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `id_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

/** Deterministic accent per string, so a dish keeps its colour across charts. */
export function hashIndex(input: string, buckets: number) {
  let h = 0;
  for (let i = 0; i < input.length; i++) h = (h * 31 + input.charCodeAt(i)) | 0;
  return Math.abs(h) % buckets;
}

export const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/** Percent change from a to b, treating 0 -> n as +100%. */
export function deltaPct(prev: number, next: number): number | null {
  if (prev === 0) return next === 0 ? 0 : null;
  return ((next - prev) / Math.abs(prev)) * 100;
}
