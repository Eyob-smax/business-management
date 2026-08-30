/**
 * How customers pay.
 *
 * This is a catalog in code rather than a Postgres enum on purpose. Banks
 * merge, rebrand and launch constantly in Ethiopia, and needing a database
 * migration to accept "Ahadu Bank" would mean the app quietly cannot record a
 * real payment. The column is plain text; this list is what the UI offers and
 * what the sync endpoint will accept.
 *
 * Adding one is a single line here. Removing one is not: old sales keep their
 * stored id, so `labelFor` falls back to the raw id rather than showing blank.
 */

export type PaymentKind = "cash" | "wallet" | "bank" | "card" | "credit" | "other";

export type PaymentMethod = {
  id: string;
  en: string;
  am: string;
  kind: PaymentKind;
  /** Offered as a one-tap chip on the till instead of behind the bank list. */
  quick?: boolean;
  /**
   * Kept for the label lookup but never offered again. Sales recorded before a
   * method was withdrawn still have to render as words rather than as a raw id,
   * and a sale queued on a phone that has not updated yet still has to sync.
   */
  retired?: boolean;
};

export const PAYMENT_METHODS: PaymentMethod[] = [
  { id: "cash", en: "Cash", am: "ጥሬ ገንዘብ", kind: "cash", quick: true },

  /* ---- what the money actually arrives through, in that order ---- */
  { id: "cbe", en: "Commercial Bank of Ethiopia", am: "የኢትዮጵያ ንግድ ባንክ", kind: "bank", quick: true },
  { id: "abyssinia", en: "Bank of Abyssinia", am: "የአቢሲኒያ ባንክ", kind: "bank", quick: true },
  { id: "telebirr", en: "Telebirr", am: "ቴሌብር", kind: "wallet", quick: true },

  /* ---- mobile money ---- */
  { id: "mpesa", en: "M-Pesa", am: "ኤም-ፔሳ", kind: "wallet", quick: true },
  { id: "cbe_birr", en: "CBE Birr", am: "ሲቢኢ ብር", kind: "wallet" },
  { id: "amole", en: "Amole", am: "አሞሌ", kind: "wallet" },
  { id: "hellocash", en: "HelloCash", am: "ሄሎካሽ", kind: "wallet" },
  { id: "ebirr", en: "E-Birr", am: "ኢ-ብር", kind: "wallet" },
  { id: "kacha", en: "Kacha", am: "ካቻ", kind: "wallet" },

  /* ---- banks (transfer / POS) ---- */
  { id: "awash", en: "Awash Bank", am: "አዋሽ ባንክ", kind: "bank" },
  { id: "dashen", en: "Dashen Bank", am: "ዳሽን ባንክ", kind: "bank" },
  { id: "coop_oromia", en: "Cooperative Bank of Oromia", am: "የኦሮሚያ ኅብረት ሥራ ባንክ", kind: "bank" },
  { id: "hibret", en: "Hibret Bank", am: "ኅብረት ባንክ", kind: "bank" },
  { id: "nib", en: "Nib International Bank", am: "ንብ ኢንተርናሽናል ባንክ", kind: "bank" },
  { id: "wegagen", en: "Wegagen Bank", am: "ወጋገን ባንክ", kind: "bank" },
  { id: "zemen", en: "Zemen Bank", am: "ዘመን ባንክ", kind: "bank" },
  { id: "oromia", en: "Oromia Bank", am: "ኦሮሚያ ባንክ", kind: "bank" },
  { id: "lion", en: "Lion International Bank", am: "አንበሳ ኢንተርናሽናል ባንክ", kind: "bank" },
  { id: "bunna", en: "Bunna Bank", am: "ቡና ባንክ", kind: "bank" },
  { id: "berhan", en: "Berhan Bank", am: "ብርሃን ባንክ", kind: "bank" },
  { id: "abay", en: "Abay Bank", am: "አባይ ባንክ", kind: "bank" },
  { id: "addis", en: "Addis International Bank", am: "አዲስ ኢንተርናሽናል ባንክ", kind: "bank" },
  { id: "enat", en: "Enat Bank", am: "እናት ባንክ", kind: "bank" },
  { id: "debub_global", en: "Debub Global Bank", am: "ደቡብ ግሎባል ባንክ", kind: "bank" },
  { id: "amhara", en: "Amhara Bank", am: "አማራ ባንክ", kind: "bank" },
  { id: "tsehay", en: "Tsehay Bank", am: "ፀሐይ ባንክ", kind: "bank" },
  { id: "ahadu", en: "Ahadu Bank", am: "አሐዱ ባንክ", kind: "bank" },
  { id: "siinqee", en: "Siinqee Bank", am: "ሲንቄ ባንክ", kind: "bank" },
  { id: "shabelle", en: "Shabelle Bank", am: "ሸበሌ ባንክ", kind: "bank" },
  { id: "zamzam", en: "ZamZam Bank", am: "ዘምዘም ባንክ", kind: "bank" },
  { id: "hijra", en: "Hijra Bank", am: "ሂጅራ ባንክ", kind: "bank" },
  { id: "rammis", en: "Rammis Bank", am: "ራሚስ ባንክ", kind: "bank" },
  { id: "gadaa", en: "Gadaa Bank", am: "ገዳ ባንክ", kind: "bank" },
  { id: "goh", en: "Goh Betoch Bank", am: "ጎህ ቤቶች ባንክ", kind: "bank" },
  { id: "sidama", en: "Sidama Bank", am: "ሲዳማ ባንክ", kind: "bank" },
  { id: "global", en: "Global Bank Ethiopia", am: "ግሎባል ባንክ ኢትዮጵያ", kind: "bank" },

  /* ---- everything else ---- */
  { id: "other", en: "Other", am: "ሌላ", kind: "other" },

  /* ---- withdrawn: never offered again, still readable on old sales ---- */
  { id: "card", en: "Card", am: "ካርድ", kind: "card", retired: true },
  { id: "credit", en: "Credit (pay later)", am: "ዕዳ (በኋላ ይከፍላል)", kind: "credit", retired: true },
];

export const PAYMENT_IDS = PAYMENT_METHODS.map((m) => m.id);

const BY_ID = new Map(PAYMENT_METHODS.map((m) => [m.id, m]));

export const isPaymentId = (value: unknown): value is string =>
  typeof value === "string" && BY_ID.has(value);

/** Falls back to the raw id, so a retired method never renders as blank. */
export function labelFor(id: string, locale = "en"): string {
  const method = BY_ID.get(id);
  if (!method) return id;
  return locale === "am" ? method.am : method.en;
}

export const paymentKind = (id: string): PaymentKind => BY_ID.get(id)?.kind ?? "other";

/** Everything still on offer, in catalog order. */
const offered = () => PAYMENT_METHODS.filter((m) => !m.retired);

export const quickMethods = () => offered().filter((m) => m.quick);

/** Banks and wallets, for the "more ways to pay" list. */
export const transferMethods = () =>
  offered().filter((m) => !m.quick && (m.kind === "bank" || m.kind === "wallet"));

export const otherMethods = () =>
  offered().filter((m) => !m.quick && m.kind !== "bank" && m.kind !== "wallet");
