"use client";
/**
 * Six-box numeric code entry.
 *
 * One real input per digit so the phone shows a number pad, paste of a full
 * code fans out across the boxes, and backspace walks backwards the way people
 * expect. The value is mirrored into a hidden field for the server action.
 */
import * as React from "react";
import { cn } from "@/lib/utils";

export function CodeInput({
  name,
  length = 6,
  value,
  onChange,
  onComplete,
  autoFocus,
  disabled,
  invalid,
  label,
}: {
  name: string;
  length?: number;
  value: string;
  onChange: (v: string) => void;
  onComplete?: (v: string) => void;
  autoFocus?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  label?: string;
}) {
  const refs = React.useRef<(HTMLInputElement | null)[]>([]);
  const digits = React.useMemo(
    () => Array.from({ length }, (_, i) => value[i] ?? ""),
    [value, length],
  );

  const setAt = (index: number, char: string) => {
    const next = digits.slice();
    next[index] = char;
    const joined = next.join("").slice(0, length);
    onChange(joined);
    return joined;
  };

  const handleChange = (index: number, raw: string) => {
    const clean = raw.replace(/\D/g, "");
    if (!clean) {
      setAt(index, "");
      return;
    }

    // Multi-character input (paste, or a fast keyboard) fills forward.
    if (clean.length > 1) {
      const merged = (value.slice(0, index) + clean).replace(/\D/g, "").slice(0, length);
      onChange(merged);
      const focus = Math.min(merged.length, length - 1);
      refs.current[focus]?.focus();
      if (merged.length === length) onComplete?.(merged);
      return;
    }

    const joined = setAt(index, clean);
    if (index < length - 1) refs.current[index + 1]?.focus();
    if (joined.length === length && !joined.includes("")) onComplete?.(joined);
  };

  const handleKey = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      e.preventDefault();
      if (digits[index]) setAt(index, "");
      else if (index > 0) {
        setAt(index - 1, "");
        refs.current[index - 1]?.focus();
      }
    }
    if (e.key === "ArrowLeft" && index > 0) refs.current[index - 1]?.focus();
    if (e.key === "ArrowRight" && index < length - 1) refs.current[index + 1]?.focus();
  };

  return (
    <div>
      {label ? (
        <span className="mb-1.5 block text-[13px] font-semibold text-ink-2">{label}</span>
      ) : null}
      {/* Tighter gap on narrow phones so six boxes still fit comfortably. */}
      <div className="flex w-full gap-1.5 sm:gap-2" role="group" aria-label={label ?? "Code"}>
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            value={d}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKey(i, e)}
            onFocus={(e) => e.currentTarget.select()}
            inputMode="numeric"
            autoComplete={i === 0 ? "one-time-code" : "off"}
            pattern="\d*"
            maxLength={length}
            /**
             * size={1} matters: an input's intrinsic width comes from `size`
             * (default 20 characters), and because a flex item's `min-width` is
             * `auto`, that intrinsic width becomes a floor that `flex-1` cannot
             * shrink past. Six boxes at ~180px each then burst out of the card.
             * `min-w-0` below removes the floor; `size={1}` keeps the intrinsic
             * width sane even where that class is overridden.
             */
            size={1}
            disabled={disabled}
            autoFocus={autoFocus && i === 0}
            aria-label={`Digit ${i + 1}`}
            className={cn(
              "nums h-14 w-full min-w-0 flex-1 rounded-[14px] border-2 bg-surface text-center text-[22px] font-bold text-ink",
              "transition focus:outline-none focus:ring-4 focus:ring-brand/15",
              invalid ? "border-loss/60" : d ? "border-brand/60" : "border-line",
              "focus:border-brand",
              disabled && "opacity-60",
            )}
          />
        ))}
      </div>
      <input type="hidden" name={name} value={value} />
    </div>
  );
}
