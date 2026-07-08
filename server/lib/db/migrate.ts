import { createClient } from "@libsql/client";
import { runMigrations } from "./migrations";

async function main() {
  const url = process.env.TURSO_URL ?? "file:local.db";
  const authToken = process.env.TURSO_AUTH_TOKEN;

  console.log("Running migrations...");
  await runMigrations(createClient({ url, authToken }));
  console.log("Migrations done.");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
