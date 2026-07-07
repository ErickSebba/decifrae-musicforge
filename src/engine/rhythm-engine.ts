/**
 * Lógica pura do modo Tap (leitura rítmica). Sem React, áudio ou AlphaTab — só tempo e
 * avaliação, totalmente testável. Tempos em milissegundos relativos ao "zero" da partitura
 * (depois do count-in, que é responsabilidade do orquestrador).
 */

export interface RhythmEvent {
  /** Duração em batidas (1 = semínima, 0.5 = colcheia, 2 = mínima). */
  beats: number;
  /** Se true, é uma pausa: ocupa tempo mas não espera tap. */
  rest?: boolean;
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

/** Padrão fixo inicial: 8 semínimas a 80 BPM. TODO: múltiplos padrões / ajuste na UI. */
export const DEFAULT_PATTERN: RhythmPattern = {
  tempo: 80,
  events: Array.from({ length: 8 }, () => ({ beats: 1 })),
};

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

const DURATION_TOKEN: Record<number, string> = { 2: "2", 1: "4", 0.5: "8", 0.25: "16" };

/**
 * alphaTex do padrão em clave de fá, altura fixa (a altura não importa no Tap).
 * O `\tempo` precisa casar com `pattern.tempo`: assim o eixo de tempo (ms) do MIDI do AlphaTab
 * coincide com o nosso clock, e `updatePosition(elapsed)` posiciona o cursor em sincronia.
 */
export function patternToTex(pattern: RhythmPattern, pitch = "c3"): string {
  const body = pattern.events
    .map((ev) => `:${DURATION_TOKEN[ev.beats] ?? "4"} ${ev.rest ? "r" : pitch}`)
    .join(" ");
  return `\\tempo ${pattern.tempo}\n\\clef F4\n.\n${body}`;
}