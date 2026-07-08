import {
  patternToTex,
  splitIntoBars,
  type RhythmEvent,
  type RhythmPattern,
  type TimeSignature,
} from "./rhythm-engine";

/**
 * Modelo de nível do modo Tap (sub-etapa 3a): níveis curados à mão, progredindo pelo
 * vocabulário rítmico. O gerador por regra (3c) produzirá o `pattern` a partir de
 * `vocabulary`/`structure`; a persistência de desbloqueio (3b) usará `passThreshold`.
 */

export type LevelStructure =
  | { type: "loop"; bars: number; repeats: number } // trecho curto que repete M vezes
  | { type: "through"; bars: number }; // trecho longo, toca uma vez

export interface TapLevel {
  id: string;
  name: string;
  /** Figuras usadas (informativo p/ UI; na 3c vira insumo do gerador). */
  vocabulary: string[];
  /** Sempre 4/4 por enquanto — mas é dado do nível, o motor não hardcoda. */
  timeSignature: TimeSignature;
  suggestedBpm: number;
  structure: LevelStructure;
  /** Fração de Perfeito+Bom sobre o total de alvos necessária pra passar (0–1). */
  passThreshold: number;
  /** UMA passada do ritmo (structure.bars compassos), curada à mão. */
  pattern: RhythmEvent[];
}

/** Quantas vezes a passada é tocada. */
export function levelRepeats(level: TapLevel): number {
  return level.structure.type === "loop" ? level.structure.repeats : 1;
}

/**
 * Expande o nível num RhythmPattern pronto para o motor: `loop` repete a passada por
 * extenso (sem sinais de repetição — o eixo de tempo do cursor fica 1:1 com o clock).
 * Alvos, duração, metrônomo e tex derivam TODOS deste padrão expandido.
 */
export function levelToPattern(level: TapLevel, bpm?: number): RhythmPattern {
  const repeats = levelRepeats(level);
  const events: RhythmEvent[] = [];
  for (let i = 0; i < repeats; i++) events.push(...level.pattern);
  return { tempo: bpm ?? level.suggestedBpm, events };
}

/** alphaTex do nível expandido, com compassos separados pela fórmula do nível. */
export function levelToTex(level: TapLevel, bpm?: number): string {
  return patternToTex(levelToPattern(level, bpm), { timeSignature: level.timeSignature });
}

/** Compassos de uma passada do nível (lança se algum compasso não fechar exato). */
export function levelBars(level: TapLevel): RhythmEvent[][] {
  return splitIntoBars(level.pattern, level.timeSignature);
}

export interface LevelSummary {
  hits: number;
  ratio: number;
  passed: boolean;
}

/**
 * Aprovação: Perfeito+Bom sobre o TOTAL de alvos. Alvos não tocados contam contra (ficam
 * fora de `hits`); taps extras aparecem como erro na UI mas não inflam o denominador.
 */
export function computeSummary(
  counts: { perfect: number; good: number },
  totalTargets: number,
  passThreshold: number
): LevelSummary {
  const hits = counts.perfect + counts.good;
  const ratio = totalTargets > 0 ? hits / totalTargets : 0;
  return { hits, ratio, passed: ratio >= passThreshold };
}

/** Melhor resultado persistido de um nível (linha de tap_level_progress, já tipada). */
export interface ProgressRecord {
  levelId: string;
  bestRatio: number;
  passed: boolean;
  attemptsCount: number;
  lastAttemptedAt: string;
}

/**
 * Desbloqueio linear derivado em runtime (sem coluna "unlocked" no banco — uma fonte de
 * verdade só): nível 0 sempre aberto; nível N aberto se N−1 tem `passed`. Como `passed`
 * nunca regride na persistência, o resultado é estável entre sessões.
 */
export function deriveUnlockedLevels(
  levelOrder: string[],
  progress: ProgressRecord[]
): Set<string> {
  const passedIds = new Set(progress.filter((p) => p.passed).map((p) => p.levelId));
  const unlocked = new Set<string>();
  for (let i = 0; i < levelOrder.length; i++) {
    if (i === 0 || passedIds.has(levelOrder[i - 1])) unlocked.add(levelOrder[i]);
  }
  return unlocked;
}

const TS_4_4: TimeSignature = { count: 4, unit: 4 };

// Atalhos de leitura para os padrões curados.
const q: RhythmEvent = { beats: 1 }; // semínima
const h: RhythmEvent = { beats: 2 }; // mínima
const w: RhythmEvent = { beats: 4 }; // semibreve
const e: RhythmEvent = { beats: 0.5 }; // colcheia
const rq: RhythmEvent = { beats: 1, rest: true }; // pausa de semínima

/**
 * Níveis iniciais, na ordem didática dos métodos de baixo: progressão só pelo vocabulário
 * (eixo 1), sempre 4/4. Cada compasso soma exatamente 4 batidas (validado por teste).
 */
export const CURATED_LEVELS: TapLevel[] = [
  {
    id: "l1-seminimas",
    name: "Semínimas",
    vocabulary: ["semínima"],
    timeSignature: TS_4_4,
    suggestedBpm: 80,
    structure: { type: "loop", bars: 2, repeats: 2 },
    passThreshold: 0.8,
    // | q q q q | q q q q |
    pattern: [q, q, q, q, q, q, q, q],
  },
  {
    id: "l2-minimas",
    name: "Semínimas e mínimas",
    vocabulary: ["semínima", "mínima"],
    timeSignature: TS_4_4,
    suggestedBpm: 80,
    structure: { type: "through", bars: 4 },
    passThreshold: 0.8,
    // | q q h | h q q | q h q | h h |
    pattern: [q, q, h, h, q, q, q, h, q, h, h],
  },
  {
    id: "l3-semibreves",
    name: "Com semibreves",
    vocabulary: ["semínima", "mínima", "semibreve"],
    timeSignature: TS_4_4,
    suggestedBpm: 80,
    structure: { type: "through", bars: 4 },
    passThreshold: 0.8,
    // | w | q q h | h h | w |
    pattern: [w, q, q, h, h, h, w],
  },
  {
    id: "l4-pausas",
    name: "Com pausas",
    vocabulary: ["semínima", "mínima", "pausa de semínima"],
    timeSignature: TS_4_4,
    suggestedBpm: 80,
    structure: { type: "through", bars: 4 },
    passThreshold: 0.8,
    // | q q r q | q r q q | h r q | r q q q |
    pattern: [q, q, rq, q, q, rq, q, q, h, rq, q, rq, q, q, q],
  },
  {
    id: "l5-colcheias",
    name: "Colcheias",
    vocabulary: ["semínima", "colcheia"],
    timeSignature: TS_4_4,
    suggestedBpm: 70,
    structure: { type: "loop", bars: 2, repeats: 2 },
    passThreshold: 0.8,
    // | q q e e q | e e e e q q |
    pattern: [q, q, e, e, q, e, e, e, e, q, q],
  },
  {
    id: "l6-colcheias-pausas",
    name: "Colcheias e pausas combinadas",
    vocabulary: ["semínima", "mínima", "colcheia", "pausa de semínima"],
    timeSignature: TS_4_4,
    suggestedBpm: 70,
    structure: { type: "through", bars: 4 },
    passThreshold: 0.8,
    // | q e e q r | r q e e q | e e q q e e | q r h |
    pattern: [q, e, e, q, rq, rq, q, e, e, q, e, e, q, q, e, e, q, rq, h],
  },
];