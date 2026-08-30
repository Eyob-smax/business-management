/**
 * Server side of offline sync.
 *
 * The device sends a batch of queued operations. Each carries a clientId that
 * was generated on the phone before the operation ever left it, and every
 * target table has a UNIQUE index on that column. Replaying a batch is
 * therefore a no-op, which is exactly what we need when a phone loses signal
 * mid-request and cannot tell whether the write landed.
 *
 * Every operation gets one of four verdicts, and only two of them let the
 * device forget the data:
 *
 *   applied   -> written now.                         device deletes it
 *   duplicate -> already written (same clientId).     device deletes it
 *   retry     -> transient failure (network/db).      device keeps it queued
 *   rejected  -> malformed and will never apply.      device quarantines it
 *
 * A "rejected" op is never silently dropped: it moves to a quarantine store
 * that surfaces in the UI so a human decides what happens to it.
 */
import "server-only";
import { z } from "zod";
import { sql } from "@/db";
import { getSettings } from "./settings";
import { isPaymentId } from "./payments";
import { businessDateOf } from "./dates";
import { notifyAdmins } from "./push";
import { formatMoney } from "./money";

/* --------------------------------------------------------------- validation */

const cents = z.number().int().min(0).max(1_000_000_000);
const uuidish = z.string().uuid();

const saleLineSchema = z.object({
  menuItemId: uuidish.nullable().optional(),
  name: z.string().trim().min(1).max(120),
  emoji: z.string().max(16).default("\u{1F35B}"),
  categoryName: z.string().max(120).nullable().optional(),
  qty: z.number().int().min(1).max(10_000),
  /** Price shown on the staff screen at the moment of sale. */
  unitPriceCents: cents,
  /** Admin's per-unit cost estimate as the device knew it at sale time. */
  unitCostCents: cents.default(0),
});

const salePayloadSchema = z.object({
  module: z.enum(["restaurant", "shop"]).default("restaurant"),
  soldAt: z.string().datetime({ offset: true }),
  paymentMethod: z
    .string()
    .refine(isPaymentId, "Unknown payment method.")
    .default("cash"),
  discountCents: cents.default(0),
  tableLabel: z.string().trim().max(40).nullable().optional(),
  customerNote: z.string().trim().max(500).nullable().optional(),
  deviceId: z.string().max(80).nullable().optional(),
  lines: z.array(saleLineSchema).min(1).max(200),
});

const notePayloadSchema = z.object({
  module: z.enum(["restaurant", "shop"]).default("restaurant"),
  kind: z.enum(["note", "message", "handover", "issue"]).default("note"),
  noteDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  body: z.string().trim().min(1).max(4000),
  parentId: uuidish.nullable().optional(),
});

const expensePayloadSchema = z.object({
  module: z.enum(["restaurant", "shop"]).default("restaurant"),
  scope: z.enum(["one_off", "daily", "weekly", "monthly"]).default("one_off"),
  label: z.string().trim().min(1).max(120),
  category: z.string().trim().max(60).default("general"),
  amountCents: cents,
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  replacesItemCosts: z.boolean().default(false),
  note: z.string().trim().max(1000).nullable().optional(),
});

export const outboxOpSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("sale"), clientId: z.string().min(6).max(80), payload: salePayloadSchema }),
  z.object({ kind: z.literal("note"), clientId: z.string().min(6).max(80), payload: notePayloadSchema }),
  z.object({ kind: z.literal("expense"), clientId: z.string().min(6).max(80), payload: expensePayloadSchema }),
]);

export const syncRequestSchema = z.object({
  ops: z.array(outboxOpSchema).max(500),
  /** Device clock, used only to report skew back to the phone. */
  clientTime: z.string().datetime({ offset: true }).optional(),
  deviceId: z.string().max(80).optional(),
});

export type OutboxOp = z.infer<typeof outboxOpSchema>;
export type SalePayload = z.infer<typeof salePayloadSchema>;
export type NotePayload = z.infer<typeof notePayloadSchema>;
export type ExpensePayload = z.infer<typeof expensePayloadSchema>;

export type OpVerdict = "applied" | "duplicate" | "retry" | "rejected";
export type OpResult = {
  clientId: string;
  kind: OutboxOp["kind"];
  verdict: OpVerdict;
  reason?: string;
  /** Server row id, when the op produced or matched one. */
  id?: string;
};

/* ------------------------------------------------------------------ helpers */

/** Retriable = we could not tell whether it would ever work. Keep it queued. */
function classifyError(err: unknown): { verdict: OpVerdict; reason: string } {
  const msg = err instanceof Error ? err.message : String(err);
  const permanent =
    /invalid input syntax|violates foreign key|violates check|invalid uuid|out of range|numeric field overflow/i.test(
      msg,
    );
  return { verdict: permanent ? "rejected" : "retry", reason: msg.slice(0, 300) };
}

