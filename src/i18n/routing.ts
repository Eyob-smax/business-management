import { defineRouting } from 'next-intl/routing';
import { createNavigation } from 'next-intl/navigation';

export const routing = defineRouting({
  // A list of all locales that are supported
  locales: ['en', 'am'],

  // Amharic is the default: this is an Ethiopian restaurant and most of the
  // people using it every day read Amharic first. English is at /en.
  defaultLocale: 'am',
  
  // Only prefix the URL for non-default locales (e.g. /en/admin)
  localePrefix: 'as-needed'
});

// Lightweight wrappers around Next.js' navigation APIs
// that will consider the routing configuration
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
