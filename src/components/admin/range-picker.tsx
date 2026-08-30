"use client";
/**
 * Period control: day / week / month / year plus a pager.
 *
 * Filters sit in one row above the charts (dataviz interaction rules) and
 * write to the URL, so the server re-renders with the right data instead of
 * the client re-querying.
 */
import * as React from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import type { Grain } from "@/lib/dates";
import { rangeFor, shiftRange, today } from "@/lib/dates";
import { GRAIN_OPTIONS } from "@/lib/range-params";
import { Segmented } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

export function RangePicker({
  grain,
  anchor,
  label,
  className,
}: {
  grain: Grain;
  /** The `on` day currently in the URL. */
  anchor: string;
  label: string;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, setPending] = React.useState(false);

  const go = (nextGrain: Grain, nextOn: string) => {
    const next = new URLSearchParams(params.toString());
    next.set("grain", nextGrain);
    next.set("on", nextOn);
    setPending(true);
    router.push(`${pathname}?${next.toString()}`, { scroll: false });
  };

  React.useEffect(() => {
    setPending(false);
  }, [grain, anchor]);

  const current = rangeFor(grain, anchor);
  const t = today();
  // Never page forward past the current period - there is no data there.
  const atLatest = current.to >= t;

  const step = (dir: -1 | 1) => {
    const next = shiftRange(current, dir);
    go(grain, next.from);
  };

  return (
    <div className={cn("space-y-2.5", className)}>
      <Segmented<Grain>
        value={grain}
        onChange={(g) => {
          // Keep the anchor day, but snap to "now" when jumping to a wider
          // grain from an old period would leave you somewhere confusing.
          go(g, anchor);
        }}
        options={GRAIN_OPTIONS}
      />

      <div className="flex items-center gap-2">
        <button
          onClick={() => step(-1)}
          aria-label="Previous period"
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-ink-2 transition active:scale-95"
        >
          <ChevronLeft className="size-5" />
        </button>

        <div
          className={cn(
            "flex h-10 flex-1 items-center justify-center gap-2 rounded-full border border-line bg-surface px-3 text-[13.5px] font-bold text-ink transition",
            pending && "opacity-60",
          )}
        >
          <CalendarDays className="size-4 text-ink-3" />
          <span className="truncate">{label}</span>
        </div>

        <button
          onClick={() => step(1)}
          disabled={atLatest}
          aria-label="Next period"
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-ink-2 transition active:scale-95 disabled:opacity-35"
        >
          <ChevronRight className="size-5" />
        </button>

        {!atLatest ? (
          <button
            onClick={() => go(grain, t)}
            className="h-10 shrink-0 rounded-full bg-surface-2 px-3.5 text-[12.5px] font-bold text-ink-2 transition active:scale-95"
          >
            Now
          </button>
        ) : null}
      </div>
    </div>
  );
}
