import { initDb } from "./database";
import type { ProgressRecord } from "../engine/levels";

/**
 * Persistência do progresso dos níveis do Tap (3b). Regras:
 * - só o MELHOR resultado por nível (best_ratio nunca piora);
 * - `passed` nunca regride (uma vez true, fica true);
 * - `attempts_count` incrementa em TODA tentativa concluída.
 *
 * A lógica de "só sobrescreve se melhorar" fica em JS (não num MAX() do SQL) de propósito:
 * os testes mockam o banco e verificam a regra de verdade, não uma string de SQL.
 */

interface ProgressRow {
  level_id: string;
  best_ratio: number;
  passed: number; // SQLite: 0/1
  attempts_count: number;
  last_attempted_at: string;
}

// Fallback pro modo web (npm run dev sem Tauri): o plugin SQL não existe e Database.load
// falha. Caímos num Map em memória com as MESMAS regras — o Tap segue funcional na sessão,
// só não persiste. O warn dispara uma vez só pra não poluir o console.
const memoryStore = new Map<string, ProgressRecord>();
let dbUnavailable = false;
let warnedOnce = false;

function warnFallback(error: unknown) {
  dbUnavailable = true;
  if (!warnedOnce) {
    warnedOnce = true;
    console.warn(
      "[level-progress] SQLite indisponível (modo web sem Tauri?) — progresso só em memória nesta sessão.",
      error
    );
  }
}

function rowToRecord(row: ProgressRow): ProgressRecord {
  return {
    levelId: row.level_id,
    bestRatio: row.best_ratio,
    passed: row.passed !== 0,
    attemptsCount: row.attempts_count,
    lastAttemptedAt: row.last_attempted_at,
  };
}

/** Todos os registros de progresso salvos (um por nível já tentado). */
export async function getLevelProgress(): Promise<ProgressRecord[]> {
  if (dbUnavailable) return [...memoryStore.values()];
  try {
    const db = await initDb();
    const rows = await db.select<ProgressRow[]>("SELECT * FROM tap_level_progress");
    return rows.map(rowToRecord);
  } catch (error) {
    warnFallback(error);
    return [...memoryStore.values()];
  }
}

/** Aplica as regras de merge sobre o registro existente (ou ausência dele). */
function mergeResult(
  existing: ProgressRecord | undefined,
  levelId: string,
  ratio: number,
  passed: boolean
): ProgressRecord {
  return {
    levelId,
    bestRatio: existing ? Math.max(existing.bestRatio, ratio) : ratio,
    passed: (existing?.passed ?? false) || passed,
    attemptsCount: (existing?.attemptsCount ?? 0) + 1,
    lastAttemptedAt: new Date().toISOString(),
  };
}

/** Registra uma tentativa concluída: melhora best_ratio/passed se aplicável, conta sempre. */
export async function saveLevelResult(
  levelId: string,
  ratio: number,
  passed: boolean
): Promise<void> {
  if (dbUnavailable) {
    memoryStore.set(levelId, mergeResult(memoryStore.get(levelId), levelId, ratio, passed));
    return;
  }
  try {
    const db = await initDb();
    const rows = await db.select<ProgressRow[]>(
      "SELECT * FROM tap_level_progress WHERE level_id = $1",
      [levelId]
    );
    const merged = mergeResult(rows[0] ? rowToRecord(rows[0]) : undefined, levelId, ratio, passed);
    await db.execute(
      `INSERT OR REPLACE INTO tap_level_progress
         (level_id, best_ratio, passed, attempts_count, last_attempted_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        merged.levelId,
        merged.bestRatio,
        merged.passed ? 1 : 0,
        merged.attemptsCount,
        merged.lastAttemptedAt,
      ]
    );
  } catch (error) {
    warnFallback(error);
    memoryStore.set(levelId, mergeResult(memoryStore.get(levelId), levelId, ratio, passed));
  }
}

/** Só para testes: reseta o estado do fallback em memória. */
export function _resetLevelProgressFallback() {
  memoryStore.clear();
  dbUnavailable = false;
  warnedOnce = false;
}