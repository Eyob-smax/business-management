import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getBusinessSettings } from "@/lib/settings";
import { requireActiveUser } from "@/lib/auth";
import { ShiftView } from "@/components/staff/shift-view";

/** The browser tab, in the reader's own language. */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Meta");
  return { title: t("mySales") };
}

export default async function ShiftPage() {
  const [business, user] = await Promise.all([getBusinessSettings(), requireActiveUser()]);
  return (
    <ShiftView
      timezone={business.timezone}
      dayCutoffHour={business.dayCutoffHour}
      staffId={user.id}
    />
  );
}
