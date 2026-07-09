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

  // Melhor resultado por nível do modo Tap (3b). Sem coluna "unlocked": o desbloqueio é
  // derivado em runtime a partir de `passed` (deriveUnlockedLevels em engine/levels.ts).
  await db.execute(`
    CREATE TABLE IF NOT EXISTS tap_level_progress (
      level_id          TEXT PRIMARY KEY,
      best_ratio        REAL NOT NULL,
      passed            INTEGER NOT NULL DEFAULT 0,
      attempts_count    INTEGER NOT NULL DEFAULT 0,
      last_attempted_at TEXT NOT NULL
    )
  `);

  // Central de Conteúdo (2.4, adiantando o Módulo 3.4 — schema DEFINITIVO: a 3.4 só
  // adiciona a tela de revisão por cima). Espelha o tipo ContentEntry do theory-engine.
  await db.execute(`
    CREATE TABLE IF NOT EXISTS content_entries (
      id            TEXT PRIMARY KEY,
      topic         TEXT NOT NULL,
      title         TEXT NOT NULL,
      body          TEXT NOT NULL,
      review_status TEXT NOT NULL,
      note          TEXT NOT NULL DEFAULT '',
      created_at    TEXT NOT NULL
    )
  `);

  _db = db;
  return db;
}

export function getDb(): Database {
  if (!_db) throw new Error("Database not initialized — call initDb() first");
  return _db;
}
