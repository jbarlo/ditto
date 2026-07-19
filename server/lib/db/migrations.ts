import type { Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";

export const DEFAULT_DB_URL = "file:local.db";

const MIGRATIONS_FOLDER = "./drizzle";

/** Enable FK constraints, then apply pending migrations from ./drizzle. */
export async function runMigrations(client: Client): Promise<void> {
  await client.execute("PRAGMA foreign_keys = ON");
  await migrate(drizzle(client), { migrationsFolder: MIGRATIONS_FOLDER });
}
