"use client";

import { useLocale } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/routing';
import { Button } from './primitives';
import { Globe } from 'lucide-react';

export function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  const toggleLocale = () => {
    const nextLocale = locale === 'en' ? 'am' : 'en';
    router.replace(pathname, { locale: nextLocale });
  };

  return (
    <Button 
      variant="secondary" 
      size="sm" 
      onClick={toggleLocale}
      className="absolute top-4 right-4 z-50 rounded-full"
      icon={<Globe className="size-4" />}
    >
      {locale === 'en' ? 'አማርኛ' : 'English'}
    </Button>
  );
}
