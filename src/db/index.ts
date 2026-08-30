import { neon, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

/**
 * Server-only database access.
 *
 * This module must never be imported from a client component. Everything that
 * touches it lives behind a "use server" action or a route handler.
 */
if (typeof window !== "undefined") {
  throw new Error("src/db must never be imported into client-side code.");
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.",
  );
}

/**
 * Retry transient connection failures.
 *
 * Neon's HTTP endpoint occasionally refuses or drops a TCP connection - a cold
 * serverless region, a weak uplink, a burst of parallel queries from a report
 * page. Those failures happen before the request reaches Postgres, so the
 * statement definitely did not run and retrying is safe. It is safe for our
 * writes too: every insert the app performs is either a plain single-row
 * insert or carries ON CONFLICT (client_id) DO NOTHING, so a retry cannot
 * double-apply anything.
 *
 * A response from the server - even an error one - is never retried: that is a
 * real answer, and repeating it would only hide the bug.
 *
 * Deliberately no client-side abort timeout. An earlier version aborted at
 * 12s and turned merely-slow queries into hard 500s, which is a worse failure
 * than waiting; the platform's own connect timeout is what we retry around.
 */
const ATTEMPTS = 3;

neonConfig.fetchFunction = async (url: string, init: RequestInit) => {
  let lastError: unknown;

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    try {
      return await fetch(url, init);
    } catch (err) {
      lastError = err;
      if (attempt === ATTEMPTS - 1) break;
      // 150ms, 450ms - short enough that a page render still feels instant.
      await new Promise((resolve) => setTimeout(resolve, 150 * 3 ** attempt));
    }
  }

  throw lastError;
};

/**
 * Raw tagged-template client, used for the analytics aggregations and for the
 * single-statement CTE writes in the sync path (one statement = atomic, which
 * the HTTP driver gives us without needing a WebSocket pool).
 */
export const sql = neon(connectionString);

export const db = drizzle(sql, { schema });

export { schema };
