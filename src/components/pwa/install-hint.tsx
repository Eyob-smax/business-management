"use client";
/**
 * "Install this app" nudge.
 *
 * On Android/Chrome we can trigger the real install prompt. On iOS there is no
 * API, so we explain the Share -> Add to Home Screen route instead. When the
 * app is already installed (running standalone) this renders nothing.
 */
import * as React from "react";
import { Download, Share, SquarePlus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/primitives";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "bm-install-dismissed";

export function InstallHint({ className }: { className?: string }) {
  const [prompt, setPrompt] = React.useState<BeforeInstallPromptEvent | null>(null);
  const [standalone, setStandalone] = React.useState(true);
  const [isIOS, setIsIOS] = React.useState(false);
  const [dismissed, setDismissed] = React.useState(true);

  React.useEffect(() => {
    const installed =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    setStandalone(installed);
    setDismissed(localStorage.getItem(DISMISS_KEY) === "1");

    const ua = window.navigator.userAgent;
    setIsIOS(/iPad|iPhone|iPod/.test(ua) && !/CriOS|FxiOS/.test(ua));

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (standalone || dismissed) return null;
  if (!prompt && !isIOS) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  };

  return (
    <div
      className={cn(
        "relative rounded-[var(--radius-card)] border border-brand/25 bg-brand-soft p-4",
        className,
      )}
    >
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        className="absolute top-2.5 right-2.5 rounded-full p-1 text-brand-ink/60 transition hover:bg-black/5"
      >
        <X className="size-4" />
      </button>

      <p className="pr-6 text-[14px] font-semibold text-brand-ink">Add this to your home screen</p>
      <p className="mt-1 text-[12.5px] leading-relaxed text-brand-ink/85">
        It opens like a normal app, works without internet, and can send you notifications.
      </p>

      {prompt ? (
        <Button
          size="sm"
          variant="primary"
          className="mt-3"
          icon={<Download className="size-3.5" />}
          onClick={async () => {
            await prompt.prompt();
            const choice = await prompt.userChoice;
            if (choice.outcome === "accepted") setStandalone(true);
            setPrompt(null);
          }}
        >
          Install
        </Button>
      ) : (
        <p className="mt-3 flex flex-wrap items-center gap-1.5 text-[12.5px] font-medium text-brand-ink">
          Tap
          <Share className="size-4" />
          Share, then
          <SquarePlus className="size-4" />
          <span>Add to Home Screen</span>
        </p>
      )}
    </div>
  );
}