/* --------------------------------------------------------------- sale ingest */

async function applySale(
  clientId: string,
  p: SalePayload,
  staffId: string,
  businessDate: string,
): Promise<OpResult> {
  // Totals are always recomputed here. The device supplies qty and the price
  // it displayed; it never gets to assert the arithmetic.
  const lines = p.lines.map((l) => ({
    menu_item_id: l.menuItemId ?? null,
    name: l.name,
    emoji: l.emoji || "\u{1F35B}",
    category: l.categoryName ?? null,
    qty: l.qty,
    unit_price: l.unitPriceCents,
    unit_cost: l.unitCostCents,
  }));

  const gross = lines.reduce((t, l) => t + l.qty * l.unit_price, 0);
  const cost = lines.reduce((t, l) => t + l.qty * l.unit_cost, 0);
  const itemCount = lines.reduce((t, l) => t + l.qty, 0);
  const discount = Math.min(p.discountCents, gross);
  const total = gross - discount;

  const rows = (await sql`
    WITH ins AS (
      INSERT INTO sales (
        client_id, module, staff_id, sold_at, business_date, payment_method,
        total_cents, total_cost_cents, discount_cents, item_count,
        customer_note, table_label, device_id, synced_at
      ) VALUES (
        ${clientId}, ${p.module}, ${staffId}::uuid, ${p.soldAt}::timestamptz,
        ${businessDate}::date, ${p.paymentMethod},
        ${total}, ${cost}, ${discount}, ${itemCount},
        ${p.customerNote ?? null}, ${p.tableLabel ?? null}, ${p.deviceId ?? null}, now()
      )
      ON CONFLICT (client_id) DO NOTHING
      RETURNING id
    ),
    li AS (
      INSERT INTO sale_items (
        sale_id, menu_item_id, name_snapshot, emoji_snapshot, category_name_snapshot,
        qty, unit_price_cents, unit_cost_cents, line_total_cents, line_cost_cents
      )
      SELECT ins.id, x.menu_item_id, x.name, x.emoji, x.category,
             x.qty, x.unit_price, x.unit_cost,
             x.qty * x.unit_price, x.qty * x.unit_cost
      FROM ins
      CROSS JOIN jsonb_to_recordset(${JSON.stringify(lines)}::jsonb) AS x(
        menu_item_id uuid, name text, emoji text, category text,
        qty int, unit_price int, unit_cost int
      )
      RETURNING sale_id
    )
    SELECT
      (SELECT id::text FROM ins)                       AS inserted_id,
      (SELECT count(*) FROM li)                        AS line_count,
      (SELECT id::text FROM sales WHERE client_id = ${clientId}) AS existing_id
  `) as Record<string, unknown>[];

  const row = rows[0] ?? {};
  if (row.inserted_id) {
    return { clientId, kind: "sale", verdict: "applied", id: String(row.inserted_id) };
  }
  return {
    clientId,
    kind: "sale",
    verdict: "duplicate",
    id: row.existing_id ? String(row.existing_id) : undefined,
  };
}

async function applyNote(clientId: string, p: NotePayload, authorId: string): Promise<OpResult> {
  const rows = (await sql`
    INSERT INTO notes (client_id, module, kind, note_date, body, author_id, parent_id)
    VALUES (${clientId}, ${p.module}, ${p.kind}, ${p.noteDate}::date, ${p.body},
            ${authorId}::uuid, ${p.parentId ?? null}::uuid)
    ON CONFLICT (client_id) DO NOTHING
    RETURNING id::text
  `) as Record<string, unknown>[];

  return rows.length
    ? { clientId, kind: "note", verdict: "applied", id: String(rows[0].id) }
    : { clientId, kind: "note", verdict: "duplicate" };
}

async function applyExpense(
  clientId: string,
  p: ExpensePayload,
  createdById: string,
): Promise<OpResult> {
  const rows = (await sql`
    INSERT INTO expenses (
      client_id, module, scope, label, category, amount_cents,
      effective_date, end_date, replaces_item_costs, note, created_by_id
    ) VALUES (
      ${clientId}, ${p.module}, ${p.scope}, ${p.label}, ${p.category}, ${p.amountCents},
      ${p.effectiveDate}::date, ${p.endDate ?? null}::date, ${p.replacesItemCosts},
      ${p.note ?? null}, ${createdById}::uuid
    )
    ON CONFLICT (client_id) DO NOTHING
    RETURNING id::text
  `) as Record<string, unknown>[];

  return rows.length
    ? { clientId, kind: "expense", verdict: "applied", id: String(rows[0].id) }
    : { clientId, kind: "expense", verdict: "duplicate" };
}

/* ----------------------------------------------------------------- the batch */

export type SyncOutcome = {
  results: OpResult[];
  serverTime: string;
  applied: number;
  duplicates: number;
  retry: number;
  rejected: number;
};

