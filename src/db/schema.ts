/**
 * Database schema (Neon Postgres via Drizzle).
 *
 * Money convention: EVERY monetary column is an integer in minor units
 * ("cents" / santim). 120.50 Br is stored as 12050. This avoids float drift
 * and the string-numeric awkwardness of pg NUMERIC in JS. Convert at the
 * edges with lib/money.ts.
 *
 * Offline convention: any row a phone can create while offline carries a
 * client-generated `clientId` with a UNIQUE index. Sync is therefore
 * idempotent - replaying a queued item can never double-insert.
 */
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  date,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ enums */

export const roleEnum = pgEnum("role", ["admin", "staff"]);
/**
 * What a person is allowed to do. See lib/access.ts for the policy.
 * full = sign in and record; read_only = sign in but record nothing;
 * blocked = cannot sign in.
 */
export const accessLevelEnum = pgEnum("access_level", ["full", "read_only", "blocked"]);
export const moduleEnum = pgEnum("module", ["restaurant", "shop"]);
export const saleStatusEnum = pgEnum("sale_status", ["completed", "void"]);
export const paymentEnum = pgEnum("payment_method", [
  "cash",
  "telebirr",
  "card",
  "credit",
  "other",
]);
/** How an expense spreads across the calendar when computing daily profit. */
export const expenseScopeEnum = pgEnum("expense_scope", [
  "one_off",
  "daily",
  "weekly",
  "monthly",
]);
export const noteKindEnum = pgEnum("note_kind", ["note", "message", "handover", "issue"]);

/* ------------------------------------------------------------------ users */

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    /** lower(name) - the actual login handle. Unique. */
    handle: text("handle").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: roleEnum("role").notNull().default("staff"),
    /**
     * Replaces the old is_active boolean. Admins move staff between the three
     * levels from Team; enforcement is in lib/auth.ts, and the write path
     * re-reads this column rather than trusting the session cookie, so a
     * change takes effect on the next action instead of in 120 days.
     */
    accessLevel: accessLevelEnum("access_level").notNull().default("full"),
    /** Emoji shown in the UI instead of a photo upload. */
    avatar: text("avatar").notNull().default("\u{1F464}"),
    mustChangePassword: boolean("must_change_password").notNull().default(false),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_handle_uq").on(t.handle)],
);

/* ---------------------------------------------------------- menu / catalog */

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    module: moduleEnum("module").notNull().default("restaurant"),
    name: text("name").notNull(),
    emoji: text("emoji").notNull().default("\u{1F37D}"),
    /** Accent token used for chips and chart series. */
    color: text("color").notNull().default("amber"),
    sortOrder: integer("sort_order").notNull().default(0),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("categories_module_idx").on(t.module, t.sortOrder)],
);

export const menuItems = pgTable(
  "menu_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    module: moduleEnum("module").notNull().default("restaurant"),
    categoryId: uuid("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    emoji: text("emoji").notNull().default("\u{1F35B}"),
    /** Selling price, minor units. */
    priceCents: integer("price_cents").notNull(),
    /** Estimated cost to produce one unit, minor units. Drives est. profit. */
    estCostCents: integer("est_cost_cents").notNull().default(0),
    unit: text("unit").notNull().default("plate"),
    isAvailable: boolean("is_available").notNull().default(true),
    /** Pinned to the front of the staff tile grid. */
    isFeatured: boolean("is_featured").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("menu_items_module_idx").on(t.module, t.archivedAt),
    index("menu_items_category_idx").on(t.categoryId),
  ],
);

/* ------------------------------------------------------------------- sales */

export const sales = pgTable(
  "sales",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Idempotency key generated on the device before the sale ever leaves it. */
    clientId: text("client_id").notNull(),
    module: moduleEnum("module").notNull().default("restaurant"),
    staffId: uuid("staff_id").references(() => users.id, { onDelete: "set null" }),
    /** Real instant of sale as recorded by the device, kept even if synced days later. */
    soldAt: timestamp("sold_at", { withTimezone: true }).notNull(),
    /**
     * The trading day this sale belongs to, resolved server-side from soldAt
     * using the business timezone and day-cutoff hour (a 1am sale can belong
     * to the previous trading day). All reporting groups on this column.
     */
    businessDate: date("business_date").notNull(),
    status: saleStatusEnum("status").notNull().default("completed"),
    paymentMethod: paymentEnum("payment_method").notNull().default("cash"),
    /** Sum of line totals less discount, minor units. Denormalised for reporting. */
    totalCents: integer("total_cents").notNull().default(0),
    /** Sum of line est-costs at time of sale, minor units. */
    totalCostCents: integer("total_cost_cents").notNull().default(0),
    discountCents: integer("discount_cents").notNull().default(0),
    itemCount: integer("item_count").notNull().default(0),
    customerNote: text("customer_note"),
    tableLabel: text("table_label"),
    /** Which phone produced it - useful when two staff share a shift. */
    deviceId: text("device_id"),
    /** When the row actually landed in Postgres (vs soldAt on the device). */
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    voidedById: uuid("voided_by_id").references(() => users.id, { onDelete: "set null" }),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidReason: text("void_reason"),
  },
  (t) => [
    uniqueIndex("sales_client_id_uq").on(t.clientId),
    index("sales_date_idx").on(t.module, t.businessDate),
    index("sales_sold_at_idx").on(t.soldAt),
    index("sales_staff_idx").on(t.staffId, t.businessDate),
  ],
);

