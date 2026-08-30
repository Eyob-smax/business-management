"use client";
/**
 * The whole visual vocabulary of the app lives here: one place to change a
 * radius or a shadow and have every screen follow. Tap targets are never
 * below 44px, because these screens get used with one thumb during a rush.
 */
import * as React from "react";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ surface */

export function Card({
  className,
  children,
  as: Tag = "div",
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & { as?: React.ElementType }) {
  return (
    <Tag
      className={cn(
        "rounded-[var(--radius-card)] border border-line bg-surface shadow-tile",
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
  icon,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-3 px-4 pt-4", className)}>
      <div className="flex min-w-0 items-start gap-2.5">
        {icon ? <div className="mt-0.5 text-ink-3">{icon}</div> : null}
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-semibold tracking-tight text-ink">{title}</h3>
          {subtitle ? (
            <p className="mt-0.5 text-[12.5px] leading-snug text-ink-3">{subtitle}</p>
          ) : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------------- button */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "success" | "soft";
type ButtonSize = "sm" | "md" | "lg" | "xl";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-brand text-white shadow-tile hover:bg-brand-strong active:scale-[0.985] disabled:bg-line-strong",
  secondary:
    "border border-line bg-surface text-ink hover:bg-surface-2 active:scale-[0.985] disabled:text-ink-3",
  ghost: "text-ink-2 hover:bg-surface-2 hover:text-ink active:scale-[0.985]",
  danger: "bg-loss text-white hover:brightness-95 active:scale-[0.985]",
  success: "bg-profit text-white hover:brightness-95 active:scale-[0.985]",
  soft: "bg-brand-soft text-brand-ink hover:brightness-[0.97] active:scale-[0.985]",
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: "h-9 gap-1.5 px-3 text-[13px] rounded-[10px]",
  md: "h-11 gap-2 px-4 text-[14px] rounded-[var(--radius-control)]",
  lg: "h-12 gap-2 px-5 text-[15px] rounded-[var(--radius-control)]",
  xl: "h-14 gap-2.5 px-6 text-base rounded-[16px]",
};

export const Button = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant;
    size?: ButtonSize;
    block?: boolean;
    loading?: boolean;
    icon?: React.ReactNode;
  }
>(function Button(
  { variant = "secondary", size = "md", block, loading, icon, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex select-none items-center justify-center font-semibold transition-[background,transform,opacity] duration-150",
        "disabled:pointer-events-none disabled:opacity-60",
        BUTTON_SIZES[size],
        BUTTON_VARIANTS[variant],
        block && "w-full",
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner className="size-4" /> : icon}
      {children}
    </button>
  );
});

export function IconButton({
  label,
  className,
  children,
  variant = "ghost",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  variant?: ButtonVariant;
}) {
  return (
    <button
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex size-10 shrink-0 items-center justify-center rounded-full transition active:scale-95",
        BUTTON_VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn("animate-spin", className)} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* -------------------------------------------------------------------- badge */

type Tone = "neutral" | "brand" | "profit" | "loss" | "info" | "warn";

const TONES: Record<Tone, string> = {
  neutral: "bg-surface-2 text-ink-2 border-line",
  brand: "bg-brand-soft text-brand-ink border-transparent",
  profit: "bg-profit-soft text-profit border-transparent",
  loss: "bg-loss-soft text-loss border-transparent",
  info: "bg-info-soft text-info border-transparent",
  warn: "bg-warn-soft text-warn border-transparent",
};

export function Badge({
  tone = "neutral",
  className,
  children,
  dot,
}: {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11.5px] font-semibold whitespace-nowrap",
        TONES[tone],
        className,
      )}
    >
      {dot ? <span className="size-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------- inputs */

export function Field({
  label,
  hint,
  error,
  required,
  children,
  className,
}: {
  label?: string;
  hint?: React.ReactNode;
  error?: string | null;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      {label ? (
        <span className="mb-1.5 flex items-center gap-1 text-[13px] font-semibold text-ink-2">
          {label}
          {required ? <span className="text-loss">*</span> : null}
        </span>
      ) : null}
      {children}
      {error ? (
        <span className="mt-1 block text-[12px] font-medium text-loss">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-[12px] leading-snug text-ink-3">{hint}</span>
      ) : null}
    </label>
  );
}

const CONTROL =
  // min-w-0: an input's intrinsic width (from its `size` attribute) otherwise
  // becomes an un-shrinkable minimum whenever the control is a flex child.
  "w-full min-w-0 rounded-[var(--radius-control)] border border-line bg-surface px-3.5 text-[15px] text-ink " +
  "placeholder:text-ink-3 transition focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/12 " +
  "disabled:bg-surface-2 disabled:text-ink-3";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { prefix?: string }
>(function Input({ className, prefix, ...rest }, ref) {
  if (prefix) {
    return (
      <div className="relative">
        <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-[14px] font-semibold text-ink-3">
          {prefix}
        </span>
        <input ref={ref} className={cn(CONTROL, "nums h-12 pl-11", className)} {...rest} />
      </div>
    );
  }
  return <input ref={ref} className={cn(CONTROL, "h-12", className)} {...rest} />;
});

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cn(CONTROL, "min-h-24 py-3 leading-relaxed", className)} {...rest} />;
});

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className, children, ...rest }, ref) {
  return (
    <div className="relative">
      <select
        ref={ref}
        className={cn(CONTROL, "h-12 appearance-none pr-10", className)}
        {...rest}
      >
        {children}
      </select>
      <svg
        className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-ink-3"
        viewBox="0 0 20 20"
        fill="none"
        aria-hidden
      >
        <path d="M6 8l4 4 4-4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      </svg>
    </div>
  );
});

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: React.ReactNode;
  description?: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "flex w-full items-center justify-between gap-4 rounded-[var(--radius-control)] px-1 py-2.5 text-left transition",
        disabled && "opacity-60",
      )}
    >
      <span className="min-w-0">
        <span className="block text-[14px] font-semibold text-ink">{label}</span>
        {description ? (
          <span className="mt-0.5 block text-[12.5px] leading-snug text-ink-3">{description}</span>
        ) : null}
      </span>
      <span
        className={cn(
          "relative h-7 w-12 shrink-0 rounded-full transition-colors duration-200",
          checked ? "bg-brand" : "bg-line-strong",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-6 rounded-full bg-white shadow transition-transform duration-200",
            checked ? "translate-x-[1.4rem]" : "translate-x-0.5",
          )}
        />
      </span>
    </button>
  );
}

