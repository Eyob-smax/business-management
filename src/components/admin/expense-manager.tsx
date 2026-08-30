"use client";
/**
 * Expense manager.
 *
 * The interesting control here is "this replaces my per-plate estimates".
 * It is explained in plain words in the form, and the list shows which rows
 * are overriding, because getting that wrong quietly doubles or halves the
 * reported profit.
 */
import * as React from "react";
import { useActionState } from "react";
import {
  CalendarClock,
  Info,
  Pencil,
  Plus,
  Repeat,
  Replace,
  Square,
  Trash2,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMoney, parseMoneyToCents } from "@/lib/money";
import { formatDayLabel, today } from "@/lib/dates";
import type { ExpenseRow } from "@/lib/expenses";
import {
  deleteExpense,
  endRecurringExpense,
  saveExpense,
} from "@/app/actions/expenses";
import type { ActionResult } from "@/app/actions/_result";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  IconButton,
  Input,
  Segmented,
  Select,
  Textarea,
  Toggle,
} from "@/components/ui/primitives";
import { ConfirmDialog, Sheet } from "@/components/ui/overlay";
import { useToast } from "@/components/ui/toast";

type Scope = ExpenseRow["scope"];

const SCOPE_LABEL: Record<Scope, string> = {
  one_off: "One time",
  daily: "Every day",
  weekly: "Every week",
  monthly: "Every month",
};

const SCOPE_HELP: Record<Scope, string> = {
  one_off: "Counted on its date only.",
  daily: "Counted in full on every day from the start date.",
  weekly: "Spread as one seventh per day, so weekly and monthly reports agree.",
  monthly: "Spread across the days of each month.",
};

