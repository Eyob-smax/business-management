"use client";
/**
 * Toasts. Deliberately loud about offline state: when a sale is saved without
 * a network the staff must SEE that it was kept, or they will re-enter it.
 */
import * as React from "react";
import { createPortal } from "react-dom";
import { Check, CloudOff, Info, TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastTone = "success" | "error" | "info" | "offline";

type Toast = {
  id: number;
  tone: ToastTone;
  title: string;
  body?: string;
  duration: number;
};

type Ctx = {
  toast: (t: { tone?: ToastTone; title: string; body?: string; duration?: number }) => void;
  dismiss: (id: number) => void;
};

const ToastContext = React.createContext<Ctx | null>(null);

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

let seq = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<Toast[]>([]);
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const dismiss = React.useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = React.useCallback<Ctx["toast"]>(
    ({ tone = "info", title, body, duration }) => {
      const id = ++seq;
      const ms = duration ?? (tone === "error" ? 6000 : 3200);
      setItems((prev) => [...prev.slice(-3), { id, tone, title, body, duration: ms }]);
      if (ms > 0) setTimeout(() => dismiss(id), ms);
    },
    [dismiss],
  );

  const value = React.useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {mounted
        ? createPortal(
            <div
              role="status"
              aria-live="polite"
              className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex flex-col items-center gap-2 px-3 pt-[max(env(safe-area-inset-top),0.75rem)]"
            >
              {items.map((t) => (
                <ToastCard key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
              ))}
            </div>,
            document.body,
          )
        : null}
    </ToastContext.Provider>
  );
}

const TONE_STYLES: Record<ToastTone, { wrap: string; icon: React.ReactNode }> = {
  success: {
    wrap: "border-profit/25 bg-profit-soft text-profit",
    icon: <Check className="size-[18px]" />,
  },
  error: {
    wrap: "border-loss/25 bg-loss-soft text-loss",
    icon: <TriangleAlert className="size-[18px]" />,
  },
  info: {
    wrap: "border-line bg-surface text-ink-2",
    icon: <Info className="size-[18px]" />,
  },
  offline: {
    wrap: "border-warn/30 bg-warn-soft text-warn",
    icon: <CloudOff className="size-[18px]" />,
  },
};

function ToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const style = TONE_STYLES[toast.tone];
  return (
    <div
      className={cn(
        "animate-pop pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-[16px] border px-3.5 py-3 shadow-lift backdrop-blur",
        style.wrap,
      )}
    >
      <span className="mt-px shrink-0">{style.icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] leading-tight font-semibold text-ink">{toast.title}</p>
        {toast.body ? (
          <p className="mt-1 text-[12.5px] leading-snug text-ink-2">{toast.body}</p>
        ) : null}
      </div>
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        className="-mt-0.5 -mr-1 shrink-0 rounded-full p-1 text-ink-3 transition hover:bg-black/5"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
