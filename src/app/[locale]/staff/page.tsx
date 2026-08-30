import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { canWrite, getAuthedUser } from "@/lib/auth";
import { getMenuSnapshot } from "@/lib/menu";
import { getBusinessSettings } from "@/lib/settings";
import { Till } from "@/components/staff/till";

export const metadata: Metadata = { title: "Sell" };

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
      timezone={business.timezone}
      dayCutoffHour={business.dayCutoffHour}
      canRecord={canWrite(user.accessLevel)}
    />
  );
}
