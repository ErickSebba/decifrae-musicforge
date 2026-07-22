import { initDb } from "./database";

/**
 * Progresso agregado por exercício do APP (3.1) — fonte única pros modos do Módulo 1
 * (Tap hoje; Cronometrado/Ditado quando persistirem). Regras (JS, testáveis com banco
 * mockado — padrão do projeto):
 * - best_ratio nunca piora; passed nunca regride; attempts_count sempre incrementa;
 * - ratio_sum/ratio_count acumulam TODA tentativa (média incremental — tentativas
 *   individuais NÃO são guardadas, decisão de modelagem da 3+5.0);
 * - cada tentativa concluída incrementa practice_days no DIA LOCAL (heatmap 3.1).
 * Fallback em memória no modo web (npm run dev sem Tauri), warn UMA vez.
 */

export type ExerciseKind = "tap" | "timed" | "dictation";

export interface ExerciseProgressRecord {
  kind: ExerciseKind;
  exerciseId: string;
  bestRatio: number;
  ratioSum: number;
  ratioCount: number;
  passed: boolean;
  attemptsCount: number;
  lastAttemptedAt: string;
}

export interface PracticeDayRecord {
  day: string; // 'YYYY-MM-DD' local
  kind: ExerciseKind;
  count: number;
}

interface ExerciseProgressRow {
  kind: string;
  exercise_id: string;
  best_ratio: number;
  ratio_sum: number;
  ratio_count: number;
  passed: number; // SQLite: 0/1
  attempts_count: number;
  last_attempted_at: string;
}

interface PracticeDayRow {
  day: string;
  kind: string;
  count: number;
}

/** Dia LOCAL do usuário (heatmap é sobre o dia dele, não UTC). */
export function localDayString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Média acumulada do registro, ou null enquanto não houver tentativa contada (linhas migradas). */
export function averageRatio(record: ExerciseProgressRecord): number | null {
  return record.ratioCount > 0 ? record.ratioSum / record.ratioCount : null;
}

const memoryStore = new Map<string, ExerciseProgressRecord>();
const memoryDays = new Map<string, number>(); // `${day}|${kind}` -> count
let dbUnavailable = false;
let warnedOnce = false;

function warnFallback(error: unknown) {
  dbUnavailable = true;
  if (!warnedOnce) {
    warnedOnce = true;
    console.warn(
      "[exercise-progress] SQLite indisponível (modo web sem Tauri?) — progresso só em memória nesta sessão.",
      error
    );
  }
}

function rowToRecord(row: ExerciseProgressRow): ExerciseProgressRecord {
  return {
    kind: row.kind as ExerciseKind,
    exerciseId: row.exercise_id,
    bestRatio: row.best_ratio,
    ratioSum: row.ratio_sum,
    ratioCount: row.ratio_count,
    passed: row.passed !== 0,
    attemptsCount: row.attempts_count,
    lastAttemptedAt: row.last_attempted_at,
  };
}

/** Aplica as regras de merge sobre o registro existente (ou ausência dele). */
function mergeResult(
  existing: ExerciseProgressRecord | undefined,
  kind: ExerciseKind,
  exerciseId: string,
  ratio: number,
  passed: boolean
): ExerciseProgressRecord {
  return {
    kind,
    exerciseId,
    bestRatio: existing ? Math.max(existing.bestRatio, ratio) : ratio,
    ratioSum: (existing?.ratioSum ?? 0) + ratio,
    ratioCount: (existing?.ratioCount ?? 0) + 1,
    passed: (existing?.passed ?? false) || passed,
    attemptsCount: (existing?.attemptsCount ?? 0) + 1,
    lastAttemptedAt: new Date().toISOString(),
  };
}

const progressKey = (kind: string, exerciseId: string) => `${kind}|${exerciseId}`;

