import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";

import en from "../../messages/en.json";

/**
 * Locale setup, plus the rule that a missing phrase is never fatal.
 *
 * next-intl's default is to throw, and a throw inside a server component takes
 * the whole page with it - which is how one absent Amharic key turned into
 * "Application error: a client-side exception has occurred" on a blank screen.
 * A restaurant losing its till because a caption was not translated is not a
 * trade anyone would make.
 *
 * So: fall back to the English phrase, and only if that is missing too show
 * the key itself. The gap still gets found - `npm run i18n:audit` fails on it,
 * and the console still carries the warning - it just no longer takes the app
 * down on the way.
 */
function lookup(messages: Record<string, unknown>, path: string): string | null {
  const value = path
    .split(".")
    .reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], messages);
  return typeof value === "string" ? value : null;
}

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;

  if (!locale || !(routing.locales as readonly string[]).includes(locale)) {
    locale = routing.defaultLocale;
  }

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,

    onError(error) {
      // Worth knowing about, not worth crashing over.
      if (process.env.NODE_ENV !== "production") console.warn(String(error));
    },

    getMessageFallback({ key, namespace }) {
      const path = namespace ? `${namespace}.${key}` : key;
      return lookup(en as Record<string, unknown>, path) ?? path;
    },
  };
});
