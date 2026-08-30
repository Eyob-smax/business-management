/**
 * Access levels.
 *
 * One place decides what each level may do, so the UI, the server actions and
 * the sync endpoint can never disagree about it. No imports, no database - this
 * is policy, not enforcement. Enforcement lives in lib/auth.ts.
 *
 * The three levels exist because "switched off" is too blunt for a family
 * business. A waitress who is off sick should stop being able to ring up sales
 * without losing the ability to check what she sold last week; somebody who has
 * left should lose both.
 */

export type AccessLevel =
  /** Normal: can sign in, record sales, leave notes. */
  | "full"
  /** Can sign in and look at their own history, but cannot record anything. */
  | "read_only"
  /** Cannot sign in at all. */
  | "blocked";

export const ACCESS_LEVELS: AccessLevel[] = ["full", "read_only", "blocked"];

type AccessSpec = {
  /** May exchange a valid code (or an existing session) for access. */
  canSignIn: boolean;
  /** May create sales, notes and anything else that writes. */
  canWrite: boolean;
  label: string;
  /** Shown in the team list and in the banner the person sees. */
  description: string;
  /** Explanation shown to the affected person when they try to write. */
  writeDeniedMessage: string;
  tone: "profit" | "warn" | "loss";
};

export const ACCESS: Record<AccessLevel, AccessSpec> = {
  full: {
    canSignIn: true,
    canWrite: true,
    label: "Full access",
    description: "Can sign in and record sales.",
    writeDeniedMessage: "",
    tone: "profit",
  },
  read_only: {
    canSignIn: true,
    canWrite: false,
    label: "Read only",
    description: "Can sign in and see their own history, but cannot record anything.",
    writeDeniedMessage:
      "An admin has paused your ability to record sales. Anything you already saved is safe and will still be sent.",
    tone: "warn",
  },
  blocked: {
    canSignIn: false,
    canWrite: false,
    label: "No access",
    description: "Cannot sign in. Their past sales are kept.",
    writeDeniedMessage: "Your access has been switched off. Please speak to an admin.",
    tone: "loss",
  },
};

export const canSignIn = (level: AccessLevel) => ACCESS[level].canSignIn;
export const canWrite = (level: AccessLevel) => ACCESS[level].canWrite;

export function isAccessLevel(value: unknown): value is AccessLevel {
  return typeof value === "string" && (ACCESS_LEVELS as string[]).includes(value);
}

/** Machine-readable reason sent to a device whose write was refused. */
export const WRITE_BLOCKED_CODE = "write-blocked";
