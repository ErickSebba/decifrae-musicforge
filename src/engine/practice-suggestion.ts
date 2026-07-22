/**
 * Sugestão adaptativa de prática (Módulo 5) — motor PURO e determinístico: sem I/O,
 * `today` injetado (padrão do projeto: clock/Rng injetáveis p/ teste). Ranqueia
 * candidatos dos DOIS mundos:
 * - exercícios do APP (agregados do exercise_progress): fraco (best_ratio baixo),
 *   reprovado, parado há muito tempo;
 * - exercícios do DIÁRIO (cadastro + sessões do M5): nunca praticado, avaliação média
 *   recente baixa, BPM estagnado/abaixo do alvo, dias sem praticar.
 *
 * CAMADAS: este engine NÃO importa de src/db (a seta é db→engine, como ProgressRecord
 * no levels.ts). Os tipos de entrada são subconjuntos ESTRUTURAIS do que os módulos
 * de acesso devolvem — ExerciseProgressRecord, Exercise e PracticeSession encaixam
 * por forma, sem conversão.
 *
 * Pesos como constantes nomeadas (calibráveis quando a tela do M5 existir).
 */

export interface AppExerciseInput {
  kind: string; // 'tap' | 'timed' | 'dictation'
  exerciseId: string;
  bestRatio: number; // 0..1
  passed: boolean;
  lastAttemptedAt: string; // ISO
}

export interface DiaryExerciseInput {
  id: string;
  name: string;
  archived: boolean;
  targetBpm: number | null;
}

export interface DiarySessionInput {
  exerciseId: string;
  practicedOn: string; // 'YYYY-MM-DD'
  bpm: number | null;
  rating: number | null; // 1..5
}

export interface SuggestionInput {
  appProgress: AppExerciseInput[];
  exercises: DiaryExerciseInput[];
  sessions: DiarySessionInput[];
}

export interface PracticeSuggestion {
  source: "app" | "diary";
  /** app: exerciseId (com kind ao lado); diary: id do cadastro. */
  id: string;
  kind?: string; // só source 'app'
  label: string; // diary: nome do exercício; app: exerciseId (a tela resolve o rótulo)
  score: number;
  reasons: string[];
}

// Pesos (0..100 por eixo, aproximadamente) — calibráveis.
export const W_NOT_PASSED = 30;
export const W_WEAK = 40;
export const W_STALE = 30;
export const STALE_CAP_DAYS = 14;
export const W_NEVER_PRACTICED = 50;
export const W_LOW_RATING = 40;
export const W_BPM_GAP = 30;
export const W_STAGNANT = 15;
/** Janela de "últimas sessões" usada pra avaliação/estagnação. */
export const RECENT_SESSIONS = 5;
const MS_PER_DAY = 86_400_000;
const RATING_MAX = 5;

/** Dias inteiros decorridos (nunca negativo). Aceita ISO e 'YYYY-MM-DD'. */
function daysSince(dateStr: string, today: Date): number {
  const then = new Date(dateStr).getTime();
  if (Number.isNaN(then)) return 0;
  return Math.max(0, Math.floor((today.getTime() - then) / MS_PER_DAY));
}

/** Componente de "parado há N dias": cresce linear até o teto STALE_CAP_DAYS. */
function staleScore(days: number): number {
  return (Math.min(days, STALE_CAP_DAYS) / STALE_CAP_DAYS) * W_STALE;
}

function scoreAppExercise(record: AppExerciseInput, today: Date): PracticeSuggestion {
  const reasons: string[] = [];
  let score = 0;

  if (!record.passed) {
    score += W_NOT_PASSED;
    reasons.push("ainda não aprovado");
  }
  const weakness = (1 - record.bestRatio) * W_WEAK;
  if (weakness > 0) {
    score += weakness;
    reasons.push(`melhor acerto em ${Math.round(record.bestRatio * 100)}%`);
  }
  const days = daysSince(record.lastAttemptedAt, today);
  if (days > 0) {
    score += staleScore(days);
    reasons.push(`sem praticar há ${days} dia${days === 1 ? "" : "s"}`);
  }

  return {
    source: "app",
    id: record.exerciseId,
    kind: record.kind,
    label: record.exerciseId,
    score,
    reasons,
  };
}

function scoreDiaryExercise(
  exercise: DiaryExerciseInput,
  allSessions: DiarySessionInput[],
  today: Date
): PracticeSuggestion {
  const reasons: string[] = [];
  let score = 0;

  // Cronológicas (antiga → recente); "recentes" = últimas RECENT_SESSIONS.
  const chronological = allSessions
    .filter((s) => s.exerciseId === exercise.id)
    .sort((a, b) => a.practicedOn.localeCompare(b.practicedOn));

  if (chronological.length === 0) {
    return {
      source: "diary",
      id: exercise.id,
      label: exercise.name,
      score: W_NEVER_PRACTICED,
      reasons: ["nunca praticado"],
    };
  }

  const recent = chronological.slice(-RECENT_SESSIONS);

  // Avaliação média recente baixa (só sessões com nota).
  const ratings = recent.map((s) => s.rating).filter((r): r is number => r != null);
  if (ratings.length > 0) {
    const avg = ratings.reduce((a, b) => a + b, 0) / ratings.length;
    const lowRating = ((RATING_MAX - avg) / (RATING_MAX - 1)) * W_LOW_RATING;
    if (lowRating > 0) {
      score += lowRating;
      reasons.push(`avaliação média recente ${avg.toFixed(1)}/5`);
    }
  }

  // BPM vs alvo: distância do melhor BPM recente até o target.
  const bpms = recent.map((s) => s.bpm).filter((b): b is number => b != null);
  if (exercise.targetBpm != null && exercise.targetBpm > 0 && bpms.length > 0) {
    const bestRecent = Math.max(...bpms);
    const gap = Math.max(0, exercise.targetBpm - bestRecent);
    if (gap > 0) {
      score += (gap / exercise.targetBpm) * W_BPM_GAP;
      reasons.push(`BPM ${bestRecent} abaixo do alvo ${exercise.targetBpm}`);
    }
  }

  // Estagnação: 3+ sessões recentes com BPM e a mais nova não supera a mais antiga.
  if (bpms.length >= 3 && bpms[bpms.length - 1] <= bpms[0]) {
    score += W_STAGNANT;
    reasons.push("BPM estagnado nas últimas sessões");
  }

  const days = daysSince(chronological[chronological.length - 1].practicedOn, today);
  if (days > 0) {
    score += staleScore(days);
    reasons.push(`sem praticar há ${days} dia${days === 1 ? "" : "s"}`);
  }

  return { source: "diary", id: exercise.id, label: exercise.name, score, reasons };
}

/**
 * Ranqueia todos os candidatos (score desc; empate desfeito por source+id — ordem
 * estável e determinística). A tela decide quantos exibir (`limit` opcional).
 */
export function suggestPractice(
  input: SuggestionInput,
  today: Date,
  limit?: number
): PracticeSuggestion[] {
  const suggestions = [
    ...input.appProgress.map((r) => scoreAppExercise(r, today)),
    ...input.exercises
      .filter((e) => !e.archived) // arquivado nunca é sugerido
      .map((e) => scoreDiaryExercise(e, input.sessions, today)),
  ];

  suggestions.sort(
    (a, b) =>
      b.score - a.score ||
      a.source.localeCompare(b.source) ||
      a.id.localeCompare(b.id)
  );
  return limit != null ? suggestions.slice(0, limit) : suggestions;
}
