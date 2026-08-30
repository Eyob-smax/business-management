import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { canSignIn, getAuthedUser, getCurrentUserRecord } from "@/lib/auth";
import { ChangeCodeForm } from "@/components/auth/change-code-form";

/** The browser tab, in the reader's own language. */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Meta");
  return { title: t("changeCode") };
}

export default async function ChangeCodePage() {
  const gate = await getAuthedUser();
  if (!gate) redirect("/login");
  if (!canSignIn(gate.accessLevel)) redirect("/login?blocked=1");

  const user = await getCurrentUserRecord();
  if (!user) redirect("/login");

  return (
    <main className="flex min-h-dvh flex-col justify-center px-5 py-10">
      <div className="mx-auto w-full max-w-sm">
        <header className="mb-6">
          <h1 className="text-[24px] leading-tight font-bold tracking-tight text-ink">
            {user.mustChangePassword ? "Choose your own code" : "Change your code"}
          </h1>
          <p className="mt-1.5 text-[14px] leading-relaxed text-ink-3">
            {user.mustChangePassword
              ? `Welcome, ${user.name}. Pick a 6-digit code only you know - you will use it every time you sign in.`
              : "Pick a new 6-digit code."}
          </p>
        </header>

        <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-card">
          <ChangeCodeForm forced={user.mustChangePassword} role={user.role} />
        </div>
      </div>
    </main>
  );
}
