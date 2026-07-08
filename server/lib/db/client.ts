import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";
import { env } from "@/lib/env";
import { runMigrations } from "./migrations";

let client: Client | null = null;

export function getLibsqlClient(): Client {
  if (!client) {
    client = createClient({
      url: env.TURSO_URL ?? "file:local.db",
      authToken: env.TURSO_AUTH_TOKEN,
    });
  }
  return client;
}

/**
 * FIXME: Turso doesn't enable foreign keys by default and has no config option.
 * This pragma runs per-request, adding a round-trip to Turso (~50-100ms latency).
 * Remove if Turso adds native FK support or if latency becomes an issue.
 * See: https://github.com/libsql/sqld/issues/764
 */
export async function getDb(): Promise<Database> {
  const client = getLibsqlClient();
  await client.execute("PRAGMA foreign_keys = ON");
  return drizzle(client, { schema });
}

export type Database = ReturnType<typeof drizzle<typeof schema>>;

/** Run migrations. Call explicitly (CLI, CI/CD, etc). */
export async function migrate(libsqlClient: Client): Promise<Database> {
  await runMigrations(libsqlClient);
  return drizzle(libsqlClient, { schema });
}

/** Create an in-memory SQLite database with schema applied (for tests) */
export function createTestDb() {
  return migrate(createClient({ url: ":memory:" }));
}