/**
 * Apply a batch. Operations are processed one by one so a single bad op can
 * never poison the good ones next to it in the queue.
 */
export async function ingestBatch(
  ops: OutboxOp[],
  actor: { id: string; name: string; role: "admin" | "staff" },
): Promise<SyncOutcome> {
  const { business, notify } = await getSettings();
  const results: OpResult[] = [];

  // Only what actually landed this round feeds the notification summary.
  const appliedSales: { totalCents: number; soldAt: string; itemCount: number }[] = [];
  const appliedNotes: { body: string; kind: string }[] = [];

  for (const op of ops) {
    try {
      if (op.kind === "sale") {
        // Staff may only file their own sales; admins can backfill for anyone.
        const businessDate = businessDateOf(
          op.payload.soldAt,
          business.timezone,
          business.dayCutoffHour,
        );
        const res = await applySale(op.clientId, op.payload, actor.id, businessDate);
        results.push(res);
        if (res.verdict === "applied") {
          const gross = op.payload.lines.reduce((t, l) => t + l.qty * l.unitPriceCents, 0);
          appliedSales.push({
            totalCents: gross - Math.min(op.payload.discountCents, gross),
            soldAt: op.payload.soldAt,
            itemCount: op.payload.lines.reduce((t, l) => t + l.qty, 0),
          });
        }
      } else if (op.kind === "note") {
        const res = await applyNote(op.clientId, op.payload, actor.id);
        results.push(res);
        if (res.verdict === "applied") {
          appliedNotes.push({ body: op.payload.body, kind: op.payload.kind });
        }
      } else {
        // Expenses are an admin-only concept; a staff device should never
        // queue one, but if it somehow does we refuse rather than trust it.
        if (actor.role !== "admin") {
          results.push({
            clientId: op.clientId,
            kind: op.kind,
            verdict: "rejected",
            reason: "Only admins can record expenses.",
          });
          continue;
        }
        results.push(await applyExpense(op.clientId, op.payload, actor.id));
      }
    } catch (err) {
      const { verdict, reason } = classifyError(err);
      results.push({ clientId: op.clientId, kind: op.kind, verdict, reason });
    }
  }

  await notifyForBatch(appliedSales, appliedNotes, actor, notify);

  const count = (v: OpVerdict) => results.filter((r) => r.verdict === v).length;
  return {
    results,
    serverTime: new Date().toISOString(),
    applied: count("applied"),
    duplicates: count("duplicate"),
    retry: count("retry"),
    rejected: count("rejected"),
  };
}

/** One push per batch, not one per sale. */
async function notifyForBatch(
  sales: { totalCents: number; soldAt: string; itemCount: number }[],
  notes: { body: string; kind: string }[],
  actor: { id: string; name: string },
  notify: { onSale: boolean; saleMinCents: number; onNote: boolean; onOfflineBatch: boolean },
) {
  const tasks: Promise<unknown>[] = [];

  if (sales.length && notify.onSale) {
    const total = sales.reduce((t, s) => t + s.totalCents, 0);
    const items = sales.reduce((t, s) => t + s.itemCount, 0);
    const oldest = Math.min(...sales.map((s) => Date.parse(s.soldAt)));
    const lagMinutes = Math.round((Date.now() - oldest) / 60000);
    const wasOffline = lagMinutes >= 10;

    const passesFloor =
      notify.saleMinCents === 0 || total >= notify.saleMinCents || sales.length > 1;

    if (passesFloor && (!wasOffline || notify.onOfflineBatch)) {
      const title =
        sales.length === 1
          ? `New sale - ${formatMoney(total)}`
          : `${sales.length} new sales - ${formatMoney(total)}`;
      const body = wasOffline
        ? `${actor.name} synced ${sales.length} order${sales.length > 1 ? "s" : ""} recorded offline (oldest ${lagMinutes >= 120 ? `${Math.round(lagMinutes / 60)}h` : `${lagMinutes} min`} ago) - ${items} item${items > 1 ? "s" : ""}.`
        : `${actor.name} - ${items} item${items > 1 ? "s" : ""}.`;

      tasks.push(
        notifyAdmins(
          {
            title,
            body,
            url: "/admin/log",
            kind: "sale",
            tag: "sale",
            urgent: false,
            data: { totalCents: total, count: sales.length, offline: wasOffline },
          },
          actor.id,
        ),
      );
    }
  }

  if (notes.length && notify.onNote) {
    const first = notes[0];
    tasks.push(
      notifyAdmins(
        {
          title:
            notes.length === 1
              ? `${actor.name} left a ${first.kind}`
              : `${actor.name} left ${notes.length} notes`,
          body: first.body.slice(0, 140),
          url: "/admin/notes",
          kind: "note",
          tag: "note",
          urgent: first.kind === "issue",
        },
        actor.id,
      ),
    );
  }

  // Never let a push failure fail the sync - the sales are already committed.
  await Promise.allSettled(tasks);
}
