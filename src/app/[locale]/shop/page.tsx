import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Boxes, Receipt, Smartphone, Wrench } from "lucide-react";
import { canSignIn, getAuthedUser } from "@/lib/auth";
import { getBusinessSettings } from "@/lib/settings";
import { AppHeader } from "@/components/shell/app-header";
import { RoleNav } from "@/components/shell/role-nav";
import { Card } from "@/components/ui/primitives";
import { getTranslations } from 'next-intl/server';

export const metadata: Metadata = { title: "Mobile shop" };

/**
 * Placeholder for the second business, kept deliberately honest: it says what
 * is not built yet rather than showing empty charts that look broken. The
 * database, sync engine, auth and reporting are already module-aware
 * (`module = 'shop'`), so this becomes a real screen without a rewrite.
 */
export default async function ShopPage() {
  const user = await getAuthedUser();
  if (!user) redirect("/login");
  if (!canSignIn(user.accessLevel)) redirect("/login?blocked=1");

  const business = await getBusinessSettings();
  const t = await getTranslations('ShopPage');

  return (
    <div className="min-h-dvh">
      <AppHeader
        title={business.shopName}
        subtitle={t('subtitle')}
        user={user}
        backHref={user.role === "admin" ? "/admin" : "/staff"}
        showBell={user.role === "admin"}
      />

      <main className="mx-auto max-w-3xl space-y-4 px-4 pt-6 pb-20">
        <Card className="p-5 text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-brand-soft">
            <Smartphone className="size-7 text-brand" />
          </div>
          <h2 className="mt-3.5 text-[18px] font-bold tracking-tight text-ink">
            {t('isNext', { shopName: business.shopName })}
          </h2>
          <p className="mx-auto mt-2 max-w-sm text-[13.5px] leading-relaxed text-ink-3">
            {t('isNextDesc')}
          </p>
        </Card>

        <Card className="p-4">
          <p className="text-[12px] font-bold tracking-[0.05em] text-ink-3 uppercase">
            {t('whatItWillAdd')}
          </p>
          <ul className="mt-3 space-y-3">
            <Item
              icon={<Boxes className="size-4" />}
              title={t('stock')}
              body={t('stockDesc')}
            />
            <Item
              icon={<Receipt className="size-4" />}
              title={t('cost')}
              body={t('costDesc')}
            />
            <Item
              icon={<Wrench className="size-4" />}
              title={t('repairs')}
              body={t('repairsDesc')}
            />
          </ul>
        </Card>

        <Card className="p-4">
          <p className="text-[13px] leading-relaxed text-ink-2">
            {t('sharedDesc')}
          </p>
        </Card>

        <Link
          href={user.role === "admin" ? "/admin" : "/staff"}
          className="flex h-12 items-center justify-center gap-2 rounded-[var(--radius-control)] border border-line bg-surface text-[14px] font-semibold text-ink"
        >
          <ArrowLeft className="size-4" />
          {t('back')}
        </Link>
      </main>

      <RoleNav role={user.role} />
    </div>
  );
}

function Item({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-surface-2 text-ink-3">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[13.5px] font-semibold text-ink">{title}</span>
        <span className="mt-0.5 block text-[12.5px] leading-relaxed text-ink-3">{body}</span>
      </span>
    </li>
  );
}
