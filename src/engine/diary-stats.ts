import { RECENT_SESSIONS } from "./practice-suggestion";

/**
 * Agregados DERIVADOS das sessões do diário (Módulo 5) — na leitura, nunca tabela
 * paralela (regra 3+5.0). Puro, sem I/O; tipos estruturais (as PracticeSession do db
 * encaixam por forma). Importa só de practice-suggestion (engine→engine).
 */

export interface SessionSummary {
  count: number;
  /** Maior BPM já registrado (ignora sessões sem BPM); null se nenhuma tem BPM. */
  maxBpm: number | null;
  /** Média das últimas RECENT_SESSIONS COM avaliação; null se nenhuma recente tem nota. */
  avgRatingRecent: number | null;
  /** Dia da prática mais recente ('YYYY-MM-DD'); null se vazio. */
  lastPracticedOn: string | null;
}

type SessionLike = {
  exerciseId: string;
  practicedOn: string;
  bpm: number | null;
  rating: number | null;
};

/**
 * Janela "recente" da média de avaliação = RECENT_SESSIONS, IMPORTADA do
 * practice-suggestion (fonte única da janela recente do M5 — nunca número solto;
 * mesma disciplina do STALE_CAP_DAYS na 3.1). Se um dia divergir, separar é decisão
 * explícita nos dois módulos.
 */
export function summarizeSessions(sessions: SessionLike[]): SessionSummary {
  if (sessions.length === 0) {
    return { count: 0, maxBpm: null, avgRatingRecent: null, lastPracticedOn: null };
  }

  const bpms = sessions.map((s) => s.bpm).filter((b): b is number => b != null);
  const maxBpm = bpms.length > 0 ? Math.max(...bpms) : null;

  // Ordena por dia (createdAt não faz parte do tipo mínimo; o dia basta pra "recente").
  const chronological = [...sessions].sort((a, b) => a.practicedOn.localeCompare(b.practicedOn));
  const recentRatings = chronological
    .slice(-RECENT_SESSIONS)
    .map((s) => s.rating)
    .filter((r): r is number => r != null);
  const avgRatingRecent =
    recentRatings.length > 0
      ? recentRatings.reduce((a, b) => a + b, 0) / recentRatings.length
      : null;

  const lastPracticedOn = chronological[chronological.length - 1].practicedOn;

  return { count: sessions.length, maxBpm, avgRatingRecent, lastPracticedOn };
}

/** Agrupa sessões por exercício (pro resumo por card). */
export function groupSessionsByExercise<T extends { exerciseId: string }>(
  sessions: T[]
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const session of sessions) {
    const list = map.get(session.exerciseId);
    if (list) list.push(session);
    else map.set(session.exerciseId, [session]);
  }
  return map;
}
