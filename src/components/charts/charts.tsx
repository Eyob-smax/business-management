"use client";
/**
 * The chart set.
 *
 * Conventions held across every chart here, so the family reads as one system:
 *   revenue = blue, cost = orange, profit = aqua (validated palette, see
 *   globals.css). Revenue and profit share one money axis - there is never a
 *   second y-scale. Revenue is drawn as bars and profit as a line, which gives
 *   the pair a mark-shape difference on top of the hue difference. Grid and
 *   axes are recessive; a legend is present whenever two series are.
 */
import * as React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

const GRID = "var(--color-viz-grid)";
const AXIS_TICK = { fill: "var(--color-viz-axis)", fontSize: 11 };
const REVENUE = "var(--color-viz-revenue)";
const PROFIT = "var(--color-viz-profit)";
const COST = "var(--color-viz-cost)";

const moneyTick = (v: number) => formatMoney(v, { compact: true, symbol: false });

/* ------------------------------------------------------------------ tooltip */

type TipRow = { label: string; value: string; color?: string };

function TipCard({ title, rows }: { title: string; rows: TipRow[] }) {
  return (
    <div className="rounded-[12px] border border-line bg-surface px-3 py-2.5 shadow-lift">
      <p className="text-[12px] font-bold text-ink">{title}</p>
      <div className="mt-1.5 space-y-1">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-2.5 text-[12px]">
            {r.color ? (
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ background: r.color }}
                aria-hidden
              />
            ) : null}
            <span className="text-ink-3">{r.label}</span>
            <span className="nums ml-auto font-semibold text-ink">{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Small legend chip row. Always rendered for multi-series charts. */
export function Legend({
  items,
  className,
}: {
  items: { label: string; color: string; shape?: "bar" | "line" }[];
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-1.5", className)}>
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5 text-[12px] text-ink-2">
          {i.shape === "line" ? (
            <span className="h-0.5 w-3.5 rounded-full" style={{ background: i.color }} aria-hidden />
          ) : (
            <span className="size-2.5 rounded-[3px]" style={{ background: i.color }} aria-hidden />
          )}
          {i.label}
        </span>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------- trend chart */

export type TrendPoint = {
  label: string;
  revenueCents: number;
  costCents: number;
  profitCents: number;
};

export function TrendChart({
  data,
  height = 210,
  showProfit = true,
}: {
  data: TrendPoint[];
  height?: number;
  showProfit?: boolean;
}) {
  const hasLoss = data.some((d) => d.profitCents < 0);
  // Skip labels on dense ranges so the axis never collides with itself.
  const interval = data.length > 24 ? Math.ceil(data.length / 8) - 1 : data.length > 12 ? 1 : 0;

  return (
    <div>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 6, bottom: 0, left: -18 }}>
            <CartesianGrid stroke={GRID} strokeDasharray="3 4" vertical={false} />
            <XAxis
              dataKey="label"
              tick={AXIS_TICK}
              axisLine={false}
              tickLine={false}
              interval={interval}
              minTickGap={4}
            />
            <YAxis
              tick={AXIS_TICK}
              axisLine={false}
              tickLine={false}
              width={52}
              tickFormatter={moneyTick}
            />
            {hasLoss ? <ReferenceLine y={0} stroke="var(--color-viz-axis)" strokeWidth={1} /> : null}
            <Tooltip
              cursor={{ fill: "var(--color-surface-2)", radius: 6 }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as TrendPoint;
                return (
                  <TipCard
                    title={String(label)}
                    rows={[
                      { label: "Revenue", value: formatMoney(p.revenueCents), color: REVENUE },
                      { label: "Cost", value: formatMoney(p.costCents), color: COST },
                      { label: "Profit", value: formatMoney(p.profitCents), color: PROFIT },
                    ]}
                  />
                );
              }}
            />
            <Bar
              dataKey="revenueCents"
              fill={REVENUE}
              radius={[4, 4, 0, 0]}
              maxBarSize={26}
              isAnimationActive={false}
            />
            {showProfit ? (
              <Line
                type="monotone"
                dataKey="profitCents"
                stroke={PROFIT}
                strokeWidth={2}
                dot={data.length <= 14 ? { r: 3, fill: "var(--color-surface)", strokeWidth: 2 } : false}
                activeDot={{ r: 4.5, strokeWidth: 2, stroke: "var(--color-surface)" }}
                isAnimationActive={false}
              />
            ) : null}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <Legend
        className="mt-2 pl-1"
        items={[
          { label: "Revenue", color: REVENUE, shape: "bar" },
          ...(showProfit ? [{ label: "Profit", color: PROFIT, shape: "line" as const }] : []),
        ]}
      />
    </div>
  );
}