/** Registros agregados (todos, ou só de um kind). */
export async function getExerciseProgress(kind?: ExerciseKind): Promise<ExerciseProgressRecord[]> {
  if (dbUnavailable) {
    const all = [...memoryStore.values()];
    return kind ? all.filter((r) => r.kind === kind) : all;
  }
  try {
    const db = await initDb();
    const rows = kind
      ? await db.select<ExerciseProgressRow[]>(
          "SELECT * FROM exercise_progress WHERE kind = $1",
          [kind]
        )
      : await db.select<ExerciseProgressRow[]>("SELECT * FROM exercise_progress");
    return rows.map(rowToRecord);
  } catch (error) {
    warnFallback(error);
    const all = [...memoryStore.values()];
    return kind ? all.filter((r) => r.kind === kind) : all;
  }
}

function saveToMemory(kind: ExerciseKind, exerciseId: string, ratio: number, passed: boolean) {
  const key = progressKey(kind, exerciseId);
  memoryStore.set(key, mergeResult(memoryStore.get(key), kind, exerciseId, ratio, passed));
  const dayKey = `${localDayString(new Date())}|${kind}`;
  memoryDays.set(dayKey, (memoryDays.get(dayKey) ?? 0) + 1);
}

/**
 * Registra uma tentativa concluída: merge das regras + incremento do dia local no heatmap.
 * (Dois writes não-transacionais — aceitável: heatmap é contagem informativa, e o padrão
 * do plugin não dá transação confiável; ver comentário de migração no database.ts.)
 */
export async function saveExerciseResult(
  kind: ExerciseKind,
  exerciseId: string,
  ratio: number,
  passed: boolean
): Promise<void> {
  if (dbUnavailable) {
    saveToMemory(kind, exerciseId, ratio, passed);
    return;
  }
  try {
    const db = await initDb();
    const rows = await db.select<ExerciseProgressRow[]>(
      "SELECT * FROM exercise_progress WHERE kind = $1 AND exercise_id = $2",
      [kind, exerciseId]
    );
    const merged = mergeResult(
      rows[0] ? rowToRecord(rows[0]) : undefined,
      kind,
      exerciseId,
      ratio,
      passed
    );
    await db.execute(
      `INSERT OR REPLACE INTO exercise_progress
         (kind, exercise_id, best_ratio, ratio_sum, ratio_count, passed, attempts_count, last_attempted_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        merged.kind,
        merged.exerciseId,
        merged.bestRatio,
        merged.ratioSum,
        merged.ratioCount,
        merged.passed ? 1 : 0,
        merged.attemptsCount,
        merged.lastAttemptedAt,
      ]
    );

    const day = localDayString(new Date());
    const dayRows = await db.select<PracticeDayRow[]>(
      "SELECT * FROM practice_days WHERE day = $1 AND kind = $2",
      [day, kind]
    );
    await db.execute(
      "INSERT OR REPLACE INTO practice_days (day, kind, count) VALUES ($1, $2, $3)",
      [day, kind, (dayRows[0]?.count ?? 0) + 1]
    );
  } catch (error) {
    warnFallback(error);
    saveToMemory(kind, exerciseId, ratio, passed);
  }
}

/** Contagens diárias (heatmap 3.1). Sessões do M5 NÃO estão aqui — merge na leitura da tela. */
export async function getPracticeDays(): Promise<PracticeDayRecord[]> {
  if (dbUnavailable) {
    return [...memoryDays.entries()].map(([key, count]) => {
      const [day, kind] = key.split("|");
      return { day, kind: kind as ExerciseKind, count };
    });
  }
  try {
    const db = await initDb();
    const rows = await db.select<PracticeDayRow[]>("SELECT * FROM practice_days");
    return rows.map((r) => ({ day: r.day, kind: r.kind as ExerciseKind, count: r.count }));
  } catch (error) {
    warnFallback(error);
    return [...memoryDays.entries()].map(([key, count]) => {
      const [day, kind] = key.split("|");
      return { day, kind: kind as ExerciseKind, count };
    });
  }
}

/** Só para testes: reseta o estado do fallback em memória. */
export function _resetExerciseProgressFallback() {
  memoryStore.clear();
  memoryDays.clear();
  dbUnavailable = false;
  warnedOnce = false;
}
