import { redirect } from "next/navigation";
import { ClipboardList, MessageSquare, Store } from "lucide-react";
import { canSignIn, getAuthedUser } from "@/lib/auth";
import { getBusinessSettings } from "@/lib/settings";
import { AppHeader } from "@/components/shell/app-header";
import { BottomNav } from "@/components/shell/bottom-nav";
import { OfflineWarmer } from "@/components/pwa/offline-warmer";
import { getTranslations } from 'next-intl/server';

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  // Access is re-read from the database, so a block applies on the next page
  // load rather than whenever the 120-day session cookie happens to expire.
  const user = await getAuthedUser();
  if (!user) redirect("/login");
  if (!canSignIn(user.accessLevel)) redirect("/login?blocked=1");

  const business = await getBusinessSettings();
  const t = await getTranslations('StaffLayout');

  return (
    <div className="min-h-dvh">
      {/* The three screens staff move between all shift. */}
      <OfflineWarmer paths={["/staff", "/staff/shift", "/notes"]} />
      <AppHeader
        title={business.restaurantName}
        subtitle={t('signedInAs', { name: user.name })}
        user={user}
        showBell={user.role === "admin"}
      />

      <main className="mx-auto max-w-3xl px-4 pt-2 pb-20">{children}</main>

      <BottomNav
        items={[
          { href: "/staff", label: t('sell'), icon: <Store className="size-[21px]" /> },
          {
            href: "/staff/shift",
            label: t('mySales'),
            icon: <ClipboardList className="size-[21px]" />,
          },
          { href: "/notes", label: t('notes'), icon: <MessageSquare className="size-[21px]" /> },
        ]}
      />
    </div>
  );
}
