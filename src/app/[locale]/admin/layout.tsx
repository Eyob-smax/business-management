import { redirect } from "next/navigation";
import { BarChart3, LayoutDashboard, Notebook, Utensils, Wallet } from "lucide-react";
import { canSignIn, getAuthedUser } from "@/lib/auth";
import { getBusinessSettings } from "@/lib/settings";
import { countOpenIssues } from "@/lib/notes";
import { AppHeader } from "@/components/shell/app-header";
import { BottomNav } from "@/components/shell/bottom-nav";
import { OfflineWarmer } from "@/components/pwa/offline-warmer";
import { adminWarmPaths } from "@/lib/offline/warm-paths";
import { businessDateOf } from "@/lib/dates";
import { getTranslations } from 'next-intl/server';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getAuthedUser();
  if (!user) redirect("/login");
  if (!canSignIn(user.accessLevel)) redirect("/login?blocked=1");
  // Role comes from the database too, so a demoted admin loses these screens
  // immediately instead of keeping them until their cookie expires.
  if (user.role !== "admin") redirect("/staff");

  const [business, openIssues] = await Promise.all([
    getBusinessSettings(),
    countOpenIssues().catch(() => 0),
  ]);
  const t = await getTranslations('AdminLayout');
  // The day the range picker anchors to, so the warmed URLs are the ones its
  // buttons actually link to rather than near misses.
  const anchorDay = businessDateOf(new Date(), business.timezone, business.dayCutoffHour);

  return (
    <div className="min-h-dvh">
      {/* Every admin screen, filters included, saved for offline reading. */}
      <OfflineWarmer paths={adminWarmPaths(anchorDay)} />
      <AppHeader
        title={business.restaurantName}
        subtitle={t('ownerView')}
        user={user}
        showBell
      />

      <main className="mx-auto max-w-3xl px-4 pt-3 pb-20">{children}</main>

      <BottomNav
        items={[
          { href: "/admin", label: t('home'), icon: <LayoutDashboard className="size-[21px]" /> },
          {
            href: "/admin/analytics",
            label: t('reports'),
            icon: <BarChart3 className="size-[21px]" />,
          },
          {
            href: "/admin/log",
            label: t('dayLog'),
            icon: <Notebook className="size-[21px]" />,
            badge: openIssues,
          },
          { href: "/admin/expenses", label: t('money'), icon: <Wallet className="size-[21px]" /> },
          { href: "/admin/menu", label: t('menu'), icon: <Utensils className="size-[21px]" /> },
        ]}
      />
    </div>
  );
}
