"use client";
/**
 * What people see instead of "Application error: a client-side exception has
 * occurred", which is a blank screen with a sentence on it.
 *
 * Nearly every crash here is the same crash: a screen was opened with no
 * signal, its data never arrived, and React gave up. So the first thing this
 * page does is check whether there is a connection, and if there is not it
 * says so plainly rather than implying the app is broken.
 */
import * as React from "react";
import { useTranslations } from "next-intl";
import { CloudOff, RefreshCw, TriangleAlert } from "lucide-react";
import { Link } from "@/i18n/routing";
import { Button } from "@/components/ui/primitives";

export default function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("ErrorPage");
  const [offline, setOffline] = React.useState(false);

  React.useEffect(() => {
    const read = () => setOffline(!navigator.onLine);
    read();
    window.addEventListener("online", read);
    window.addEventListener("offline", read);
    return () => {
      window.removeEventListener("online", read);
      window.removeEventListener("offline", read);
    };
  }, []);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <div
        className={`flex size-16 items-center justify-center rounded-[20px] ${
          offline ? "bg-warn-soft" : "bg-loss-soft"
        }`}
      >
        {offline ? (
          <CloudOff className="size-8 text-warn" />
        ) : (
          <TriangleAlert className="size-8 text-loss" />
        )}
      </div>

      <h1 className="mt-5 text-[22px] font-bold tracking-tight text-ink">
        {offline ? t("offlineTitle") : t("title")}
      </h1>
      <p className="mt-2 max-w-sm text-[14px] leading-relaxed text-ink-3">
        {offline ? t("offlineBody") : t("body")}
      </p>

      <div className="mt-6 w-full max-w-xs space-y-2.5">
        <Button
          variant="primary"
          size="lg"
          block
          icon={<RefreshCw className="size-4" />}
          onClick={reset}
        >
          {t("tryAgain")}
        </Button>
        <Link href="/" className="block">
          <Button variant="secondary" size="lg" block>
            {t("goHome")}
          </Button>
        </Link>
      </div>

      <p className="mt-8 max-w-xs text-[12.5px] leading-relaxed text-ink-3">
        {t("dataSafe")}
      </p>

      {error.digest ? (
        <p className="nums mt-3 font-mono text-[11px] text-ink-3">{error.digest}</p>
      ) : null}
    </main>
  );
}
