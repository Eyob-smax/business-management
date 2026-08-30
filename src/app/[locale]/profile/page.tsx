import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { canSignIn, getAuthedUser } from "@/lib/auth";
import { getBusinessSettings } from "@/lib/settings";
import { AppHeader } from "@/components/shell/app-header";
import { RoleNav } from "@/components/shell/role-nav";
import { ProfileForm } from "@/components/auth/profile-form";
import { NeedsInternet } from "@/components/pwa/needs-internet";
import { getTranslations } from "next-intl/server";

/** The browser tab, in the reader's own language. */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Meta");
  return { title: t("profile") };
}

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ setup?: string }>;
}) {
  const { setup } = await searchParams;
  const o = await getTranslations("Offline");
  const t = await getTranslations("Profile");
  const user = await getAuthedUser();
  if (!user) redirect("/login");
  if (!canSignIn(user.accessLevel)) redirect("/login?blocked=1");

  const [business, [row]] = await Promise.all([
    getBusinessSettings(),
    db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1),
  ]);

  return (
    <div className="min-h-dvh">
      <AppHeader
        title={business.restaurantName}
        subtitle={user.name}
        user={user}
        backHref={user.role === "admin" ? "/admin" : "/staff"}
        showBell={user.role === "admin"}
      />

      <main className="mx-auto max-w-3xl px-4 pt-3 pb-20">
        <header className="mb-4 px-1">
          <h1 className="text-[20px] leading-tight font-bold tracking-tight text-ink">
            {t("pageTitle")}
          </h1>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-3">
            {t("pageSubtitle")}
          </p>
        </header>

        {setup && user.mustChangePassword ? (
          <div className="mb-4 rounded-[var(--radius-card)] border border-brand/30 bg-brand-soft p-4">
            <p className="text-[14px] font-bold text-brand-ink">{t("setupTitle")}</p>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-brand-ink/85">
              {t("setupBody")}
            </p>
          </div>
        ) : null}

        <NeedsInternet message={o("needsInternetProfile")}>
          <ProfileForm
            user={{
              id: user.id,
              name: user.name,
              avatar: user.avatar,
              email: row?.email ?? null,
              role: user.role,
              mustChangePassword: user.mustChangePassword,
            }}
          />
        </NeedsInternet>
      </main>

      <RoleNav role={user.role} />
    </div>
  );
}
