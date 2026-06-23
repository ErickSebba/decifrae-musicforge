import Database from "@tauri-apps/plugin-sql";

let _db: Database | null = null;

export async function initDb(): Promise<Database> {
  if (_db) return _db;

  const db = await Database.load("sqlite:musicforge.db");

  await db.execute(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  _db = db;
  return db;
}

export function getDb(): Database {
  if (!_db) throw new Error("Database not initialized — call initDb() first");
  return _db;
}
