import { readFileSync } from "node:fs";
import pg from "pg";
import { config } from "./config.js";

export const pool = new pg.Pool({ connectionString: config.databaseUrl });

export async function initDb(): Promise<void> {
  const sql = readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8");
  await pool.query(sql);
}
