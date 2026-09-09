import Database from "@tauri-apps/plugin-sql";

let _db: Database | null = null;

/**
 * Migrações versionadas (fase 3+5.0). schema_migrations registra as APLICADAS.
 *
 * IMPORTANTE (transacionalidade): o tauri-plugin-sql v2 usa POOL de conexões (sqlx) —
 * BEGIN/COMMIT em execute() separados podem cair em conexões distintas, então transação
 * explícita multi-chamada NÃO é confiável. Em vez disso, cada passo de cada migração é
 * INDIVIDUALMENTE idempotente (INSERT OR IGNORE, DROP IF EXISTS, checagem antes de copiar):
 * falha no meio + reboot convergem sem duplicar nem perder dados.
 */
interface Migration {
  version: number;
  run: (db: Database) => Promise<void>;
}

/**
 * v1 — unificação do Tap: copia tap_level_progress pra exercise_progress (kind 'tap')
 * e dropa a tabela antiga. Janelas de falha parcial:
 * - antes da cópia: nada mudou; re-run refaz tudo;
 * - entre cópia e drop: OR IGNORE no re-run não duplica E preserva linha já atualizada
 *   por jogo novo (a mais nova vence); drop prossegue;
 * - entre drop e registro: passo 1 pula a cópia; só registra a versão.
 * ratio_sum/ratio_count migram ZERADOS — média só acumula daqui em diante (não inventar
 * histórico); attempts_count/best_ratio/passed preservados.
 */
async function migrateTapProgress(db: Database): Promise<void> {
  const tables = await db.select<{ name: string }[]>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'tap_level_progress'"
  );
  if (tables.length > 0) {
    await db.execute(`
      INSERT OR IGNORE INTO exercise_progress
        (kind, exercise_id, best_ratio, ratio_sum, ratio_count, passed, attempts_count, last_attempted_at)
      SELECT 'tap', level_id, best_ratio, 0, 0, passed, attempts_count, last_attempted_at
      FROM tap_level_progress
    `);
    await db.execute("DROP TABLE IF EXISTS tap_level_progress");
  }
}

/** Seed da trilha de estudo (3.2): 6 livros do brief, título só, autor editável depois. */
const STUDY_SEED_BOOKS: { id: string; title: string }[] = [
  { id: "seed-hal-leonard", title: "Hal Leonard Bass Method" },
  { id: "seed-jaco", title: "Jaco Pastorius Bass Method" },
  { id: "seed-simandl", title: "Simandl" },
  { id: "seed-ariane-cap", title: "Ariane Cap" },
  { id: "seed-rufus-reid", title: "Rufus Reid" },
  { id: "seed-gary-willis", title: "Gary Willis" },
];

/**
 * v2 — trilha de estudo passa a viver NO BANCO (3.2, reversão do modelo "fixo no código"
 * da 3+5.0). Dropa a antiga study_track_progress (nunca teve UI nem dados) e semeia os 6
 * livros do brief. Passos idempotentes (DROP IF EXISTS, INSERT OR IGNORE por id
 * determinístico): roda 1× (versão registrada), respeitando deleções futuras do usuário.
 */
async function migrateStudyTrackToBooks(db: Database): Promise<void> {
  await db.execute("DROP TABLE IF EXISTS study_track_progress");
  for (let i = 0; i < STUDY_SEED_BOOKS.length; i++) {
    const book = STUDY_SEED_BOOKS[i];
    await db.execute(
      `INSERT OR IGNORE INTO study_books (id, title, author, position, created_at)
       VALUES ($1, $2, '', $3, datetime('now'))`,
      [book.id, book.title, i]
    );
  }
}

const MIGRATIONS: Migration[] = [
  { version: 1, run: migrateTapProgress },
  { version: 2, run: migrateStudyTrackToBooks },
];

async function runMigrations(db: Database): Promise<void> {
  const rows = await db.select<{ version: number }[]>("SELECT version FROM schema_migrations");
  const applied = new Set(rows.map((r) => r.version));
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) continue;
    await migration.run(db);
    await db.execute("INSERT OR IGNORE INTO schema_migrations (version) VALUES ($1)", [
      migration.version,
    ]);
  }
}