/** Horizontal option picker. Used for grain (day/week/month/year) and modes. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  size = "md",
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: React.ReactNode; hint?: string }[];
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <div
      role="tablist"
      className={cn(
        "inline-flex w-full items-center gap-1 rounded-[14px] border border-line bg-surface-2 p-1",
        className,
      )}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={active}
            title={o.hint}
            onClick={() => onChange(o.value)}
            className={cn(
              "min-w-0 flex-1 truncate rounded-[10px] font-semibold transition-all duration-150",
              size === "sm" ? "h-8 px-2 text-[12.5px]" : "h-9 px-3 text-[13.5px]",
              active
                ? "bg-surface text-ink shadow-tile"
                : "text-ink-3 hover:text-ink-2 active:scale-[0.97]",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------- misc pieces */

export function Avatar({
  emoji,
  name,
  size = 36,
  className,
}: {
  emoji?: string | null;
  name?: string;
  size?: number;
  className?: string;
}) {
  const text = emoji || (name ? name.trim()[0]?.toUpperCase() : "?");
  return (
    <span
      style={{ width: size, height: size, fontSize: size * 0.5 }}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-brand-soft leading-none select-none",
        className,
      )}
    >
      {text}
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  body?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-12 text-center", className)}>
      {icon ? (
        <div className="mb-3 flex size-14 items-center justify-center rounded-2xl bg-surface-2 text-ink-3">
          {icon}
        </div>
      ) : null}
      <p className="text-[15px] font-semibold text-ink">{title}</p>
      {body ? (
        <p className="mt-1.5 max-w-xs text-[13.5px] leading-relaxed text-ink-3">{body}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-xl", className)} />;
}

export function Divider({ className, label }: { className?: string; label?: string }) {
  if (label) {
    return (
      <div className={cn("flex items-center gap-3", className)}>
        <span className="h-px flex-1 bg-line" />
        <span className="text-[11px] font-bold tracking-wide text-ink-3 uppercase">{label}</span>
        <span className="h-px flex-1 bg-line" />
      </div>
    );
  }
  return <div className={cn("h-px bg-line", className)} />;
}

/** Row used in list-style settings and detail panels. */
export function Row({
  label,
  value,
  tone,
  bold,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  tone?: "profit" | "loss" | "muted";
  bold?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex items-baseline justify-between gap-4 py-1.5", className)}>
      <span className={cn("text-[13.5px] text-ink-2", bold && "font-semibold text-ink")}>
        {label}
      </span>
      <span
        className={cn(
          "nums text-[14px] font-semibold text-ink",
          bold && "text-[15px]",
          tone === "profit" && "text-profit",
          tone === "loss" && "text-loss",
          tone === "muted" && "font-medium text-ink-3",
        )}
      >
        {value}
      </span>
    </div>
  );
}

/** Sticky section heading used down the long admin pages. */
export function SectionTitle({
  children,
  action,
  className,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-3 px-1", className)}>
      <h2 className="text-[12px] font-bold tracking-[0.06em] text-ink-3 uppercase">{children}</h2>
      {action}
    </div>
  );
}
