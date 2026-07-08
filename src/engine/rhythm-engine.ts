/**
 * Lógica pura do modo Tap (leitura rítmica). Sem React, áudio ou AlphaTab — só tempo e
 * avaliação, totalmente testável. Tempos em milissegundos relativos ao "zero" da partitura
 * (depois do count-in, que é responsabilidade do orquestrador).
 */

export interface RhythmEvent {
  /** Duração em batidas (1 = semínima, 0.5 = colcheia, 2 = mínima, 4 = semibreve). */
  beats: number;
  /** Se true, é uma pausa: ocupa tempo mas não espera tap. */
  rest?: boolean;
}

/** Fórmula de compasso (4/4 → { count: 4, unit: 4 }). */
export interface TimeSignature {
  count: number;
  unit: number;
}

/** Batidas (em semínimas) que preenchem um compasso da fórmula dada. */
export function beatsPerBar(ts: TimeSignature): number {
  return ts.count * (4 / ts.unit);
}

/**
 * Agrupa os eventos em compassos exatos. Lança erro se algum evento atravessa a barra ou se
 * o último compasso fica incompleto — usado na validação dos níveis curados e no tex.
 */
export function splitIntoBars(events: RhythmEvent[], ts: TimeSignature): RhythmEvent[][] {
  const barLen = beatsPerBar(ts);
  const bars: RhythmEvent[][] = [];
  let current: RhythmEvent[] = [];
  let filled = 0;
  for (const ev of events) {
    if (filled + ev.beats > barLen) {
      throw new Error(
        `Compasso quebrado: evento de ${ev.beats} batida(s) estoura o compasso ${bars.length + 1} (${filled}/${barLen})`
      );
    }
    current.push(ev);
    filled += ev.beats;
    if (filled === barLen) {
      bars.push(current);
      current = [];
      filled = 0;
    }
  }
  if (filled !== 0) {
    throw new Error(`Compasso ${bars.length + 1} incompleto: soma ${filled}/${barLen}`);
  }
  return bars;
}

export interface RhythmPattern {
  tempo: number; // BPM
  events: RhythmEvent[];
}

export interface TapWindows {
  perfectMs: number;
  goodMs: number;
}

export type TapResult = "perfect" | "good" | "miss";

export const DEFAULT_WINDOWS: TapWindows = { perfectMs: 50, goodMs: 120 };

export function msPerBeat(tempo: number): number {
  return 60000 / tempo;
}

export function totalBeats(pattern: RhythmPattern): number {
  return pattern.events.reduce((sum, ev) => sum + ev.beats, 0);
}

export function patternDurationMs(pattern: RhythmPattern): number {
  return totalBeats(pattern) * msPerBeat(pattern.tempo);
}

/** Tempo-alvo (ms) de cada evento que espera tap (pausas ocupam tempo mas não geram alvo). */
export function expectedTapTimes(pattern: RhythmPattern): number[] {
  const mpb = msPerBeat(pattern.tempo);
  const times: number[] = [];
  let t = 0;
  for (const ev of pattern.events) {
    if (!ev.rest) times.push(t);
    t += ev.beats * mpb;
  }
  return times;
}

/** Tempo (ms) de cada pulso do metrônomo: uma batida por vez até o fim do padrão. */
export function metronomeClickTimes(pattern: RhythmPattern): number[] {
  const mpb = msPerBeat(pattern.tempo);
  const beats = Math.round(totalBeats(pattern));
  return Array.from({ length: beats }, (_, b) => b * mpb);
}

/**
 * Classifica um tap contra os alvos, ignorando os já consumidos. Retorna o alvo casado
 * (index) para o chamador marcá-lo como consumido. Sem alvo dentro de `goodMs` → miss.
 */
export function classifyTap(
  tapMs: number,
  targets: number[],
  windows: TapWindows = DEFAULT_WINDOWS,
  consumed: Set<number> = new Set()
): { result: TapResult; index: number } {
  let bestIndex = -1;
  let bestDiff = Infinity;
  for (let i = 0; i < targets.length; i++) {
    if (consumed.has(i)) continue;
    const diff = Math.abs(tapMs - targets[i]);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIndex = i;
    }
  }
  if (bestIndex === -1 || bestDiff > windows.goodMs) {
    return { result: "miss", index: -1 };
  }
  return { result: bestDiff <= windows.perfectMs ? "perfect" : "good", index: bestIndex };
}

const DURATION_TOKEN: Record<number, string> = { 4: "1", 2: "2", 1: "4", 0.5: "8", 0.25: "16" };

export interface PatternToTexOptions {
  pitch?: string;
  /** Se informada, emite `\ts` e separa os compassos com `|` (exige compassos exatos). */
  timeSignature?: TimeSignature;
}

/**
 * alphaTex do padrão em clave de fá, altura fixa (a altura não importa no Tap).
 * O `\tempo` precisa casar com `pattern.tempo`: assim o eixo de tempo (ms) do MIDI do AlphaTab
 * coincide com o nosso clock, e `updatePosition(elapsed)` posiciona o cursor em sincronia.
 */
export function patternToTex(pattern: RhythmPattern, options: PatternToTexOptions = {}): string {
  const pitch = options.pitch ?? "c3";
  const eventToken = (ev: RhythmEvent) =>
    `:${DURATION_TOKEN[ev.beats] ?? "4"} ${ev.rest ? "r" : pitch}`;

  const ts = options.timeSignature;
  const header = ts
    ? `\\tempo ${pattern.tempo}\n\\ts ${ts.count} ${ts.unit}\n\\clef F4\n.\n`
    : `\\tempo ${pattern.tempo}\n\\clef F4\n.\n`;
  const body = ts
    ? splitIntoBars(pattern.events, ts)
        .map((bar) => bar.map(eventToken).join(" "))
        .join(" | ")
    : pattern.events.map(eventToken).join(" ");
  return header + body;
}