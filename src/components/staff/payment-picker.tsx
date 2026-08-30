"use client";
/**
 * How the customer paid.
 *
 * Nearly every order is cash, Telebirr or M-Pesa, so those stay one tap away.
 * The forty-odd banks sit behind a "more ways" sheet with a search box, which
 * keeps the common path fast without making a bank transfer impossible to
 * record. A bank chosen from the sheet is promoted to a visible chip so the
 * choice is never hidden behind another tap.
 */
import * as React from "react";
import { useLocale, useTranslations } from "next-intl";
import { Check, Landmark, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  labelFor,
  otherMethods,
  quickMethods,
  transferMethods,
} from "@/lib/payments";

import { Sheet } from "@/components/ui/overlay";

export function PaymentPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const locale = useLocale();
  const t = useTranslations("Till");
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");

  const quick = React.useMemo(() => quickMethods(), []);
  const transfers = React.useMemo(() => transferMethods(), []);
  const others = React.useMemo(() => otherMethods(), []);

  const isQuick = quick.some((m) => m.id === value);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = [...transfers, ...others];
    if (!q) return all;
    return all.filter(
      (m) => m.en.toLowerCase().includes(q) || m.am.includes(query.trim()),
    );
  }, [query, transfers, others]);

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {quick.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => onChange(m.id)}
            className={cn(
              "h-10 rounded-full border px-3.5 text-[13px] font-semibold transition active:scale-95",
              value === m.id
                ? "border-brand bg-brand text-white"
                : "border-line bg-surface text-ink-2",
            )}
          >
            {labelFor(m.id, locale)}
          </button>
        ))}

        {/* A bank picked from the sheet gets its own chip so it stays visible. */}
        {!isQuick ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex h-10 max-w-full items-center gap-1.5 rounded-full border border-brand bg-brand px-3.5 text-[13px] font-semibold text-white transition active:scale-95"
          >
            <Landmark className="size-3.5 shrink-0" />
            <span className="truncate">{labelFor(value, locale)}</span>
          </button>
        ) : null}

        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex h-10 items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 text-[13px] font-semibold text-ink-2 transition active:scale-95"
        >
          <Landmark className="size-3.5" />
          {t("moreWays")}
        </button>
      </div>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={t("paidWith")}
        subtitle={t("moreWaysSubtitle")}
        size="md"
      >
        <div className="pt-1 pb-2">
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-3" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("searchBank")}
              data-autofocus
              className="h-11 w-full min-w-0 rounded-full border border-line bg-surface pr-4 pl-10 text-[15px] text-ink placeholder:text-ink-3 focus:border-brand focus:ring-4 focus:ring-brand/12 focus:outline-none"
            />
          </div>

          {filtered.length === 0 ? (
            <p className="py-8 text-center text-[13px] text-ink-3">
              {t("noBankMatch")}
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {filtered.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(m.id);
                      setQuery("");
                      setOpen(false);
                    }}
                    className="flex w-full items-center gap-3 py-3 text-left transition active:scale-[0.99]"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-semibold text-ink">
                        {labelFor(m.id, locale)}
                      </span>
                      <span className="block truncate text-[11.5px] text-ink-3">
                        {locale === "am" ? m.en : m.am}
                      </span>
                    </span>
                    {value === m.id ? (
                      <Check className="size-4 shrink-0 text-brand" />
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Sheet>
    </div>
  );
}

/** Read-only label, for the log and reports. */
export function PaymentLabel({ id }: { id: string }) {
  const locale = useLocale();
  return <>{labelFor(id, locale)}</>;
}

