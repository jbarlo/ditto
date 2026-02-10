import { migrate } from "drizzle-orm/libsql/migrator";
import { getDb } from "./client";

async function runMigrations() {
  const db = await getDb();

  console.log("Running migrations...");
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Done.");
}

runMigrations().catch(console.error);
