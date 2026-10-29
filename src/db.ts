import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { config } from "./config.js";
import { SCHEMA } from "./schema.js";

mkdirSync(dirname(config.dbPath), { recursive: true });
const db = new DatabaseSync(config.dbPath);
db.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;");
db.exec(SCHEMA);

type Param = string | number | boolean | Date | object | null | undefined;

function bind(p: Param): string | number | null {
  if (p === null || p === undefined) return null;
  if (typeof p === "boolean") return p ? 1 : 0;
  if (p instanceof Date) return p.toISOString();
  if (typeof p === "object") return JSON.stringify(p);
  return p;
}

// Small async wrapper so callers can write `$1, $2` placeholders and read `rows` / `rowCount`.
export const pool = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async query(sql: string, params: Param[] = []): Promise<{ rows: any[]; rowCount: number }> {
    const stmt = db.prepare(sql.replace(/\$(\d+)/g, "?$1"));
    const args = params.map(bind);
    if (/^\s*(select|with)\b/i.test(sql) || /\breturning\b/i.test(sql)) {
      const rows = stmt.all(...args);
      return { rows, rowCount: rows.length };
    }
    return { rows: [], rowCount: Number(stmt.run(...args).changes) };
  },
  async end(): Promise<void> {
    db.close();
  },
};

export async function initDb(): Promise<void> {
  db.exec(SCHEMA);
}

export async function getMeta(key: string): Promise<string | null> {
  const { rows } = await pool.query("SELECT value FROM meta WHERE key=$1", [key]);
  return rows[0]?.value ?? null;
}

export async function setMeta(key: string, value: string): Promise<void> {
  await pool.query("INSERT INTO meta (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=excluded.value", [key, value]);
}

export const nowIso = () => new Date().toISOString();