export async function initDb(): Promise<Database> {
  if (_db) return _db;

  const db = await Database.load("sqlite:musicforge.db");

  await db.execute(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Agregado por exercício do APP (3.1) — fonte ÚNICA de progresso dos modos do Módulo 1
  // (Tap hoje; timed/dictation quando persistirem). Substitui tap_level_progress (migração
  // v1). Sem coluna "unlocked": desbloqueio segue derivado (deriveUnlockedLevels).
  // Média = ratio_sum/ratio_count, acumulada incrementalmente — tentativas individuais
  // NÃO são guardadas (decisão de modelagem da 3+5.0).
  await db.execute(`
    CREATE TABLE IF NOT EXISTS exercise_progress (
      kind              TEXT NOT NULL,
      exercise_id       TEXT NOT NULL,
      best_ratio        REAL NOT NULL,
      ratio_sum         REAL NOT NULL DEFAULT 0,
      ratio_count       INTEGER NOT NULL DEFAULT 0,
      passed            INTEGER NOT NULL DEFAULT 0,
      attempts_count    INTEGER NOT NULL DEFAULT 0,
      last_attempted_at TEXT NOT NULL,
      PRIMARY KEY (kind, exercise_id)
    )
  `);

  // Contagem diária p/ heatmap (3.1) — dia LOCAL do usuário. Sessões do M5 não entram
  // aqui (o dia delas vive em practice_sessions.practiced_on — merge na leitura da tela).
  await db.execute(`
    CREATE TABLE IF NOT EXISTS practice_days (
      day   TEXT NOT NULL,
      kind  TEXT NOT NULL,
      count INTEGER NOT NULL,
      PRIMARY KEY (day, kind)
    )
  `);

  // Trilha de estudo externa (3.2) — conteúdo NO BANCO (livros/capítulos/exercícios,
  // reversão do modelo "fixo no código" na 3.2). Nomes PREFIXADOS study_ porque a diary
  // (M5) já tem uma tabela `exercises`. own_status do capítulo só vale quando ele não tem
  // exercícios; senão o status é DERIVADO (engine study-track.ts). Status do livro também
  // é derivado (sem coluna). Integridade/cascade validados em JS.
  await db.execute(`
    CREATE TABLE IF NOT EXISTS study_books (
      id         TEXT PRIMARY KEY,
      title      TEXT NOT NULL,
      author     TEXT NOT NULL DEFAULT '',
      position   INTEGER NOT NULL,
      created_at TEXT NOT NULL
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS study_chapters (
      id         TEXT PRIMARY KEY,
      book_id    TEXT NOT NULL,
      position   INTEGER NOT NULL,
      title      TEXT NOT NULL,
      own_status TEXT,
      created_at TEXT NOT NULL
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS study_exercises (
      id         TEXT PRIMARY KEY,
      chapter_id TEXT NOT NULL,
      position   INTEGER NOT NULL,
      label      TEXT NOT NULL,
      status     TEXT NOT NULL DEFAULT 'nao_iniciado',
      created_at TEXT NOT NULL
    )
  `);
  await db.execute(
    "CREATE INDEX IF NOT EXISTS idx_study_chapters_book ON study_chapters(book_id)"
  );
  await db.execute(
    "CREATE INDEX IF NOT EXISTS idx_study_exercises_chapter ON study_exercises(chapter_id)"
  );

  // Progresso do mapa de teoria (3.3). Grafo de tópicos é CÓDIGO; ausência = 'nao_iniciado'.
  // Regra (em JS, theory-map-progress.ts): auto só promove; manual livre.
  await db.execute(`
    CREATE TABLE IF NOT EXISTS theory_map_progress (
      node_id    TEXT PRIMARY KEY,
      status     TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  // Cadastro de exercícios do M5 — dado do USUÁRIO (uuid), não código. Sem hard delete:
  // archived preserva o histórico do diário. Validações (complexity 1..5) em JS.
  await db.execute(`
    CREATE TABLE IF NOT EXISTS exercises (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      category   TEXT NOT NULL,
      complexity INTEGER NOT NULL,
      target_bpm INTEGER,
      archived   INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )
  `);

  // Diário de sessões de prática real (M5) — sessões INDIVIDUAIS (alimentam a sugestão
  // adaptativa e o recorde de BPM). Agregados do M5 são DERIVADOS daqui na leitura.
  // Integridade exercise_id -> exercises validada em JS (padrão do projeto; PRAGMA de FK
  // do plugin não é confiável).
  await db.execute(`
    CREATE TABLE IF NOT EXISTS practice_sessions (
      id           TEXT PRIMARY KEY,
      exercise_id  TEXT NOT NULL,
      practiced_on TEXT NOT NULL,
      bpm          INTEGER,
      duration_min INTEGER,
      rating       INTEGER,
      note         TEXT NOT NULL DEFAULT '',
      created_at   TEXT NOT NULL
    )
  `);
  await db.execute(
    "CREATE INDEX IF NOT EXISTS idx_sessions_exercise ON practice_sessions(exercise_id)"
  );
  await db.execute(
    "CREATE INDEX IF NOT EXISTS idx_sessions_day ON practice_sessions(practiced_on)"
  );

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

  await runMigrations(db);

  _db = db;
  return db;
}

export function getDb(): Database {
  if (!_db) throw new Error("Database not initialized — call initDb() first");
  return _db;
}

/** Só para testes: reseta o singleton (initDb mockado nos testes de CRUD usa isto indiretamente). */
export function _resetDbSingleton() {
  _db = null;
}
