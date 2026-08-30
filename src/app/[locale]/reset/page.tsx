import type { Metadata } from "next";
import { Link } from "@/i18n/routing";
import { TriangleAlert } from "lucide-react";
import { getBusinessSettings } from "@/lib/settings";
import { inspectResetToken } from "@/lib/password-reset";
import { ResetPasswordForm } from "@/components/auth/reset-forms";
import { Button } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Choose a new password" };

/**
 * The token is checked before the form is rendered, so an expired or spent
 * link says so immediately rather than after somebody types a new password
 * twice.
 */
export default async function ResetPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token = "" } = await searchParams;
  const [business, check] = await Promise.all([
    getBusinessSettings().catch(() => null),
    inspectResetToken(token),
  ]);

  return (
    <main className="flex min-h-dvh flex-col justify-center px-5 py-10">
      <div className="mx-auto w-full max-w-sm">
        <header className="mb-6 text-center">
          <h1 className="text-[22px] leading-tight font-bold tracking-tight text-ink">
            {check.ok ? "Choose a new password" : "This link cannot be used"}
          </h1>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-3">
            {check.ok ? `Signing in as ${check.name}` : (business?.restaurantName ?? "")}
          </p>
        </header>

        <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-card">
          {check.ok ? (
            <ResetPasswordForm token={token} />
          ) : (
            <div className="space-y-4">
              <p className="flex items-start gap-2 rounded-[14px] bg-loss-soft px-3.5 py-3 text-[13px] leading-snug font-medium text-loss">
                <TriangleAlert className="mt-px size-4 shrink-0" />
                {check.reason === "expired"
                  ? "That link has expired. Reset links last 45 minutes."
                  : check.reason === "used"
                    ? "That link has already been used."
                    : "That link is not valid."}
              </p>
              <Link href="/forgot" className="block">
                <Button variant="primary" block>
                  Ask for a new link
                </Button>
              </Link>
              <Link
                href="/login"
                className="block text-center text-[13px] font-medium text-ink-3 underline-offset-4 hover:underline"
              >
                Back to sign in
              </Link>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
