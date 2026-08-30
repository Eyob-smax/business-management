import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { CircleCheck, ShieldAlert } from "lucide-react";
import { getActiveUser } from "@/lib/auth";
import { getBusinessSettings } from "@/lib/settings";
import { LoginForm } from "@/components/auth/login-form";
import { InstallHint } from "@/components/pwa/install-hint";
import { PurgePrivateCache } from "@/components/pwa/purge-cache";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import { getTranslations } from 'next-intl/server';

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ blocked?: string; reset?: string }>;
}) {
  const { blocked, reset } = await searchParams;
  // getActiveUser, not getSessionUser: a blocked account still has a valid
  // cookie, and redirecting it onwards would bounce between here and the
  // layout forever.
  const user = await getActiveUser();
  if (user) redirect(user.role === "admin" ? "/admin" : "/staff");

  const business = await getBusinessSettings().catch(() => null);
  const t = await getTranslations('LoginPage');

  return (
    <main className="flex min-h-dvh flex-col justify-center px-5 py-10 relative">
      <LanguageSwitcher />
      {/* A phone reaching this screen may be changing hands. */}
      <PurgePrivateCache />
      <div className="mx-auto w-full max-w-sm">
        <header className="mb-8 text-center">
          <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-[20px] bg-gradient-to-br from-brand to-brand-strong shadow-card">
            {/* Same mark as the app icon: rising bars on a plate. */}
            <svg viewBox="0 0 24 24" className="size-8" aria-hidden>
              <circle cx="12" cy="12" r="10" fill="none" stroke="white" strokeOpacity="0.45" strokeWidth="1.6" />
              <rect x="7.1" y="13.4" width="2.6" height="4.1" rx="1.2" fill="white" />
              <rect x="10.7" y="10.8" width="2.6" height="6.7" rx="1.2" fill="white" />
              <rect x="14.3" y="8.3" width="2.6" height="9.2" rx="1.2" fill="white" />
            </svg>
          </div>
          <h1 className="text-[26px] leading-tight font-bold tracking-tight text-ink">
            {business?.restaurantName ?? t('title')}
          </h1>
          <p className="mt-1.5 text-[14px] text-ink-3">
            {t('subtitle')}
          </p>
        </header>

        {reset ? (
          <div className="mb-4 flex items-start gap-2.5 rounded-[var(--radius-card)] border border-profit/30 bg-profit-soft p-4">
            <CircleCheck className="mt-px size-4 shrink-0 text-profit" />
            <p className="text-[13px] leading-relaxed font-medium text-profit">
              Your password has been changed. Sign in with your name and the new password.
            </p>
          </div>
        ) : null}

        {blocked ? (
          <div className="mb-4 flex items-start gap-2.5 rounded-[var(--radius-card)] border border-loss/30 bg-loss-soft p-4">
            <ShieldAlert className="mt-px size-4 shrink-0 text-loss" />
            <div>
              <p className="text-[13.5px] font-bold text-loss">{t('accountSwitchedOff')}</p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-loss">
                {t('accountSwitchedOffDescription')}
              </p>
            </div>
          </div>
        ) : null}

        <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-card">
          <LoginForm />
        </div>

        <InstallHint className="mt-6" />
      </div>
    </main>
  );
}
