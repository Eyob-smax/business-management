import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

export default createMiddleware(routing);

export const config = {
  // Match only internationalized pathnames
  matcher: [
    // Enable a redirect to a matching locale at the root
    '/',
    
    // Set a cookie to remember the previous locale for
    // all requests that have a locale prefix
    '/(am|en)/:path*',
    
    /**
     * Enable redirects that add a locale to any un-prefixed pathname.
     *
     * `api` MUST stay excluded. Without it the locale middleware treats
     * /api/sync as a page and redirects it to /en/api/sync, which breaks
     * offline sync, push registration and the CSV export - the offline queue
     * would sit there retrying against a redirect forever. Paths containing a
     * dot (sw.js, manifest.webmanifest, icons) are already excluded by the
     * `.*\..*` clause.
     */
    '/((?!api|_next|_vercel|.*\\..*).*)'
  ]
};
