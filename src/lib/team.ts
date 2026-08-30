import "server-only";
import { sql } from "@/db";
import type { AccessLevel } from "./access";

export type TeamMember = {
  id: string;
  name: string;
  role: "admin" | "staff";
  avatar: string;
  accessLevel: AccessLevel;
  mustChangePassword: boolean;
  lastSeenAt: string | null;
  createdAt: string;
  /** Orders recorded in the last 30 trading days. */
  orders30: number;
  revenue30Cents: number;
  /** Devices signed up for push notifications. */
  devices: number;
  /**
   * Total orders ever recorded by this person. Shown before a permanent
   * delete, because that many rows would lose their name.
   */
  ordersTotal: number;
};

export async function listTeam(): Promise<TeamMember[]> {
  const rows = (await sql`
    SELECT
      u.id::text, u.name, u.role, u.avatar, u.access_level, u.must_change_password,
      u.last_seen_at, u.created_at,
      COALESCE(s.orders, 0)  AS orders30,
      COALESCE(s.revenue, 0) AS revenue30,
      (SELECT count(*)::int FROM push_subscriptions p WHERE p.user_id = u.id) AS devices,
      (SELECT count(*)::int FROM sales sa WHERE sa.staff_id = u.id)           AS orders_total
    FROM users u
    LEFT JOIN (
      SELECT staff_id, count(*)::int AS orders, SUM(total_cents)::bigint AS revenue
      FROM sales
      WHERE status = 'completed'
        AND business_date >= (CURRENT_DATE - INTERVAL '30 days')
      GROUP BY staff_id
    ) s ON s.staff_id = u.id
    ORDER BY
      CASE u.access_level WHEN 'full' THEN 0 WHEN 'read_only' THEN 1 ELSE 2 END,
      u.role,
      u.name
  `) as Record<string, unknown>[];

  return rows.map((r) => ({
    id: String(r.id),
    name: String(r.name),
    role: String(r.role) as "admin" | "staff",
    avatar: String(r.avatar),
    accessLevel: String(r.access_level) as AccessLevel,
    mustChangePassword: Boolean(r.must_change_password),
    lastSeenAt: r.last_seen_at ? String(r.last_seen_at) : null,
    createdAt: String(r.created_at),
    orders30: Number(r.orders30 ?? 0),
    revenue30Cents: Number(r.revenue30 ?? 0),
    devices: Number(r.devices ?? 0),
    ordersTotal: Number(r.orders_total ?? 0),
  }));
}
