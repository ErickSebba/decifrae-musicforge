/**
 * Ponte pura teoria→apresentação (2.2/2.3): alphaTex de uma sequência de notas
 * vinda do theory-engine, highlight pro Fretboard e agenda de playback. Sem
 * React/áudio/AlphaTab.
 *
 * Contrato central: recebe o array JÁ PRONTO de majorScale/naturalMinorScale/
 * modeScale — nunca recalcula teoria nem regrafá nota (se o motor disse "Bb",
 * a pauta desenha Bb; regrafár aqui seria a função que "ensina a ler errado").
 *
 * Pauta e áudio derivam da MESMA atribuição de oitava (assignWrittenOctaves) —
 * "expandir primeiro, derivar depois", como no restante do sistema rítmico.
 */

import { CLEF_TOKEN, msPerBeat, type Clef } from "./rhythm-engine";
import { spell, spelledName, spelledPitchClass } from "./theory-engine";
import { midiToNoteName, pitchClassName } from "./note-utils";

/** Ordem de letras pra decidir virada de oitava (posição na pauta segue a LETRA). */
const LETTER_ORDER = ["C", "D", "E", "F", "G", "A", "B"];

interface WrittenNote {
  /** Nome grafado canônico, sem oitava (ex.: "Bb"). */
  name: string;
  /** Oitava escrita atribuída. */
  octave: number;
}

/**
 * Atribui oitava escrita a uma sequência ascendente de notas grafadas: sobe quando a
 * letra é ESTRITAMENTE anterior na ordem C..B (letra repetida com acidente ascendente —
 * F → F# na blues — permanece na mesma oitava). Fonte única usada pela pauta
 * (scaleToTex) e pelo playback (scalePlaybackSchedule).
 */
function assignWrittenOctaves(notes: string[], startOctave: number): WrittenNote[] {
  if (notes.length === 0) {
    throw new Error("Sequência de notas vazia");
  }
  let octave = startOctave;
  let prevLetterIdx = -1;

  return notes.map((rawName) => {
    const n = spell(rawName);
    if (Math.abs(n.accidental) > 1) {
      throw new Error(`Acidente duplo não suportado na pauta: "${rawName}"`);
    }
    const letterIdx = LETTER_ORDER.indexOf(n.letter);
    if (prevLetterIdx >= 0 && letterIdx < prevLetterIdx) {
      octave += 1;
    }
    prevLetterIdx = letterIdx;
    return { name: spelledName(n), octave };
  });
}

export interface ScaleToTexOptions {
  /** Token de duração alphaTex por nota (4 = semínima). Ritmos variados são da 2.5. */
  duration?: number;
  /** Oitava ESCRITA da 1ª nota em clave de Fá (região do pool E2–A3 do Módulo 1). */
  startOctave?: number;
  /**
   * BPM: emite `\tempo N`. OBRIGATÓRIO quando o tex dirige cursor (o eixo MIDI do
   * AlphaTab precisa casar com o clock — mecânica validada nº 3). Omitido = pauta
   * puramente estática, saída idêntica à da 2.2.
   */
  tempo?: number;
}

/**
 * alphaTex de uma sequência ascendente de notas grafadas (sem oitava), na clave dada.
 * Em SOL a escrita sobe uma 8ª, mesma convenção do noteToBassTex (mecânica validada
 * nº 5) — o áudio não muda, só a escrita.
 */
export function scaleToTex(notes: string[], clef: Clef = "F", opts: ScaleToTexOptions = {}): string {
  const duration = opts.duration ?? 4;
  const startOctave = (opts.startOctave ?? 2) + (clef === "G" ? 1 : 0);
  const tokens = assignWrittenOctaves(notes, startOctave).map(
    (w) => `:${duration} ${w.name.toLowerCase()}${w.octave}`
  );
  const tempoHeader = opts.tempo ? `\\tempo ${opts.tempo}\n` : "";
  return `${tempoHeader}\\clef ${CLEF_TOKEN[clef]}\n.\n${tokens.join(" ")}`;
}

/**
 * Notas no formato que Fretboard.highlightedNotes espera (nomes octave-agnostic,
 * resolvidos por pitch class via pitchClassOf). Grafia preservada quando o acidente
 * é simples; acidente duplo (que pitchClassOf não conhece) degrada enarmonicamente
 * (F## → G) — o highlight é por pitch class, então a posição acesa não mente.
 */
export function scaleToHighlight(notes: string[]): string[] {
  return notes.map((name) => {
    const n = spell(name);
    if (Math.abs(n.accidental) <= 1) {
      return spelledName(n);
    }
    return pitchClassName(midiToNoteName(60 + spelledPitchClass(n)));
  });
}

// ---------------------------------------------------------------------------
// Agenda de playback (2.3) — pura, testável sem áudio/UI
// ---------------------------------------------------------------------------

export interface ScheduledScaleNote {
  /** Nome grafado do motor, sem oitava (ex.: "Bb"). */
  name: string;
  /** Oitava ESCRITA em clave de Fá — mesma atribuição da pauta (assignWrittenOctaves). */
  writtenOctave: number;
  /** Onset em ms desde o início do playback (1ª nota sempre em 0). */
  timeMs: number;
  /** Duração da nota em ms (uniforme: 1 semínima). */
  durationMs: number;
}

export interface ScalePlaybackSchedule {
  notes: ScheduledScaleNote[];
  totalMs: number;
}

/**
 * Agenda o playback da escala: todas as notas como semínimas no BPM dado (ritmos
 * variados por nota são assunto do editor, 2.5). A oitava escrita vem da MESMA regra
 * da pauta — cursor e áudio ficam amarrados por construção. Tempos relativos ao zero
 * do playback; o t0 absoluto (clock do AudioContext) é responsabilidade do hook.
 */
export function scalePlaybackSchedule(
  notes: string[],
  bpm: number,
  opts: { startOctave?: number } = {}
): ScalePlaybackSchedule {
  const mpb = msPerBeat(bpm);
  const written = assignWrittenOctaves(notes, opts.startOctave ?? 2);
  return {
    notes: written.map((w, i) => ({
      name: w.name,
      writtenOctave: w.octave,
      timeMs: i * mpb,
      durationMs: mpb,
    })),
    totalMs: written.length * mpb,
  };
}
