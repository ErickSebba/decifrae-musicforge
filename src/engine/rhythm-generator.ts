import { beatsPerBar, type RhythmEvent, type TimeSignature } from "./rhythm-engine";
import type { TapLevel } from "./levels";

/**
 * Gerador de ritmo (3c-1): produz um padrão NOVO a cada tentativa a partir do perfil do
 * nível (vocabulário + fórmula + estrutura). Puro e determinístico via RNG injetável —
 * mesmo padrão do pickRandomNote da 1.4. Escopo: compassos simples (4/4, 3/4); compostos
 * (6/8) ficam pra 3c-2.
 */

/** Catálogo de figuras. `beats` em semínimas (mesma unidade do RhythmEvent). */
const FIGURE_DEFS = {
  seminima: { beats: 1 },
  minima: { beats: 2 },
  semibreve: { beats: 4 },
  colcheia: { beats: 0.5 },
  "pausa-seminima": { beats: 1, rest: true },
} as const satisfies Record<string, RhythmEvent>;

export type FigureId = keyof typeof FIGURE_DEFS;

/** Visão tipada como RhythmEvent (o literal do as const não expõe `rest` nas notas). */
export const FIGURES: Record<FigureId, RhythmEvent> = FIGURE_DEFS;

/** Nomes de exibição (UI) — o modelo usa os ids. */
export const FIGURE_LABELS: Record<FigureId, string> = {
  seminima: "semínima",
  minima: "mínima",
  semibreve: "semibreve",
  colcheia: "colcheia",
  "pausa-seminima": "pausa de semínima",
};

/** Fonte de aleatoriedade injetável: retorna [0, 1). */
export type Rng = () => number;

/**
 * Regras anti-degenerescência (por tentativa de compasso, com re-sorteio limitado):
 * - R1 (dura): todo compasso tem >=1 nota tocada — nunca um compasso 100% pausa. Se os
 *   re-sorteios esgotarem, fallback determinístico: preenche só com figuras de nota.
 * - R2 (variedade): quando o vocabulário tem >=2 figuras, dois compassos consecutivos não
 *   podem ser idênticos. Se os re-sorteios esgotarem (espaço combinatório pequeno), aceita
 *   o último compasso válido — a regra relaxa, o gerador nunca trava.
 * O limite vale também pro preenchimento estrutural: se nenhuma figura couber no espaço
 * restante (beco sem saída), a tentativa falha; MAX_BAR_ATTEMPTS becos seguidos → erro
 * claro (vocabulário incapaz de fechar a fórmula), em vez de loop infinito.
 */
const MAX_BAR_ATTEMPTS = 12;

function pickFrom<T>(items: T[], rng: Rng): T {
  return items[Math.floor(rng() * items.length)];
}

function sameBar(a: RhythmEvent[], b: RhythmEvent[]): boolean {
  return (
    a.length === b.length &&
    a.every((ev, i) => ev.beats === b[i].beats && Boolean(ev.rest) === Boolean(b[i].rest))
  );
}

/** Uma tentativa de encher o compasso; null se chegar num resto que nenhuma figura cobre. */
function tryFillBar(figures: FigureId[], barLen: number, rng: Rng): RhythmEvent[] | null {
  const bar: RhythmEvent[] = [];
  let remaining = barLen;
  while (remaining > 0) {
    const fitting = figures.filter((f) => FIGURES[f].beats <= remaining);
    if (fitting.length === 0) return null;
    const fig = FIGURES[pickFrom(fitting, rng)];
    bar.push({ ...fig });
    remaining -= fig.beats;
  }
  return bar;
}

/**
 * Gera UM compasso que fecha exatamente a fórmula, com as regras R1/R2. `previousBar`
 * habilita a R2. Lança se o vocabulário não tiver figura de nota ou não fechar a fórmula.
 */
export function generateBar(
  vocabulary: FigureId[],
  ts: TimeSignature,
  rng: Rng = Math.random,
  previousBar?: RhythmEvent[]
): RhythmEvent[] {
  const barLen = beatsPerBar(ts);
  const noteFigures = vocabulary.filter((f) => !FIGURES[f].rest);
  if (noteFigures.length === 0) {
    throw new Error(`Vocabulário sem figura de nota: [${vocabulary.join(", ")}]`);
  }

  let deadEnds = 0;
  let repeatedButValid: RhythmEvent[] | null = null; // reprovado só na R2

  for (let attempt = 0; attempt < MAX_BAR_ATTEMPTS; attempt++) {
    const bar = tryFillBar(vocabulary, barLen, rng);
    if (bar === null) {
      deadEnds++;
      continue;
    }
    if (!bar.some((ev) => !ev.rest)) continue; // R1: re-sorteia
    if (previousBar && vocabulary.length >= 2 && sameBar(bar, previousBar)) {
      repeatedButValid = bar; // R2: re-sorteia, mas guarda como plano B
      continue;
    }
    return bar;
  }

  if (deadEnds === MAX_BAR_ATTEMPTS) {
    throw new Error(
      `Não foi possível fechar um compasso de ${barLen} batida(s) com o vocabulário ` +
        `[${vocabulary.join(", ")}] após ${MAX_BAR_ATTEMPTS} tentativas`
    );
  }
  if (repeatedButValid) return repeatedButValid; // R2 relaxa: melhor repetir que travar

  // R1 esgotou os sorteios (RNG viciado em pausas): fecha só com notas.
  const fallback = tryFillBar(noteFigures, barLen, rng);
  if (fallback === null) {
    throw new Error(
      `Não foi possível fechar um compasso de ${barLen} batida(s) só com as figuras de ` +
        `nota [${noteFigures.join(", ")}]`
    );
  }
  return fallback;
}

/**
 * Gera UMA passada do nível (`structure.bars` compassos). No `loop` a mesma passada repete
 * `repeats`× (expansão feita por levelToPattern) — o aluno reencontra o trecho que acabou
 * de ler, como no comportamento dos níveis curados.
 */
export function generateLevelPass(level: TapLevel, rng: Rng = Math.random): RhythmEvent[] {
  const events: RhythmEvent[] = [];
  let previous: RhythmEvent[] | undefined;
  for (let i = 0; i < level.structure.bars; i++) {
    const bar = generateBar(level.vocabulary, level.timeSignature, rng, previous);
    events.push(...bar);
    previous = bar;
  }
  return events;
}