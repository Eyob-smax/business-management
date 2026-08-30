import type { Metadata } from "next";
import { getMenuForAdmin } from "@/lib/menu";
import { getBusinessSettings } from "@/lib/settings";
import { MenuManager } from "@/components/admin/menu-manager";
import { getTranslations } from 'next-intl/server';

export const metadata: Metadata = { title: "Menu" };

export default async function MenuPage() {
  // Both are needed: the menu itself, and the margin threshold that decides
  // which dishes get flagged as thin.
  const [{ categories, items }, business] = await Promise.all([
    getMenuForAdmin("restaurant"),
    getBusinessSettings(),
  ]);
  const t = await getTranslations('AdminMenu');

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

      <MenuManager
        categories={categories}
        items={items}
        lowMarginPct={business.lowMarginPct}
      />
    </div>
  );
}
