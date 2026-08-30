import { Compass } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { Button } from "@/components/ui/primitives";

/**
 * A missing page, in both languages.
 *
 * Offline this is rarer than it looks - the service worker answers an unsaved
 * page with the offline screen instead - so the wording here is about a link
 * that no longer goes anywhere, not about the connection.
 */
export default async function NotFound() {
  const t = await getTranslations("NotFoundPage");

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <div className="flex size-16 items-center justify-center rounded-[20px] bg-surface-2">
        <Compass className="size-8 text-ink-3" />
      </div>

      <h1 className="mt-5 text-[22px] font-bold tracking-tight text-ink">{t("title")}</h1>
      <p className="mt-2 max-w-sm text-[14px] leading-relaxed text-ink-3">{t("body")}</p>

      <div className="mt-6 w-full max-w-xs">
        <Link href="/" className="block">
          <Button variant="primary" size="lg" block>
            {t("goHome")}
          </Button>
        </Link>
      </div>
    </main>
  );
}
