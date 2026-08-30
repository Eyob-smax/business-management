import type { Metadata } from "next";
import { getBusinessSettings } from "@/lib/settings";
import { ShiftView } from "@/components/staff/shift-view";

export const metadata: Metadata = { title: "My sales" };

export default async function ShiftPage() {
  const business = await getBusinessSettings();
  return (
    <ShiftView timezone={business.timezone} dayCutoffHour={business.dayCutoffHour} />
  );
}