export function ExpenseManager({
  expenses,
  categories,
  costingMode,
}: {
  expenses: ExpenseRow[];
  categories: string[];
  costingMode: "auto" | "item" | "period";
}) {
  const { toast } = useToast();
  const [editing, setEditing] = React.useState<ExpenseRow | "new" | null>(null);
  const [deleting, setDeleting] = React.useState<ExpenseRow | null>(null);
  const [tab, setTab] = React.useState<"active" | "all">("active");

  const shown = tab === "active" ? expenses.filter((e) => e.isActive) : expenses;

  const recurringPerDay = expenses
    .filter((e) => e.isActive && e.scope !== "one_off")
    .reduce((t, e) => t + e.perDayCents, 0);

  const overrideActive = expenses.some((e) => e.isActive && e.replacesItemCosts);

  return (
    <div className="space-y-4">
      <Button
        variant="primary"
        size="lg"
        block
        icon={<Plus className="size-4" />}
        onClick={() => setEditing("new")}
      >
        Record an expense
      </Button>

      <Card className="p-4">
        <p className="text-[12px] font-bold tracking-[0.05em] text-ink-3 uppercase">
          Running cost per day
        </p>
        <p className="nums mt-1.5 text-[24px] leading-none font-bold text-ink">
          {formatMoney(recurringPerDay)}
        </p>
        <p className="mt-2 text-[12.5px] leading-relaxed text-ink-3">
          This is what your repeating expenses add up to for a single day. You need to take at
          least this much, before food cost, just to break even.
        </p>

        {overrideActive ? (
          <p className="mt-3 flex items-start gap-2 rounded-[12px] bg-info-soft px-3 py-2.5 text-[12px] leading-snug text-info">
            <Replace className="mt-px size-3.5 shrink-0" />
            <span>
              {costingMode === "item" ? (
                <>
                  An expense is marked as replacing your per-plate estimates, but costing is set to{" "}
                  <strong>estimates only</strong> in Settings - so it is being counted as an
                  ordinary running cost instead.
                </>
              ) : (
                <>
                  Food cost is coming from your recorded expenses, not the per-plate estimates, for
                  the days those expenses cover.
                </>
              )}
            </span>
          </p>
        ) : null}
      </Card>

      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: "active", label: "Active now" },
          { value: "all", label: `Everything (${expenses.length})` },
        ]}
      />

      {shown.length === 0 ? (
        <EmptyState
          icon={<Wallet className="size-6" />}
          title={tab === "active" ? "Nothing running right now" : "No expenses recorded"}
          body="Add rent, salaries, gas, or a market run. Recurring ones only need entering once."
          action={
            <Button variant="primary" onClick={() => setEditing("new")}>
              Record an expense
            </Button>
          }
        />
      ) : (
        <Card className="divide-y divide-line">
          {shown.map((e) => (
            <div key={e.id} className="flex items-start gap-3 p-3.5">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-1.5 text-[14px] font-semibold text-ink">
                  {e.label}
                  {e.replacesItemCosts ? (
                    <Badge tone="info">
                      <Replace className="size-3" />
                      replaces estimates
                    </Badge>
                  ) : null}
                  {!e.isActive ? <Badge tone="neutral">ended</Badge> : null}
                </p>

                <p className="nums mt-1 flex flex-wrap items-center gap-x-2 text-[12px] text-ink-3">
                  <span className="font-semibold text-ink-2">{formatMoney(e.amountCents)}</span>
                  <span aria-hidden>-</span>
                  <span className="flex items-center gap-1">
                    {e.scope === "one_off" ? (
                      <Square className="size-3" />
                    ) : (
                      <Repeat className="size-3" />
                    )}
                    {SCOPE_LABEL[e.scope]}
                  </span>
                  {e.scope !== "one_off" ? (
                    <>
                      <span aria-hidden>-</span>
                      <span>{formatMoney(e.perDayCents)}/day</span>
                    </>
                  ) : null}
                  <span aria-hidden>-</span>
                  <span className="capitalize">{e.category}</span>
                </p>

                <p className="mt-1 flex items-center gap-1 text-[11.5px] text-ink-3">
                  <CalendarClock className="size-3" />
                  {e.scope === "one_off"
                    ? formatDayLabel(e.effectiveDate)
                    : `from ${formatDayLabel(e.effectiveDate, true)}${
                        e.endDate ? ` to ${formatDayLabel(e.endDate, true)}` : " - still running"
                      }`}
                </p>

                {e.note ? (
                  <p className="mt-1.5 text-[12px] leading-snug text-ink-2">{e.note}</p>
                ) : null}
              </div>

              <div className="flex shrink-0 items-center gap-0.5">
                {e.scope !== "one_off" && !e.endDate ? (
                  <IconButton
                    label={`Stop ${e.label}`}
                    onClick={async () => {
                      const res = await endRecurringExpense(e.id, today());
                      toast(
                        res.ok
                          ? { tone: "success", title: res.message ?? "Stopped" }
                          : { tone: "error", title: res.error ?? "Could not stop it" },
                      );
                    }}
                  >
                    <Square className="size-4" />
                  </IconButton>
                ) : null}
                <IconButton label={`Edit ${e.label}`} onClick={() => setEditing(e)}>
                  <Pencil className="size-4" />
                </IconButton>
                <IconButton label={`Delete ${e.label}`} onClick={() => setDeleting(e)}>
                  <Trash2 className="size-4" />
                </IconButton>
              </div>
            </div>
          ))}
        </Card>
      )}

      {editing ? (
        <ExpenseSheet
          expense={editing === "new" ? null : editing}
          categories={categories}
          onClose={() => setEditing(null)}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title={`Delete ${deleting?.label}?`}
        body="It will stop counting towards your costs, in every period it touched."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          if (!deleting) return;
          const res = await deleteExpense(deleting.id);
          setDeleting(null);
          toast(
            res.ok
              ? { tone: "success", title: res.message ?? "Deleted" }
              : { tone: "error", title: res.error ?? "Could not delete" },
          );
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------- form */

function ExpenseSheet({
  expense,
  categories,
  onClose,
}: {
  expense: ExpenseRow | null;
  categories: string[];
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(saveExpense, null);

  const [scope, setScope] = React.useState<Scope>(expense?.scope ?? "one_off");
  const [override, setOverride] = React.useState(expense?.replacesItemCosts ?? false);
  const [amount, setAmount] = React.useState(
    expense ? (expense.amountCents / 100).toFixed(2) : "",
  );
  const [hasEnd, setHasEnd] = React.useState(Boolean(expense?.endDate));

  React.useEffect(() => {
    if (!state) return;
    if (state.ok) {
      toast({ tone: "success", title: state.message ?? "Saved" });
      onClose();
    } else {
      toast({ tone: "error", title: state.error ?? "Could not save" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const cents = parseMoneyToCents(amount) ?? 0;
  const preview =
    scope === "weekly"
      ? Math.round(cents / 7)
      : scope === "monthly"
        ? Math.round(cents / 30)
        : cents;

  return (
    <Sheet
      open
      onClose={onClose}
      title={expense ? `Edit ${expense.label}` : "Record an expense"}
      size="md"
    >
      <form action={action} className="space-y-4 pt-1 pb-2">
        <input type="hidden" name="id" value={expense?.id ?? ""} />
        <input type="hidden" name="scope" value={scope} />
        <input type="hidden" name="replacesItemCosts" value={override ? "on" : ""} />

        <Field label="What was it for?" required error={state?.fields?.label}>
          <Input
            name="label"
            defaultValue={expense?.label ?? ""}
            placeholder="e.g. Rent, Market run, Cooking gas"
            required
            maxLength={120}
            data-autofocus
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount" required error={state?.fields?.amount}>
            <Input
              name="amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              placeholder="0.00"
              prefix="Br"
              required
            />
          </Field>
          <Field label="Type">
            <Select name="category" defaultValue={expense?.category ?? "other"}>
              {categories.map((c) => (
                <option key={c} value={c} className="capitalize">
                  {c}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div>
          <span className="mb-1.5 block text-[13px] font-semibold text-ink-2">How often</span>
          <Segmented<Scope>
            value={scope}
            onChange={setScope}
            size="sm"
            options={[
              { value: "one_off", label: "Once" },
              { value: "daily", label: "Daily" },
              { value: "weekly", label: "Weekly" },
              { value: "monthly", label: "Monthly" },
            ]}
          />
          <p className="mt-1.5 text-[12px] leading-snug text-ink-3">{SCOPE_HELP[scope]}</p>
          {scope !== "one_off" && cents > 0 ? (
            <p className="nums mt-1.5 text-[12.5px] font-semibold text-brand-ink">
              About {formatMoney(preview)} per day
            </p>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field
            label={scope === "one_off" ? "Date" : "Starting from"}
            required
            error={state?.fields?.effectiveDate}
          >
            <Input
              type="date"
              name="effectiveDate"
              defaultValue={expense?.effectiveDate ?? today()}
              required
            />
          </Field>

          {scope !== "one_off" ? (
            <Field label="Until" hint={hasEnd ? undefined : "Leave empty to keep going"}>
              <Input
                type="date"
                name="endDate"
                defaultValue={expense?.endDate ?? ""}
                onChange={(e) => setHasEnd(Boolean(e.target.value))}
              />
            </Field>
          ) : null}
        </div>

        {/* The override switch, explained. */}
        <div
          className={cn(
            "rounded-[14px] border px-3 py-1 transition",
            override ? "border-info/40 bg-info-soft" : "border-line",
          )}
        >
          <Toggle
            checked={override}
            onChange={setOverride}
            label="This is what the food actually cost"
            description="Use this amount instead of the per-plate estimates for the days it covers."
          />
        </div>

        {override ? (
          <p className="flex items-start gap-2 rounded-[12px] bg-info-soft px-3 py-2.5 text-[12px] leading-relaxed text-info">
            <Info className="mt-px size-3.5 shrink-0" />
            <span>
              For those days, profit becomes{" "}
              <strong>revenue minus this amount minus your other running costs</strong>. The
              per-plate estimates are ignored, so you get real numbers without editing every dish.
              Per-dish profit still uses the estimates, because that is the only per-dish
              information there is.
            </span>
          </p>
        ) : null}

        <Field label="Note" hint="Optional">
          <Textarea
            name="note"
            defaultValue={expense?.note ?? ""}
            rows={2}
            maxLength={1000}
            placeholder="e.g. bought at Merkato, prices up this week"
          />
        </Field>

        <div className="flex gap-2.5 pt-1">
          <Button type="button" variant="secondary" block onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" block loading={pending}>
            {expense ? "Save changes" : "Record it"}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
