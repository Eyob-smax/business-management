import type { Metadata } from "next";
import { getMenuForAdmin } from "@/lib/menu";
import { getBusinessSettings } from "@/lib/settings";
import { MenuManager } from "@/components/admin/menu-manager";
import { NeedsInternet } from "@/components/pwa/needs-internet";
import { getTranslations } from 'next-intl/server';

/** The browser tab, in the reader's own language. */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Meta");
  return { title: t("menu") };
}

export default async function MenuPage() {
  // Both are needed: the menu itself, and the margin threshold that decides
  // which dishes get flagged as thin.
  const [{ categories, items }, business] = await Promise.all([
    getMenuForAdmin("restaurant"),
    getBusinessSettings(),
  ]);
  const t = await getTranslations('AdminMenu');
  const o = await getTranslations('Offline');

  return (
    <div className="space-y-4">
      <header className="px-1">
        <h1 className="text-[20px] leading-tight font-bold tracking-tight text-ink">
          {t('title')}
        </h1>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-3">
          {t('description')}
        </p>
      </header>

      {/* Prices and dishes are server-side edits: there is no honest way to
          queue one against a menu somebody else may change meanwhile. */}
      <NeedsInternet message={o('needsInternetMenu')}>
        <MenuManager
          categories={categories}
          items={items}
          lowMarginPct={business.lowMarginPct}
        />
      </NeedsInternet>
    </div>
  );
}
