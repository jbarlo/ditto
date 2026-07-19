import { defineConfig } from "drizzle-kit";
import { DEFAULT_DB_URL } from "./lib/db/migrations";

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "turso",
  dbCredentials: {
    url: process.env.TURSO_URL ?? DEFAULT_DB_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  },
});
