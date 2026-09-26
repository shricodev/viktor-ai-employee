import { fileURLToPath } from "node:url";
import { logger } from "@viktor/config";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { closeDb, getDb } from "./client.ts";

const migrationsFolder = fileURLToPath(new URL("../migrations", import.meta.url));

export async function runMigrations(): Promise<void> {
  await migrate(getDb(), { migrationsFolder });
}

if (import.meta.main) {
  await runMigrations();
  logger.info("migrations applied");
  await closeDb();
}
