import type { Metadata } from "next";
import { CloudOff } from "lucide-react";
import { OfflineActions } from "@/components/pwa/offline-actions";
import { getTranslations } from 'next-intl/server';

export const metadata: Metadata = { title: "Offline" };

/**
 * Served by the service worker when a page is requested that has never been
 * cached. The tone matters: nothing is broken and nothing is lost, so the page
 * says that plainly and points back to the till, which does work offline.
 */
export default async function OfflinePage() {
  const t = await getTranslations('OfflinePage');

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <div className="flex size-16 items-center justify-center rounded-[20px] bg-warn-soft">
        <CloudOff className="size-8 text-warn" />
      </div>

      <h1 className="mt-5 text-[22px] font-bold tracking-tight text-ink">
        {t('title')}
      </h1>
      <p className="mt-2 max-w-sm text-[14px] leading-relaxed text-ink-3">
        {t('description')}
      </p>

      <div className="mt-6 w-full max-w-xs">
        <OfflineActions />
      </div>

      <p className="mt-8 max-w-xs text-[12.5px] leading-relaxed text-ink-3">
        {t('footer')}
      </p>
    </main>
  );
}
