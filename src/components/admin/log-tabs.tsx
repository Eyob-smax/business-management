"use client";
import { useRouter } from "next/navigation";
import type { Grain } from "@/lib/dates";
import { Segmented } from "@/components/ui/primitives";

/** Orders / Notes switch that keeps the selected period in the URL. */
export function LogTabs({
  tab,
  grain,
  on,
  orderCount,
  noteCount,
}: {
  tab: "orders" | "notes";
  grain: Grain;
  on: string;
  orderCount: number;
  noteCount: number;
}) {
  const router = useRouter();

  return (
    <Segmented<"orders" | "notes">
      value={tab}
      onChange={(next) =>
        router.push(`/admin/log?grain=${grain}&on=${on}&tab=${next}`, { scroll: false })
      }
      options={[
        { value: "orders", label: `Orders (${orderCount})` },
        { value: "notes", label: `Notes (${noteCount})` },
      ]}
    />
  );
}
