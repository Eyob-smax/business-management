"use client";
/**
 * Bottom sheet + confirm dialog.
 *
 * Sheets slide up from the bottom on phones (thumb reach) and become a
 * centred card on wide screens. Body scroll is locked while open, Escape and
 * backdrop-tap both close, and focus moves into the sheet so keyboard and
 * screen-reader users are not left behind the overlay.
 */
import * as React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, IconButton } from "./primitives";

export function Sheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = "md",
  dismissable = true,
}: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg" | "full";
  dismissable?: boolean;
}) {
  const [mounted, setMounted] = React.useState(false);
  const panelRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => setMounted(true), []);

  React.useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && dismissable) onClose();
    };
    document.addEventListener("keydown", onKey);

    // Move focus in without stealing it from an intentional autoFocus.
    const t = setTimeout(() => {
      const panel = panelRef.current;
      if (!panel) return;
      if (panel.contains(document.activeElement)) return;
      const target = panel.querySelector<HTMLElement>(
        "[data-autofocus],input,textarea,select,button",
      );
      target?.focus();
    }, 60);

    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
      clearTimeout(t);
    };
  }, [open, onClose, dismissable]);

  if (!mounted || !open) return null;

  const maxWidth = {
    sm: "sm:max-w-sm",
    md: "sm:max-w-md",
    lg: "sm:max-w-2xl",
    full: "sm:max-w-4xl",
  }[size];

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        className="animate-fade absolute inset-0 bg-ink/45 backdrop-blur-[2px]"
        onClick={() => dismissable && onClose()}
        aria-hidden
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : "Dialog"}
        className={cn(
          "animate-sheet relative flex w-full flex-col overflow-hidden bg-surface shadow-lift",
          "max-h-[92dvh] rounded-t-[22px] sm:max-h-[88dvh] sm:rounded-[22px]",
          maxWidth,
          size === "full" && "h-[92dvh]",
        )}
      >
        {/* Grab handle - signals "you can swipe this away" on touch. */}
        <div className="flex justify-center pt-2.5 sm:hidden">
          <span className="h-1 w-10 rounded-full bg-line-strong" />
        </div>

        {title ? (
          <div className="flex items-start justify-between gap-3 px-5 pt-3 pb-3">
            <div className="min-w-0">
              <h2 className="truncate text-[17px] font-bold tracking-tight text-ink">{title}</h2>
              {subtitle ? (
                <p className="mt-0.5 text-[13px] leading-snug text-ink-3">{subtitle}</p>
              ) : null}
            </div>
            {dismissable ? (
              <IconButton label="Close" onClick={onClose} className="-mt-1 -mr-2">
                <X className="size-5" />
              </IconButton>
            ) : null}
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4">
          {children}
        </div>

        {footer ? (
          <div className="pb-safe border-t border-line bg-surface px-5 pt-3.5 pb-3.5">{footer}</div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

/** Promise-free confirm: render it and handle onConfirm. */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  body,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  body?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  loading?: boolean;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <div className="flex gap-2.5">
          <Button variant="secondary" block onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? "danger" : "primary"}
            block
            onClick={onConfirm}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </div>
      }
    >
      {body ? <div className="pt-1 pb-2 text-[14px] leading-relaxed text-ink-2">{body}</div> : null}
    </Sheet>
  );
}
