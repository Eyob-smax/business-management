/** Shared shape for every server action, so forms can render errors uniformly. */
export type ActionResult = {
  ok: boolean;
  error?: string;
  message?: string;
  /** Field-level messages, keyed by input name. */
  fields?: Record<string, string>;
};

export const ok = (message?: string): ActionResult => ({ ok: true, message });
export const fail = (error: string, fields?: Record<string, string>): ActionResult => ({
  ok: false,
  error,
  fields,
});

/** Turn an unexpected throw into something a person can read. */
export function toActionError(err: unknown): ActionResult {
  if (err instanceof Error) {
    if (/unique|duplicate key/i.test(err.message)) {
      return fail("Something with that name already exists.");
    }
    return fail(err.message.slice(0, 200));
  }
  return fail("Something went wrong. Please try again.");
}
