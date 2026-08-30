import { defineRouting } from 'next-intl/routing';
import { createNavigation } from 'next-intl/navigation';

export const routing = defineRouting({
  // A list of all locales that are supported
  locales: ['en', 'am'],

  // Amharic is the default: this is an Ethiopian restaurant and most of the
  // people using it every day read Amharic first. English is at /en.
  defaultLocale: 'am',
  
  /**
   * Every URL carries its locale: /am/staff, /en/staff.
   *
   * 'as-needed' left the default locale unprefixed, which meant an unprefixed
   * path had no locale of its own and the middleware fell back to the
   * NEXT_LOCALE cookie. Any navigation that dropped the prefix therefore
   * snapped back to whatever the cookie last said - the "it resets to English
   * when I change tab" bug. Always prefixing removes the guessing entirely.
   */
  localePrefix: 'always'
});

// Lightweight wrappers around Next.js' navigation APIs
// that will consider the routing configuration
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