/**
 * Sale lines snapshot name / price / cost AT THE MOMENT OF SALE. Never join to
 * menu_items for money - otherwise editing a price next month silently
 * rewrites last month's reported profit.
 */
export const saleItems = pgTable(
  "sale_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    saleId: uuid("sale_id")
      .notNull()
      .references(() => sales.id, { onDelete: "cascade" }),
    menuItemId: uuid("menu_item_id").references(() => menuItems.id, {
      onDelete: "set null",
    }),
    nameSnapshot: text("name_snapshot").notNull(),
    emojiSnapshot: text("emoji_snapshot").notNull().default("\u{1F35B}"),
    categoryNameSnapshot: text("category_name_snapshot"),
    qty: integer("qty").notNull().default(1),
    unitPriceCents: integer("unit_price_cents").notNull(),
    unitCostCents: integer("unit_cost_cents").notNull().default(0),
    lineTotalCents: integer("line_total_cents").notNull(),
    lineCostCents: integer("line_cost_cents").notNull().default(0),
  },
  (t) => [
    index("sale_items_sale_idx").on(t.saleId),
    index("sale_items_item_idx").on(t.menuItemId),
  ],
);

/* ---------------------------------------------------------------- expenses */

export const expenses = pgTable(
  "expenses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: text("client_id").notNull(),
    module: moduleEnum("module").notNull().default("restaurant"),
    /** one_off hits its date only; daily/weekly/monthly spread across the period. */
    scope: expenseScopeEnum("scope").notNull().default("one_off"),
    label: text("label").notNull(),
    category: text("category").notNull().default("general"),
    amountCents: integer("amount_cents").notNull(),
    /** First day the expense applies to. */
    effectiveDate: date("effective_date").notNull(),
    /** Last day it applies to; null = still running (open-ended recurring). */
    endDate: date("end_date"),
    /**
     * THE OVERRIDE SWITCH. When true this expense represents the real cost of
     * goods for its period, so per-item estimated costs are IGNORED for those
     * days and this amount is used instead. Lets admins start from rough
     * per-plate estimates and later override with actual market spend.
     */
    replacesItemCosts: boolean("replaces_item_costs").notNull().default(false),
    note: text("note"),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("expenses_client_id_uq").on(t.clientId),
    index("expenses_window_idx").on(t.module, t.effectiveDate, t.endDate),
  ],
);

/* -------------------------------------------------------- notes & messages */

export const notes = pgTable(
  "notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: text("client_id").notNull(),
    module: moduleEnum("module").notNull().default("restaurant"),
    kind: noteKindEnum("kind").notNull().default("note"),
    /** The trading day this note is attached to (day log / shift handover). */
    noteDate: date("note_date").notNull(),
    body: text("body").notNull(),
    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
    /** Threading: replies point at their root note. */
    parentId: uuid("parent_id"),
    isPinned: boolean("is_pinned").notNull().default(false),
    /** Admin acknowledged / ticked it off. */
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("notes_client_id_uq").on(t.clientId),
    index("notes_date_idx").on(t.module, t.noteDate),
    index("notes_parent_idx").on(t.parentId),
  ],
);

/* ---------------------------------------------------- push & notifications */

export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),
    /** Consecutive delivery failures; the row is pruned once the push service 404s. */
    failureCount: integer("failure_count").notNull().default(0),
    lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("push_endpoint_uq").on(t.endpoint)],
);

/** In-app notification centre - the durable record behind each push. */
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull().default("info"),
    title: text("title").notNull(),
    body: text("body").notNull(),
    url: text("url"),
    data: jsonb("data").$type<Record<string, unknown>>(),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.readAt)],
);

/* ----------------------------------------------------- settings & activity */

/** Key/value store for business config. */
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const activityLog = pgTable(
  "activity_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entity: text("entity"),
    entityId: text("entity_id"),
    detail: jsonb("detail").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("activity_created_idx").on(t.createdAt)],
);

export type User = typeof users.$inferSelect;
export type MenuItem = typeof menuItems.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Sale = typeof sales.$inferSelect;
export type SaleItem = typeof saleItems.$inferSelect;
export type Expense = typeof expenses.$inferSelect;
export type Note = typeof notes.$inferSelect;
export type AppNotification = typeof notifications.$inferSelect;
