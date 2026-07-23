import { STALE_CAP_DAYS } from "./practice-suggestion";

/**
 * Estatísticas puras da tela de progresso (3.1): merge do heatmap, grade de calendário
 * e classificação de exercícios. Sem React/db/I-O (camada engine; tipos estruturais —
 * os registros dos módulos db encaixam por forma, como no practice-suggestion).
 *
 * DATAS: este módulo faz só MATEMÁTICA de calendário (objetos Date); a formatação
 * pra chave 'YYYY-MM-DD' é do chamador (componente usa o `localDayString` do
 * db/exercise-progress — fonte única da convenção, sem duplicar formatador aqui).
 */

/**
 * Limiar do badge "parado" — IMPORTADO do practice-suggestion (STALE_CAP_DAYS) DE
 * PROPÓSITO, nunca um segundo número igual por coincidência: o badge da tela acende
 * exatamente onde a engine de sugestão já pontua estagnação no teto. Se um dia os dois
 * conceitos divergirem (limiar visual × limiar de recomendação), separar em duas
 * constantes é decisão explícita — ver comentário espelhado no practice-suggestion.
 */
export const STALE_BADGE_DAYS = STALE_CAP_DAYS;

/** Tentativas mínimas sem aprovação pra marcar "estagnado" (calibrável). */
export const STAGNANT_MIN_ATTEMPTS = 5;

const MS_PER_DAY = 86_400_000;

/**
 * Merge das DUAS fontes de dias de prática — practice_days (exercícios do app, soma
 * dos kinds) + sessões do diário M5 (1 por sessão, via practiced_on). As fontes são
 * DISJUNTAS por construção (3+5.0: sessão de diário não incrementa practice_days),
 * então o merge é soma direta por dia, sem risco de contar duas vezes.
 */
export function mergePracticeDayCounts(
  days: { day: string; count: number }[],
  sessions: { practicedOn: string }[]
): Map<string, number> {
  const merged = new Map<string, number>();
  for (const d of days) {
    merged.set(d.day, (merged.get(d.day) ?? 0) + d.count);
  }
  for (const s of sessions) {
    merged.set(s.practicedOn, (merged.get(s.practicedOn) ?? 0) + 1);
  }
  return merged;
}

/**
 * Grade do heatmap: `weeks` colunas de 7 dias (domingo→sábado), a última coluna é a
 * semana de HOJE (dias futuros da semana corrente incluídos — o chamador os apaga).
 * Devolve Dates puros; a chave de lookup é formatada pelo chamador.
 */
export function buildHeatmapWeeks(today: Date, weeks = 12): Date[][] {
  // Domingo da semana corrente, no fuso local, zerando horas (aritmética estável).
  const currentSunday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay());
  const grid: Date[][] = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const column: Date[] = [];
    for (let d = 0; d < 7; d++) {
      column.push(
        new Date(
          currentSunday.getFullYear(),
          currentSunday.getMonth(),
          currentSunday.getDate() - w * 7 + d
        )
      );
    }
    grid.push(column);
  }
  return grid;
}

export interface ExerciseBadges {
  /** Muitas tentativas sem aprovação (proxy derivável de "sem melhora" — ver 12.2 do brief). */
  stagnant: boolean;
  /** Sem praticar há STALE_BADGE_DAYS ou mais. */
  stale: boolean;
}

/**
 * Badges de alerta de um exercício do app. `orphan` = id sem nível correspondente no
 * catálogo atual (ex.: l6-colcheias-pausas pré-3c-1): nunca "estagnado" — o nível não
 * existe mais pra ser praticado — mas "parado" segue valendo (é só fato temporal).
 */
export function classifyExercise(
  record: { passed: boolean; attemptsCount: number; lastAttemptedAt: string; orphan?: boolean },
  today: Date
): ExerciseBadges {
  const last = new Date(record.lastAttemptedAt).getTime();
  const days = Number.isNaN(last)
    ? 0
    : Math.max(0, Math.floor((today.getTime() - last) / MS_PER_DAY));
  return {
    stagnant: !record.orphan && !record.passed && record.attemptsCount >= STAGNANT_MIN_ATTEMPTS,
    stale: days >= STALE_BADGE_DAYS,
  };
}
