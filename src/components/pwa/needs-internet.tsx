"use client";
/**
 * Marks the parts of the app that genuinely need a connection.
 *
 * Recording a sale works offline because it goes through the outbox. Editing
 * the menu, changing prices, adding staff or saving settings do not: they are
 * server actions, and there is no safe way to queue "raise every price by 10"
 * against a menu that somebody else may have changed meanwhile.
 *
 * So instead of letting the button fail - a dead tap, or worse, a crash - the
 * controls are switched off and told why. Being unable to do something and
 * knowing why is a normal state; being unable to do something and not knowing
 * why is a broken app.
 */
import * as React from "react";
import { useTranslations } from "next-intl";
import { CloudOff } from "lucide-react";
import { useOnline } from "@/hooks/use-online";
import { cn } from "@/lib/utils";

/** A one-line notice, shown only while there is no connection. */
export function NeedsInternetNotice({
  message,
  className,
}: {
  /** Overrides the default wording when a screen can be more specific. */
  message?: string;
  className?: string;
}) {
  const t = useTranslations("Offline");
  const online = useOnline();
  if (online) return null;

  return (
    <div
      role="status"
      className={cn(
        "flex items-start gap-2 rounded-[12px] border border-warn/30 bg-warn-soft px-3 py-2.5",
        className,
      )}
    >
      <CloudOff className="mt-px size-4 shrink-0 text-warn" />
      <p className="text-[12.5px] leading-snug text-ink-2">{message ?? t("needsInternet")}</p>
    </div>
  );
}

/**
 * Wraps controls that cannot work offline: shows the notice, then makes
 * everything inside inert so a tap cannot start something that will fail.
 */
export function NeedsInternet({
  children,
  message,
  className,
}: {
  children: React.ReactNode;
  message?: string;
  className?: string;
}) {
  const online = useOnline();

  return (
    <div className={className}>
      <NeedsInternetNotice message={message} className={!online ? "mb-3" : undefined} />
      <div
        // `inert` takes the whole subtree out of tab order and out of reach of
        // a tap, which a disabled attribute on one button would not do.
        {...(!online ? { inert: true } : {})}
        className={cn(!online && "pointer-events-none opacity-55 select-none")}
      >
        {children}
      </div>
    </div>
  );
}
