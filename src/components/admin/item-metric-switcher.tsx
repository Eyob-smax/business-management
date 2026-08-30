"use client";
import * as React from "react";
import type { ItemPerf } from "@/lib/analytics";
import { Segmented } from "@/components/ui/primitives";
import { ItemPerformanceList } from "./item-performance-list";

type Metric = "revenue" | "profit" | "qty";

/**
 * Same dishes, three questions: what brings in the most money, what actually
 * keeps the most, and what simply sells the most. They rarely agree, and the
 * gap between them is usually where the pricing decision is.
 */
export function ItemMetricSwitcher({
  items,
  lowMarginPct,
  limit,
}: {
  items: ItemPerf[];
  lowMarginPct: number;
  limit?: number;
}) {
  const [metric, setMetric] = React.useState<Metric>("revenue");

  return (
    <div>
      <div className="px-4">
        <Segmented<Metric>
          value={metric}
          onChange={setMetric}
          size="sm"
          options={[
            { value: "revenue", label: "Money in" },
            { value: "profit", label: "Money kept" },
            { value: "qty", label: "Plates sold" },
          ]}
        />
      </div>

      <p className="px-4 pt-2.5 text-[12px] leading-snug text-ink-3">
        {metric === "revenue"
          ? "Ranked by what customers paid."
          : metric === "profit"
            ? "Ranked by what is left after the per-plate cost estimate."
            : "Ranked by how many went out of the kitchen."}
      </p>

      <div className="px-4 pb-2">
        <ItemPerformanceList
          items={items}
          metric={metric}
          limit={limit}
          lowMarginPct={lowMarginPct}
          href={(i) => `/admin/dish/${i.menuItemId}`}
        />
      </div>
    </div>
  );
}
