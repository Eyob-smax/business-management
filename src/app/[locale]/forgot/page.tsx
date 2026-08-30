import type { Metadata } from "next";
import { getBusinessSettings } from "@/lib/settings";
import { isMailConfigured } from "@/lib/mail";
import { ForgotPasswordForm } from "@/components/auth/reset-forms";
import { getTranslations } from "next-intl/server";

/** The browser tab, in the reader's own language. */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Meta");
  return { title: t("forgot") };
}

export default async function ForgotPage() {
  const business = await getBusinessSettings().catch(() => null);
  const t = await getTranslations("Reset");

  return (
    <main className="flex min-h-dvh flex-col justify-center px-5 py-10">
      <div className="mx-auto w-full max-w-sm">
        <header className="mb-6 text-center">
          <h1 className="text-[22px] leading-tight font-bold tracking-tight text-ink">
            {t("forgotTitle")}
          </h1>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-3">
            {business?.restaurantName ?? "Business Manager"}
          </p>
        </header>

        <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-card">
          {!isMailConfigured() ? (
            <p className="mb-4 rounded-[14px] bg-warn-soft px-3.5 py-3 text-[12.5px] leading-relaxed text-warn">
              {t("mailNotConfigured")}
            </p>
          ) : null}
          <ForgotPasswordForm />
        </div>
      </div>
    </main>
  );
}
