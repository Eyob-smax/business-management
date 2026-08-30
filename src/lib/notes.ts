import "server-only";
import { sql } from "@/db";
import type { DayKey } from "./dates";

export type NoteRow = {
  id: string;
  clientId: string;
  kind: "note" | "message" | "handover" | "issue";
  noteDate: DayKey;
  body: string;
  authorId: string | null;
  authorName: string;
  authorAvatar: string;
  authorRole: "admin" | "staff" | null;
  parentId: string | null;
  isPinned: boolean;
  resolvedAt: string | null;
  createdAt: string;
  replyCount: number;
};

const SELECT = `
  SELECT
    n.id::text, n.client_id, n.kind, to_char(n.note_date,'YYYY-MM-DD') AS note_date,
    n.body, n.author_id::text, n.parent_id::text, n.is_pinned, n.resolved_at, n.created_at,
    COALESCE(u.name, 'Someone')      AS author_name,
    COALESCE(u.avatar, '\u{1F464}')  AS author_avatar,
    u.role                           AS author_role,
    (SELECT count(*) FROM notes r WHERE r.parent_id = n.id AND r.deleted_at IS NULL) AS reply_count
  FROM notes n
  LEFT JOIN users u ON u.id = n.author_id
`;

function shape(rows: Record<string, unknown>[]): NoteRow[] {
  return rows.map((r) => ({
    id: String(r.id),
    clientId: String(r.client_id),
    kind: String(r.kind) as NoteRow["kind"],
    noteDate: String(r.note_date),
    body: String(r.body),
    authorId: (r.author_id as string) ?? null,
    authorName: String(r.author_name),
    authorAvatar: String(r.author_avatar),
    authorRole: (r.author_role as NoteRow["authorRole"]) ?? null,
    parentId: (r.parent_id as string) ?? null,
    isPinned: Boolean(r.is_pinned),
    resolvedAt: r.resolved_at ? String(r.resolved_at) : null,
    createdAt: String(r.created_at),
    replyCount: Number(r.reply_count ?? 0),
  }));
}

/** Newest top-level notes, for the dashboard preview. */
export async function listRecentNotes({
  limit = 5,
  module = "restaurant",
}: { limit?: number; module?: "restaurant" | "shop" } = {}): Promise<NoteRow[]> {
  const rows = (await sql.query(
    `${SELECT}
     WHERE n.module = $1 AND n.deleted_at IS NULL AND n.parent_id IS NULL
     ORDER BY n.created_at DESC
     LIMIT $2`,
    [module, limit],
  )) as Record<string, unknown>[];
  return shape(rows);
}

/** Everything for one trading day, threads flattened (replies included). */
export async function listNotesForDate(
  date: DayKey,
  module: "restaurant" | "shop" = "restaurant",
): Promise<NoteRow[]> {
  const rows = (await sql.query(
    `${SELECT}
     WHERE n.module = $1 AND n.deleted_at IS NULL AND n.note_date = $2::date
     ORDER BY n.is_pinned DESC, n.created_at ASC`,
    [module, date],
  )) as Record<string, unknown>[];
  return shape(rows);
}

/**
 * The message board: top-level notes newest-first plus their replies, over a
 * window. Pinned notes float to the top regardless of date.
 */
export async function listNoteBoard({
  from,
  to,
  module = "restaurant",
  kind,
  limit = 80,
}: {
  from: DayKey;
  to: DayKey;
  module?: "restaurant" | "shop";
  kind?: NoteRow["kind"] | "all";
  limit?: number;
}): Promise<{ roots: NoteRow[]; replies: Map<string, NoteRow[]> }> {
  const kindFilter = kind && kind !== "all" ? kind : null;

  const rootRows = (await sql.query(
    `${SELECT}
     WHERE n.module = $1
       AND n.deleted_at IS NULL
       AND n.parent_id IS NULL
       AND (n.is_pinned OR n.note_date BETWEEN $2::date AND $3::date)
       AND ($4::text IS NULL OR n.kind::text = $4)
     ORDER BY n.is_pinned DESC, n.created_at DESC
     LIMIT $5`,
    [module, from, to, kindFilter, limit],
  )) as Record<string, unknown>[];

  const roots = shape(rootRows);
  const replies = new Map<string, NoteRow[]>();
  if (roots.length === 0) return { roots, replies };

  const ids = roots.filter((r) => r.replyCount > 0).map((r) => r.id);
  if (ids.length === 0) return { roots, replies };

  const replyRows = (await sql.query(
    `${SELECT}
     WHERE n.deleted_at IS NULL AND n.parent_id = ANY($1::uuid[])
     ORDER BY n.created_at ASC`,
    [ids],
  )) as Record<string, unknown>[];

  for (const reply of shape(replyRows)) {
    const list = replies.get(reply.parentId!) ?? [];
    list.push(reply);
    replies.set(reply.parentId!, list);
  }

  return { roots, replies };
}

/** Open issues, used for the nav badge. */
export async function countOpenIssues(
  module: "restaurant" | "shop" = "restaurant",
): Promise<number> {
  const rows = (await sql`
    SELECT count(*)::int AS n
    FROM notes
    WHERE module = ${module}
      AND deleted_at IS NULL
      AND kind = 'issue'
      AND resolved_at IS NULL
  `) as { n: number }[];
  return rows[0]?.n ?? 0;
}

export type NoteThread = { root: NoteRow; replies: NoteRow[] };

/** listNoteBoard, reshaped into a plain array for passing to client components. */
export async function listNoteThreads(args: Parameters<typeof listNoteBoard>[0]): Promise<NoteThread[]> {
  const { roots, replies } = await listNoteBoard(args);
  return roots.map((root) => ({ root, replies: replies.get(root.id) ?? [] }));
}
