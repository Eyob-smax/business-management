/**
 * Two questions this answers, both of which have already broken the app once:
 *
 *   1. Do the two catalogs hold the same keys? A key present in English and
 *      absent in Amharic used to crash the page it appeared on - next-intl
 *      throws on a missing message, and a throw in a server component takes the
 *      whole render with it. `src/i18n/request.ts` now falls back to English
 *      instead, so a gap is a blemish rather than an outage, but it is still a
 *      gap and this is what finds it.
 *
 *   2. Is any user-facing English still hardcoded in a component? The app has
 *      to work in Amharic, and a phrase compiled into JSX cannot.
 *
 * Exits non-zero on either, so it can guard a commit.
 *
 *   npm run i18n:audit
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();

type Catalog = Record<string, Record<string, string>>;

const en = JSON.parse(readFileSync("messages/en.json", "utf8")) as Catalog;
const am = JSON.parse(readFileSync("messages/am.json", "utf8")) as Catalog;

let failures = 0;

function fail(heading: string, lines: string[]) {
  failures += lines.length;
  console.log(`\n${heading}`);
  for (const line of lines) console.log(`   ${line}`);
}

/* ------------------------------------------------------------ 1. parity */

function flatten(catalog: Catalog): Set<string> {
  const keys = new Set<string>();
  for (const [namespace, entries] of Object.entries(catalog)) {
    for (const key of Object.keys(entries)) keys.add(`${namespace}.${key}`);
  }
  return keys;
}

const enKeys = flatten(en);
const amKeys = flatten(am);

const missingInAm = [...enKeys].filter((k) => !amKeys.has(k)).sort();
const missingInEn = [...amKeys].filter((k) => !enKeys.has(k)).sort();

if (missingInAm.length) fail("Missing from messages/am.json:", missingInAm);
if (missingInEn.length) fail("Missing from messages/en.json:", missingInEn);

// An Amharic value identical to the English one is almost always an untranslated
// copy. Names, placeholders and pure punctuation are the honest exceptions.
const SAME_IS_FINE = /^(?:[^\p{L}]*|Telebirr|M-Pesa|CBE Birr|you@example\.com|owner@example\.com|Br)$/u;
const untranslated = [...enKeys]
  .filter((k) => amKeys.has(k))
  .filter((k) => {
    const [ns, key] = k.split(".");
    const a = am[ns][key];
    return a === en[ns][key] && !SAME_IS_FINE.test(a);
  })
  .sort();

if (untranslated.length) {
  console.log(`\nSame text in both languages (${untranslated.length}) - check these are names, not gaps:`);
  for (const k of untranslated) console.log(`   ${k} = ${JSON.stringify(am[k.split(".")[0]][k.split(".")[1]])}`);
}

/* -------------------------------------------------- 2. hardcoded English */

/** Props whose values reach the screen. */
const TEXT_PROPS =
  /\b(title|subtitle|label|placeholder|body|hint|description|note|confirmLabel|cancelLabel|emptyBody|aria-label)\s*=\s*"([^"]{2,})"/g;
/** Bare text between tags, e.g. >Save changes< */
const JSX_TEXT = />\s*([A-Z][A-Za-z0-9'’,.\-!?&%() ]{3,})\s*</g;
/** Strings inside toast and option literals. */
const OBJ_TEXT = /\b(title|body|message|label|reason)\s*:\s*"([^"]{4,})"/g;

/**
 * Files that legitimately contain English.
 *
 *   global-error.tsx  replaces the whole document when even the providers have
 *                     failed, so it carries both languages written out by hand.
 *   charts.tsx        axis formatting, no prose.
 */
const SKIP_FILES = new Set(["global-error.tsx", "charts.tsx"]);

/** Values that are identifiers or examples rather than prose. */
const NOT_PROSE =
  /^(?:true|false|null|undefined|[\d.,%\s]+|#[0-9a-f]+|var\(|\/|https?:|[A-Z_]{3,}(?:,\s*[A-Z_]{3,})*(?:\s+and\s+[A-Z_]{3,})?$|[a-z][\w.]*@[\w.]+$|[a-z-]+$)/i;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (name.endsWith(".tsx") && !SKIP_FILES.has(name)) out.push(path);
  }
  return out;
}

const hardcoded: string[] = [];

for (const path of walk(join(ROOT, "src"))) {
  const source = readFileSync(path, "utf8");
  const hits = new Set<string>();

  for (const m of source.matchAll(TEXT_PROPS)) if (!NOT_PROSE.test(m[2])) hits.add(m[2]);
  for (const m of source.matchAll(JSX_TEXT)) if (!NOT_PROSE.test(m[1])) hits.add(m[1].trim());
  for (const m of source.matchAll(OBJ_TEXT)) if (!NOT_PROSE.test(m[2])) hits.add(m[2]);

  const rel = relative(ROOT, path).replace(/\\/g, "/");
  for (const hit of [...hits].sort()) hardcoded.push(`${rel}: ${hit}`);
}

if (hardcoded.length) fail(`Hardcoded English (${hardcoded.length}):`, hardcoded);

/* ----------------------------------------------------------------- verdict */

if (failures === 0) {
  console.log(`\n  Catalogs match: ${enKeys.size} keys in both languages.`);
  console.log("  No hardcoded user-facing English found.\n");
  process.exit(0);
}

console.log(`\n  ${failures} problem${failures === 1 ? "" : "s"}.\n`);
process.exit(1);
