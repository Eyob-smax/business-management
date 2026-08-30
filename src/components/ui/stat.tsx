"use client";
/**
 * Headline numbers.
 *
 * Per the dataviz form heuristic, a single number's job is done by a stat
 * tile, not a chart - so revenue / expenses / profit lead with big tabular
 * figures and only get a sparkline as supporting texture.
 */
import * as React from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/money";

export function DeltaBadge({
  pct,
  inverse,
  className,
}: {
  /** null = no comparable previous period. */
  pct: number | null;
  /** For costs, going up is bad - flip the colour, not the arrow. */
  inverse?: boolean;
  className?: string;
}) {
  if (pct === null || !Number.isFinite(pct)) {
    return (
      <span className={cn("text-[11.5px] font-semibold text-ink-3", className)}>new</span>
    );
  }

  const flat = Math.abs(pct) < 0.5;
  const up = pct > 0;
  const good = flat ? null : inverse ? !up : up;

  return (
    <span
      className={cn(
        "nums inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11.5px] font-bold",
        flat && "bg-surface-2 text-ink-3",
        good === true && "bg-profit-soft text-profit",
        good === false && "bg-loss-soft text-loss",
        className,
      )}
    >
      {flat ? (
        <Minus className="size-3" />
      ) : up ? (
        <ArrowUpRight className="size-3" />
      ) : (
        <ArrowDownRight className="size-3" />
      )}
      {Math.abs(pct) >= 999 ? "999+" : Math.abs(pct).toFixed(Math.abs(pct) < 10 ? 1 : 0)}%
    </span>
  );
}

export function StatTile({
  label,
  valueCents,
  value,
  sub,
  deltaPct,
  inverseDelta,
  tone = "neutral",
  icon,
  spark,
  className,
  onClick,
}: {
  label: string;
  /** Pass either a money amount... */
  valueCents?: number;
  /** ...or a pre-formatted value. */
  value?: React.ReactNode;
  sub?: React.ReactNode;
  deltaPct?: number | null;
  inverseDelta?: boolean;
  tone?: "neutral" | "profit" | "loss" | "brand";
  icon?: React.ReactNode;
  spark?: number[];
  className?: string;
  onClick?: () => void;
}) {
  const negative = valueCents !== undefined && valueCents < 0;
  const resolvedTone = tone === "profit" && negative ? "loss" : tone;

  const Tag = onClick ? "button" : "div";

  return (
    <Tag
      onClick={onClick}
      className={cn(
        "relative overflow-hidden rounded-[var(--radius-tile)] border border-line bg-surface p-3.5 text-left shadow-tile",
        onClick && "transition active:scale-[0.985]",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[11.5px] font-bold tracking-[0.04em] text-ink-3 uppercase">
          {icon}
          {label}
        </span>
        {deltaPct !== undefined ? (
          <DeltaBadge pct={deltaPct} inverse={inverseDelta} />
        ) : null}
      </div>

      <p
        className={cn(
          "nums mt-2 text-[22px] leading-none font-bold tracking-tight",
          resolvedTone === "profit" && "text-profit",
          resolvedTone === "loss" && "text-loss",
          resolvedTone === "brand" && "text-brand",
          resolvedTone === "neutral" && "text-ink",
        )}
      >
        {value ?? formatMoney(valueCents, { compact: true })}
      </p>

      {sub ? <p className="mt-1.5 text-[12px] leading-snug text-ink-3">{sub}</p> : null}

      {spark && spark.length > 1 ? (
        <Sparkline
          values={spark}
          className="mt-2.5 h-7 w-full"
          stroke={
            resolvedTone === "loss"
              ? "var(--color-loss)"
              : resolvedTone === "profit"
                ? "var(--color-viz-profit)"
                : "var(--color-viz-revenue)"
          }
        />
      ) : null}
    </Tag>
  );
}

/** Tiny trend line. No axes, no labels - it is texture, not a chart. */
export function Sparkline({
  values,
  className,
  stroke = "var(--color-viz-revenue)",
  fill = true,
}: {
  values: number[];
  className?: string;
  stroke?: string;
  fill?: boolean;
}) {
  const id = React.useId();
  if (values.length < 2) return null;

  const W = 100;
  const H = 28;
  const min = Math.min(0, ...values);
  const max = Math.max(...values, min + 1);
  const span = max - min || 1;

  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * W;
    const y = H - ((v - min) / span) * (H - 3) - 1.5;
    return [x, y] as const;
  });

  const line = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`).join(" ");
  const area = `${line} L${W} ${H} L0 ${H} Z`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className={className}
      aria-hidden
    >
      {fill ? (
        <>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity="0.22" />
              <stop offset="100%" stopColor={stroke} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#${id})`} />
        </>
      ) : null}
      <path
        d={line}
        fill="none"
        stroke={stroke}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/**
 * Horizontal composition bar: how revenue split into cost and profit.
 * Segments are separated by a 2px surface gap and always directly labelled,
 * which is the secondary encoding the light-mode palette requires.
 */
export function CompositionBar({
  segments,
  totalCents,
  className,
}: {
  segments: { label: string; cents: number; color: string }[];
  totalCents: number;
  className?: string;
}) {
  const total = Math.max(
    totalCents,
    segments.reduce((t, s) => t + Math.max(0, s.cents), 0),
    1,
  );
  const visible = segments.filter((s) => s.cents > 0);

  return (
    <div className={className}>
      <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-surface-2">
        {visible.map((s) => (
          <div
            key={s.label}
            style={{ width: `${(s.cents / total) * 100}%`, background: s.color }}
            className="h-full first:rounded-l-full last:rounded-r-full"
            title={`${s.label}: ${formatMoney(s.cents)}`}
          />
        ))}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5">
        {segments.map((s) => (
          <span key={s.label} className="flex items-center gap-1.5 text-[12px]">
            <span
              className="size-2.5 shrink-0 rounded-[3px]"
              style={{ background: s.color }}
              aria-hidden
            />
            <span className="text-ink-2">{s.label}</span>
            <span className="nums font-semibold text-ink">{formatMoney(s.cents, { compact: true })}</span>
            <span className="nums text-ink-3">
              {total ? `${Math.round((s.cents / total) * 100)}%` : "0%"}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

/** Thin ranked bar used in the top-items and category lists. */
export function RankBar({
  pct,
  color = "var(--color-viz-revenue)",
  className,
}: {
  pct: number;
  color?: string;
  className?: string;
}) {
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-surface-2", className)}>
      <div
        className="h-full rounded-full transition-[width] duration-500"
        style={{ width: `${Math.max(2, Math.min(100, pct))}%`, background: color }}
      />
    </div>
  );
}
