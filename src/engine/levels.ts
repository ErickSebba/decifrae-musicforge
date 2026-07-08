import {
  patternToTex,
  type Clef,
  type RhythmEvent,
  type RhythmPattern,
  type TimeSignature,
} from "./rhythm-engine";
import type { FigureId } from "./rhythm-generator";

/**
 * Modelo de nível do modo Tap. Desde a 3c-1 o nível é um PERFIL de gerador (vocabulário +
 * fórmula + estrutura): o padrão nasce novo a cada tentativa via generateLevelPass e circula
 * como parâmetro explícito — as funções abaixo não sabem se a passada veio de humano ou
 * gerador. A persistência (3b) é por level_id e independe do padrão sorteado.
 */

export type LevelStructure =
  | { type: "loop"; bars: number; repeats: number } // trecho curto que repete M vezes
  | { type: "through"; bars: number }; // trecho longo, toca uma vez

export interface TapLevel {
  id: string;
  name: string;
  /** Figuras permitidas — insumo do gerador (labels de UI em FIGURE_LABELS). */
  vocabulary: FigureId[];
  /** Compassos simples por enquanto (4/4, 3/4); compostos ficam pra 3c-2. */
  timeSignature: TimeSignature;
  suggestedBpm: number;
  structure: LevelStructure;
  /** Fração de Perfeito+Bom sobre o total de alvos necessária pra passar (0–1). */
  passThreshold: number;
}

/** Quantas vezes a passada é tocada. */
export function levelRepeats(level: TapLevel): number {
  return level.structure.type === "loop" ? level.structure.repeats : 1;
}

/**
 * Expande UMA passada (structure.bars compassos) num RhythmPattern pronto para o motor:
 * `loop` repete a passada por extenso (sem sinais de repetição — o eixo de tempo do cursor
 * fica 1:1 com o clock). Alvos, duração, metrônomo e tex derivam TODOS deste padrão
 * expandido. `passEvents` pode vir do gerador ou de um array literal (testes).
 */
export function levelToPattern(
  level: TapLevel,
  passEvents: RhythmEvent[],
  bpm?: number
): RhythmPattern {
  const repeats = levelRepeats(level);
  const events: RhythmEvent[] = [];
  for (let i = 0; i < repeats; i++) events.push(...passEvents);
  return { tempo: bpm ?? level.suggestedBpm, events };
}

/** alphaTex do nível expandido, com compassos separados pela fórmula e clave dadas. */
export function levelToTex(
  level: TapLevel,
  passEvents: RhythmEvent[],
  bpm?: number,
  clef?: Clef
): string {
  return patternToTex(levelToPattern(level, passEvents, bpm), {
    timeSignature: level.timeSignature,
    clef,
  });
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
const TS_3_4: TimeSignature = { count: 3, unit: 4 };

/**
 * Perfis de nível, na ordem didática dos métodos de baixo. l1–l5 completam o arco de
 * FIGURAS em 4/4 (semínima → mínima → semibreve → pausas → colcheias); o l6 introduz o
 * compasso 3/4 com figuras já conhecidas — uma variável nova por vez. O padrão de cada
 * tentativa nasce de generateLevelPass (rhythm-generator.ts) a partir destes perfis.
 */
export const CURATED_LEVELS: TapLevel[] = [
  {
    id: "l1-seminimas",
    name: "Semínimas",
    vocabulary: ["seminima"],
    timeSignature: TS_4_4,
    suggestedBpm: 80,
    structure: { type: "loop", bars: 2, repeats: 2 },
    passThreshold: 0.8,
  },
  {
    id: "l2-minimas",
    name: "Semínimas e mínimas",
    vocabulary: ["seminima", "minima"],
    timeSignature: TS_4_4,
    suggestedBpm: 80,
    structure: { type: "through", bars: 4 },
    passThreshold: 0.8,
  },
  {
    id: "l3-semibreves",
    name: "Com semibreves",
    vocabulary: ["seminima", "minima", "semibreve"],
    timeSignature: TS_4_4,
    suggestedBpm: 80,
    structure: { type: "through", bars: 4 },
    passThreshold: 0.8,
  },
  {
    id: "l4-pausas",
    name: "Com pausas",
    vocabulary: ["seminima", "minima", "pausa-seminima"],
    timeSignature: TS_4_4,
    suggestedBpm: 80,
    structure: { type: "through", bars: 4 },
    passThreshold: 0.8,
  },
  {
    id: "l5-colcheias",
    name: "Colcheias",
    vocabulary: ["seminima", "colcheia"],
    timeSignature: TS_4_4,
    suggestedBpm: 70,
    structure: { type: "loop", bars: 2, repeats: 2 },
    passThreshold: 0.8,
  },
  {
    // Id novo de propósito (o conteúdo mudou: era "colcheias e pausas" em 4/4). A linha
    // antiga l6-colcheias-pausas no banco fica órfã — inofensiva, o desbloqueio deste
    // nível depende só de l5.passed.
    id: "l6-compasso-3-4",
    name: "Compasso 3/4",
    vocabulary: ["seminima", "minima", "colcheia", "pausa-seminima"],
    timeSignature: TS_3_4,
    suggestedBpm: 70,
    structure: { type: "through", bars: 4 },
    passThreshold: 0.8,
  },
];