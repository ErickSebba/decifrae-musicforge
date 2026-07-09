/**
 * Ponte pura teoria→visual (sub-etapa 2.2): alphaTex de uma sequência de notas
 * vinda do theory-engine + highlight pro Fretboard. Sem React/áudio/AlphaTab.
 *
 * Contrato central: recebe o array JÁ PRONTO de majorScale/naturalMinorScale/
 * modeScale — nunca recalcula teoria nem regrafá nota (se o motor disse "Bb",
 * a pauta desenha Bb; regrafár aqui seria a função que "ensina a ler errado").
 */

import { CLEF_TOKEN, type Clef } from "./rhythm-engine";
import { spell, spelledName, spelledPitchClass } from "./theory-engine";
import { midiToNoteName, pitchClassName } from "./note-utils";

/** Ordem de letras pra decidir virada de oitava (posição na pauta segue a LETRA). */
const LETTER_ORDER = ["C", "D", "E", "F", "G", "A", "B"];

export interface ScaleToTexOptions {
  /** Token de duração alphaTex por nota (4 = semínima). Fixo por ora — ritmo real é da 2.3. */
  duration?: number;
  /** Oitava ESCRITA da 1ª nota em clave de Fá (região do pool E2–A3 do Módulo 1). */
  startOctave?: number;
}

/**
 * alphaTex de uma sequência ascendente de notas grafadas (sem oitava), na clave dada.
 * Oitavas atribuídas por letra: sobe quando a letra volta pra trás na ordem C..B
 * (F maior em Fá: f2 g2 a2 bb2 c3 d3 e3). Em SOL a escrita sobe uma 8ª, mesma
 * convenção do noteToBassTex (mecânica validada nº 5 do CONTEXTO). Sem `\tempo`:
 * esta pauta é estática (player off) — cursor dirigido é assunto da 2.3.
 */
export function scaleToTex(notes: string[], clef: Clef = "F", opts: ScaleToTexOptions = {}): string {
  if (notes.length === 0) {
    throw new Error("Sequência de notas vazia");
  }
  const duration = opts.duration ?? 4;
  let octave = (opts.startOctave ?? 2) + (clef === "G" ? 1 : 0);
  let prevLetterIdx = -1;

  const tokens = notes.map((name) => {
    const n = spell(name);
    if (Math.abs(n.accidental) > 1) {
      throw new Error(`Acidente duplo não suportado na pauta: "${name}"`);
    }
    const letterIdx = LETTER_ORDER.indexOf(n.letter);
    // Só letra ESTRITAMENTE anterior vira oitava: letra repetida com acidente
    // ascendente (F → F# na blues) permanece na mesma oitava escrita.
    if (prevLetterIdx >= 0 && letterIdx < prevLetterIdx) {
      octave += 1;
    }
    prevLetterIdx = letterIdx;
    return `:${duration} ${spelledName(n).toLowerCase()}${octave}`;
  });

  return `\\clef ${CLEF_TOKEN[clef]}\n.\n${tokens.join(" ")}`;
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
