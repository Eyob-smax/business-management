"use client";
/**
 * Rejected records.
 *
 * The promise is "data is never lost". A record the server permanently refused
 * cannot stay in the outbox forever, so it lands here where a person can read
 * the reason, try again, or knowingly throw it away. Silence would be a lie.
 */
import * as React from "react";
import { RotateCcw, Trash2, TriangleAlert } from "lucide-react";
import { listQuarantine, requeueQuarantined, discardQuarantined } from "@/lib/offline/outbox";
import type { QuarantineRecord } from "@/lib/offline/db";
import { relativeTime } from "@/lib/dates";
import { Button, EmptyState } from "@/components/ui/primitives";
import { ConfirmDialog } from "@/components/ui/overlay";
import { useToast } from "@/components/ui/toast";
import { useSync } from "@/components/providers/sync-provider";

export function QuarantineList() {
  const [rows, setRows] = React.useState<QuarantineRecord[] | null>(null);
  const [discarding, setDiscarding] = React.useState<QuarantineRecord | null>(null);
  const { toast } = useToast();
  const sync = useSync();

  const load = React.useCallback(async () => {
    try {
      setRows(await listQuarantine());
    } catch {
      setRows([]);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load, sync.quarantined]);

  if (rows === null) return <div className="py-4" />;

  if (rows.length === 0) {
    return (
      <div className="py-2">
        <EmptyState
          className="py-6"
          title="No rejected records"
          body="If the server ever refuses something, it will appear here instead of disappearing."
        />
      </div>
    );
  }

  return (
    <div className="py-4">
      <p className="mb-3 flex items-center gap-2 text-[13px] font-bold text-loss">
        <TriangleAlert className="size-4" />
        {rows.length} record{rows.length > 1 ? "s" : ""} the server refused
      </p>

      <div className="space-y-2.5">
        {rows.map((r) => (
          <div key={r.clientId} className="rounded-[14px] border border-loss/25 bg-loss-soft/50 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-[13.5px] font-semibold text-ink">{r.summary}</p>
                <p className="mt-0.5 text-[11.5px] text-ink-3">
                  {r.kind} - saved {relativeTime(r.createdAt)}
                </p>
              </div>
            </div>
            <p className="mt-2 text-[12px] leading-snug text-loss">{r.reason}</p>
            <div className="mt-2.5 flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                icon={<RotateCcw className="size-3.5" />}
                onClick={async () => {
                  await requeueQuarantined(r.clientId);
                  await sync.flush();
                  await load();
                  toast({ tone: "info", title: "Trying again" });
                }}
              >
                Try again
              </Button>
              <Button
                size="sm"
                variant="ghost"
                icon={<Trash2 className="size-3.5" />}
                onClick={() => setDiscarding(r)}
              >
                Discard
              </Button>
            </div>
          </div>
        ))}
      </div>

      <ConfirmDialog
        open={Boolean(discarding)}
        onClose={() => setDiscarding(null)}
        title="Discard this record?"
        body={
          <>
            <span className="font-semibold text-ink">{discarding?.summary}</span> will be deleted
            from this phone and will never reach the database. This cannot be undone.
          </>
        }
        confirmLabel="Discard for good"
        destructive
        onConfirm={async () => {
          if (discarding) await discardQuarantined(discarding.clientId);
          setDiscarding(null);
          await load();
          toast({ tone: "info", title: "Record discarded" });
        }}
      />
    </div>
  );
}
