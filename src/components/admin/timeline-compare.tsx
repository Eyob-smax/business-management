import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import type { ItemPerf } from "@/lib/analytics";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Card, CardHeader } from "@/components/ui/primitives";

export type TimelineSlice = { label: string; items: ItemPerf[] };

/**
 * "Which dishes do well over different timeframes?"
 *
 * A dish that is top today but eighth over the year is a fluke; one that holds
 * its place across all four columns is the business. The arrow compares each
 * dish's rank in this column against its rank over the longest timeframe, so
 * the risers and fallers are visible at a glance.
 */
export function TimelineCompare({
  slices,
  topN = 5,
}: {
  /** Ordered shortest to longest, e.g. today / week / month / year. */
  slices: TimelineSlice[];
  topN?: number;
}) {
  const baseline = slices[slices.length - 1];
  const baselineRank = new Map(baseline.items.map((i, index) => [i.key, index + 1]));

  return (
    <Card className="pb-3">
      <CardHeader
        title="Winners across timeframes"
        subtitle={`Top ${topN} by money in, compared with their place over the ${baseline.label.toLowerCase()}`}
      />

      <div className="mt-3 overflow-x-auto px-4">
        <div className="flex min-w-max gap-3">
          {slices.map((slice) => (
            <div key={slice.label} className="w-[190px] shrink-0">
              <p className="mb-2 text-[11.5px] font-bold tracking-[0.05em] text-ink-3 uppercase">
                {slice.label}
              </p>

              {slice.items.length === 0 ? (
                <p className="text-[12.5px] text-ink-3">No sales</p>
              ) : (
                <ol className="space-y-1.5">
                  {slice.items.slice(0, topN).map((item, index) => {
                    const base = baselineRank.get(item.key);
                    const rank = index + 1;
                    const move = base ? base - rank : null;
                    const isBaseline = slice.label === baseline.label;

                    return (
                      <li
                        key={item.key}
                        className="flex items-center gap-2 rounded-[10px] bg-surface-2/70 px-2 py-1.5"
                      >
                        <span className="nums w-3.5 shrink-0 text-[11px] font-bold text-ink-3">
                          {rank}
                        </span>
                        <span className="text-[15px] leading-none" aria-hidden>
                          {item.emoji}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12.5px] font-semibold text-ink">
                            {item.name}
                          </span>
                          <span className="nums block text-[11px] text-ink-3">
                            {formatMoney(item.revenueCents, { compact: true })} - {item.qty} sold
                          </span>
                        </span>

                        {!isBaseline && move !== null ? (
                          <span
                            className={cn(
                              "nums flex shrink-0 items-center gap-0.5 text-[10.5px] font-bold",
                              move > 0 ? "text-profit" : move < 0 ? "text-loss" : "text-ink-3",
                            )}
                            title={`Ranked ${base} over the ${baseline.label.toLowerCase()}`}
                          >
                            {move > 0 ? (
                              <ArrowUp className="size-3" />
                            ) : move < 0 ? (
                              <ArrowDown className="size-3" />
                            ) : (
                              <Minus className="size-3" />
                            )}
                            {move !== 0 ? Math.abs(move) : ""}
                          </span>
                        ) : null}
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          ))}
        </div>
      </div>

      <p className="mt-3 px-4 text-[11.5px] leading-relaxed text-ink-3">
        The arrow shows how many places a dish moves compared with its{" "}
        {baseline.label.toLowerCase()} position. A green arrow means it is doing better lately than
        it usually does.
      </p>
    </Card>
  );
}
