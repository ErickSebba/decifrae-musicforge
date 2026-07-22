import type { ProgressRecord } from "../engine/levels";
import {
  getExerciseProgress,
  saveExerciseResult,
  _resetExerciseProgressFallback,
} from "./exercise-progress";

/**
 * ADAPTER (fase 3+5.0): a persistência do Tap vive na tabela unificada exercise_progress
 * (kind 'tap') — ver exercise-progress.ts, onde moram as regras (best não regride, passed
 * sticky, attempts sempre conta) e o fallback em memória. Este módulo preserva a API que
 * as telas do Módulo 1 e o deriveUnlockedLevels já usam; a tabela antiga tap_level_progress
 * foi absorvida pela migração v1 (database.ts).
 */

/** Todos os registros de progresso do Tap (um por nível já tentado). */
export async function getLevelProgress(): Promise<ProgressRecord[]> {
  const records = await getExerciseProgress("tap");
  return records.map((r) => ({
    levelId: r.exerciseId,
    bestRatio: r.bestRatio,
    passed: r.passed,
    attemptsCount: r.attemptsCount,
    lastAttemptedAt: r.lastAttemptedAt,
  }));
}

/** Registra uma tentativa concluída de um nível do Tap. */
export async function saveLevelResult(
  levelId: string,
  ratio: number,
  passed: boolean
): Promise<void> {
  await saveExerciseResult("tap", levelId, ratio, passed);
}

/** Só para testes: reseta o fallback compartilhado do exercise-progress. */
export function _resetLevelProgressFallback() {
  _resetExerciseProgressFallback();
}
