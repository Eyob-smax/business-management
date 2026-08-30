"use client";

import { useLocale } from "next-intl";
import { Globe } from "lucide-react";
import { usePathname, useRouter } from "@/i18n/routing";
import { routing } from "@/i18n/routing";
import { Button, Segmented } from "./primitives";

const LABELS: Record<string, string> = { am: "አማርኛ", en: "English" };

/**
 * Floating toggle, used on the sign-in screen where there is no app chrome to
 * hang a menu off. Everywhere else the account menu has the picker below.
 */
export function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  const next = locale === "en" ? "am" : "en";

  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={() => router.replace(pathname, { locale: next })}
      className="absolute top-4 right-4 z-50 rounded-full"
      icon={<Globe className="size-4" />}
    >
      {LABELS[next]}
    </Button>
  );
}

/**
 * The picker inside the account menu.
 *
 * Switching keeps you on the same screen - `usePathname` from the routing
 * helpers returns the path without its locale prefix, so replacing the locale
 * does not send somebody who is halfway through a shift back to the home page.
 */
export function LanguagePicker() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  return (
    <Segmented<string>
      value={locale}
      onChange={(next) => {
        if (next !== locale) router.replace(pathname, { locale: next });
      }}
      options={routing.locales.map((code) => ({
        value: code,
        label: LABELS[code] ?? code,
      }))}
    />
  );
}
