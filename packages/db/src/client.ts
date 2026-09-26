import { env } from "@viktor/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.ts";

function connect(url: string) {
  const sql = postgres(url, { max: 10, onnotice: () => {} });
  return { sql, db: drizzle(sql, { schema, casing: "snake_case" }) };
}

export type Database = ReturnType<typeof connect>["db"];

let instance: ReturnType<typeof connect> | undefined;

export function getDb(): Database {
  instance ??= connect(env().DATABASE_URL);
  return instance.db;
}

export async function closeDb(): Promise<void> {
  await instance?.sql.end({ timeout: 5 });
  instance = undefined;
}