/* ------------------------------------------------------------ single series */

export function HourlyChart({
  data,
  height = 170,
}: {
  data: { label: string; hour: number; revenueCents: number; orders: number }[];
  height?: number;
}) {
  // Trim the dead hours at each end so the busy window fills the width.
  const active = data.filter((d) => d.revenueCents > 0 || d.orders > 0);
  const first = active.length ? Math.max(0, Math.min(...active.map((d) => d.hour)) - 1) : 6;
  const last = active.length ? Math.min(23, Math.max(...active.map((d) => d.hour)) + 1) : 23;
  const shown = data.slice(first, last + 1);

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={shown} margin={{ top: 8, right: 6, bottom: 0, left: -20 }}>
          <CartesianGrid stroke={GRID} strokeDasharray="3 4" vertical={false} />
          <XAxis
            dataKey="label"
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
            interval={shown.length > 10 ? 1 : 0}
          />
          <YAxis
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
            width={50}
            tickFormatter={moneyTick}
          />
          <Tooltip
            cursor={{ fill: "var(--color-surface-2)", radius: 6 }}
            content={({ active: on, payload, label }) => {
              if (!on || !payload?.length) return null;
              const p = payload[0].payload as { revenueCents: number; orders: number };
              return (
                <TipCard
                  title={String(label)}
                  rows={[
                    { label: "Revenue", value: formatMoney(p.revenueCents), color: REVENUE },
                    { label: "Orders", value: String(p.orders) },
                  ]}
                />
              );
            }}
          />
          <Bar
            dataKey="revenueCents"
            fill={REVENUE}
            radius={[4, 4, 0, 0]}
            maxBarSize={30}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function WeekdayChart({
  data,
  height = 170,
}: {
  data: { label: string; avgRevenueCents: number; orders: number; days: number }[];
  height?: number;
}) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 6, bottom: 0, left: -20 }}>
          <CartesianGrid stroke={GRID} strokeDasharray="3 4" vertical={false} />
          <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} />
          <YAxis
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
            width={50}
            tickFormatter={moneyTick}
          />
          <Tooltip
            cursor={{ fill: "var(--color-surface-2)", radius: 6 }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as {
                avgRevenueCents: number;
                orders: number;
                days: number;
              };
              return (
                <TipCard
                  title={String(label)}
                  rows={[
                    { label: "Average day", value: formatMoney(p.avgRevenueCents), color: REVENUE },
                    { label: "Orders", value: String(p.orders) },
                    { label: "Days counted", value: String(p.days) },
                  ]}
                />
              );
            }}
          />
          <Bar
            dataKey="avgRevenueCents"
            fill={REVENUE}
            radius={[4, 4, 0, 0]}
            maxBarSize={34}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Qty-over-time for one dish, used in the item detail sheet. */
export function ItemTrendChart({
  data,
  height = 150,
}: {
  data: { day: string; qty: number; revenueCents: number }[];
  height?: number;
}) {
  const shaped = data.map((d) => ({ ...d, label: d.day.slice(5) }));
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={shaped} margin={{ top: 8, right: 6, bottom: 0, left: -26 }}>
          <CartesianGrid stroke={GRID} strokeDasharray="3 4" vertical={false} />
          <XAxis
            dataKey="label"
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
            interval={Math.max(0, Math.ceil(shaped.length / 7) - 1)}
          />
          <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={34} allowDecimals={false} />
          <Tooltip
            cursor={{ fill: "var(--color-surface-2)", radius: 6 }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as { qty: number; revenueCents: number };
              return (
                <TipCard
                  title={String(label)}
                  rows={[
                    { label: "Sold", value: `${p.qty}` },
                    { label: "Revenue", value: formatMoney(p.revenueCents), color: REVENUE },
                  ]}
                />
              );
            }}
          />
          <Bar
            dataKey="qty"
            fill={REVENUE}
            radius={[4, 4, 0, 0]}
            maxBarSize={22}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export const VIZ = { REVENUE, PROFIT, COST };
