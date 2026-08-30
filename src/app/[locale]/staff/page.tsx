import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { canWrite, getAuthedUser } from "@/lib/auth";
import { getMenuSnapshot } from "@/lib/menu";
import { getBusinessSettings } from "@/lib/settings";
import { Till } from "@/components/staff/till";

/** The browser tab, in the reader's own language. */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Meta");
  return { title: t("sell") };
}

/**
 * The menu is fetched server-side for the first paint and handed to the till,
 * which then keeps its own IndexedDB copy. A brand-new phone is therefore
 * offline-capable from its very first successful page load.
 */
export default async function StaffTillPage() {
  const user = await getAuthedUser();
  if (!user) redirect("/login");

  const [menu, business] = await Promise.all([
    getMenuSnapshot("restaurant").catch(() => null),
    getBusinessSettings(),
  ]);

  return (
    <Till
      initialMenu={menu}
      staffName={user.name}
      staffId={user.id}
      timezone={business.timezone}
      dayCutoffHour={business.dayCutoffHour}
      canRecord={canWrite(user.accessLevel)}
    />
  );
}
