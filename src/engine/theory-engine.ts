/**
 * Motor puro de teoria musical (Módulo 2, sub-etapa 2.1a): intervalos, escala
 * maior, menor natural/relativa e os 7 modos gregorianos. Sem React/áudio/AlphaTab.
 *
 * Grafia enarmônica correta POR CONSTRUÇÃO: a letra de cada grau é decidida
 * andando na sequência A–G (transpose escolhe a letra ANTES do acidente), nunca
 * pela lista cromática de 12 nomes — Fá maior tem Bb, não A#.
 *
 * Reusa note-utils (pitchClassOf) para a classe de altura das letras naturais;
 * acidentes — inclusive duplos (bb/##), que note-utils não conhece — entram por
 * aritmética sobre a letra, sem duplicar a tabela cromática.
 */

import { pitchClassOf } from "./note-utils";

// ---------------------------------------------------------------------------
// Nota grafada (letra + acidente, suporta bb..##)
// ---------------------------------------------------------------------------

/** Sequência de letras a partir de C — a oitava vira na letra C (convenção MIDI). */
const LETTERS = ["C", "D", "E", "F", "G", "A", "B"] as const;

export type Letter = (typeof LETTERS)[number];

/** Nota grafada: letra + acidente em semitons (-2 = bb, -1 = b, 0, +1 = #, +2 = ##). */
export interface SpelledNote {
  letter: Letter;
  accidental: number;
}

const ACCIDENTAL_VALUE: Record<string, number> = { "": 0, "#": 1, "##": 2, b: -1, bb: -2 };
const ACCIDENTAL_TEXT = ["bb", "b", "", "#", "##"]; // índice = acidente + 2

/** Normaliza acidentes unicode (♯/♭) para ASCII, como note-utils faz. */
function normalizeAccidentals(name: string): string {
  return name.replace(/♯/g, "#").replace(/♭/g, "b");
}

interface ParsedNote extends SpelledNote {
  /** null quando o nome veio sem oitava (ex.: "Bb"). */
  octave: number | null;
}

function parseSpelledNote(name: string): ParsedNote {
  const match = normalizeAccidentals(name).match(/^([A-Ga-g])(##|#|bb|b)?(-?\d+)?$/);
  if (!match) {
    throw new Error(`Nota inválida: "${name}"`);
  }
  return {
    letter: match[1].toUpperCase() as Letter,
    accidental: ACCIDENTAL_VALUE[match[2] ?? ""],
    octave: match[3] === undefined ? null : parseInt(match[3], 10),
  };
}

/** Interpreta um nome grafado (ex.: "Bb", "F##", "C"); oitava, se houver, é ignorada. */
export function spell(name: string): SpelledNote {
  const { letter, accidental } = parseSpelledNote(name);
  return { letter, accidental };
}

/** Nome textual de uma nota grafada, ex.: {B,-1} -> "Bb", {F,+2} -> "F##". */
export function spelledName(n: SpelledNote): string {
  if (!Number.isInteger(n.accidental) || n.accidental < -2 || n.accidental > 2) {
    throw new Error(`Acidente fora de bb..##: ${n.accidental}`);
  }
  return n.letter + ACCIDENTAL_TEXT[n.accidental + 2];
}

/** Classe de altura (0–11) de uma nota grafada: letra via note-utils + acidente. */
export function spelledPitchClass(n: SpelledNote): number {
  return (((pitchClassOf(n.letter) + n.accidental) % 12) + 12) % 12;
}

/**
 * Altura absoluta estilo MIDI de uma nota grafada com oitava. O acidente soma
 * DEPOIS da letra (Cb4 = 59, um semitom abaixo de C4 — convenção padrão).
 */
function spelledAbsolute(letter: Letter, accidental: number, octave: number): number {
  return 12 * (octave + 1) + pitchClassOf(letter) + accidental;
}

// ---------------------------------------------------------------------------
// Intervalos
// ---------------------------------------------------------------------------

/** Qualidade: justo (P), maior (M), menor (m), aumentado (A), diminuto (d). */
export type IntervalQuality = "P" | "M" | "m" | "A" | "d";

export interface Interval {
  /** 1..8 (intervalos simples). */
  number: number;
  quality: IntervalQuality;
  /** Derivado de number+quality, sempre coerente. */
  semitones: number;
}

/** Semitons do intervalo justo/maior de cada número. */
const BASE_SEMITONES: Record<number, number> = { 1: 0, 2: 2, 3: 4, 4: 5, 5: 7, 6: 9, 7: 11, 8: 12 };
const PERFECT_NUMBERS = new Set([1, 4, 5, 8]);

const QUALITY_OFFSET_PERFECT: Partial<Record<IntervalQuality, number>> = { P: 0, A: 1, d: -1 };
const QUALITY_OFFSET_MAJOR: Partial<Record<IntervalQuality, number>> = { M: 0, m: -1, A: 1, d: -2 };

/** Constrói um intervalo validado — lança para combinações inexistentes (ex.: P3, M5). */
export function interval(quality: IntervalQuality, number: number): Interval {
  if (!Number.isInteger(number) || number < 1 || number > 8) {
    throw new Error(`Número de intervalo inválido: ${number} (esperado 1..8)`);
  }
  const offsets = PERFECT_NUMBERS.has(number) ? QUALITY_OFFSET_PERFECT : QUALITY_OFFSET_MAJOR;
  const offset = offsets[quality];
  if (offset === undefined) {
    throw new Error(`Qualidade "${quality}" inválida para intervalo de ${number}ª`);
  }
  return { number, quality, semitones: BASE_SEMITONES[number] + offset };
}

const QUALITY_LABELS: Record<IntervalQuality, string> = {
  P: "justa",
  M: "maior",
  m: "menor",
  A: "aumentada",
  d: "diminuta",
};

/** Rótulos PT-BR por chave "<qualidade><número>", ex.: "M3" -> "3ª maior". */
export const INTERVAL_LABELS: Record<string, string> = (() => {
  const labels: Record<string, string> = {};
  for (let n = 1; n <= 8; n++) {
    const qualities: IntervalQuality[] = PERFECT_NUMBERS.has(n) ? ["d", "P", "A"] : ["d", "m", "M", "A"];
    for (const q of qualities) {
      let label = `${n}ª ${QUALITY_LABELS[q]}`;
      if (n === 1 && q === "P") label += " (uníssono)";
      if (n === 8 && q === "P") label += " (oitava)";
      labels[`${q}${n}`] = label;
    }
  }
  return labels;
})();

/** Qualidade a partir de número + semitons reais; lança se a grafia não nomeia intervalo simples. */
function qualityFor(number: number, semitones: number): IntervalQuality {
  const diff = semitones - BASE_SEMITONES[number];
  const table: Record<number, IntervalQuality | undefined> = PERFECT_NUMBERS.has(number)
    ? { 0: "P", 1: "A", [-1]: "d" }
    : { 0: "M", [-1]: "m", 1: "A", [-2]: "d" };
  const quality = table[diff];
  if (quality === undefined) {
    throw new Error(`Intervalo sem nome simples: ${number}ª com ${semitones} semitons`);
  }
  return quality;
}

/**
 * Intervalo ASCENDENTE entre duas notas grafadas.
 * - Sem oitavas ("C","F#"): assume a 2ª nota acima da 1ª, dentro de uma oitava.
 * - Com oitavas nas duas ("C3","G3"): usa a distância real; lança para intervalo
 *   descendente ou composto (> 8ª). Misturar com/sem oitava lança.
 */
export function intervalBetween(from: string, to: string): Interval {
  const a = parseSpelledNote(from);
  const b = parseSpelledNote(to);
  if ((a.octave === null) !== (b.octave === null)) {
    throw new Error(`Misturar nota com e sem oitava: "${from}" e "${to}"`);
  }
  const idxA = LETTERS.indexOf(a.letter);
  const idxB = LETTERS.indexOf(b.letter);

  let number: number;
  let semitones: number;
  if (a.octave !== null && b.octave !== null) {
    const diatonicSteps = (b.octave * 7 + idxB) - (a.octave * 7 + idxA);
    semitones = spelledAbsolute(b.letter, b.accidental, b.octave) - spelledAbsolute(a.letter, a.accidental, a.octave);
    if (diatonicSteps < 0) {
      throw new Error(`Intervalo descendente ("${from}" -> "${to}") — informe as notas em ordem ascendente`);
    }
    if (diatonicSteps > 7) {
      throw new Error(`Intervalo composto (> 8ª) não suportado: "${from}" -> "${to}"`);
    }
    number = diatonicSteps + 1;
  } else if (idxA === idxB) {
    // Mesma letra sem oitava: uníssono (possivelmente alterado), ex.: C -> C# = 1ª aumentada.
    number = 1;
    semitones = b.accidental - a.accidental;
  } else {
    number = ((idxB - idxA + 7) % 7) + 1;
    semitones = (((spelledPitchClass(b) - spelledPitchClass(a)) % 12) + 12) % 12;
  }
  return { number, quality: qualityFor(number, semitones), semitones };
}

/**
 * Nota a partir de nota + intervalo, subindo (padrão) ou descendo.
 * A letra do resultado é decidida pela distância de letras ANTES do acidente —
 * é isso que garante a grafia enarmônica correta (F + P4 = Bb, nunca A#).
 * Preserva a oitava se o input tiver ("C3" + P5 = "G3").
 */
export function transpose(note: string, itv: Interval, direction: "up" | "down" = "up"): string {
  const { letter, accidental, octave } = parseSpelledNote(note);
  const dir = direction === "down" ? -1 : 1;
  const baseOctave = octave ?? 4; // âncora arbitrária quando não há oitava

  const rawIdx = LETTERS.indexOf(letter) + dir * (itv.number - 1);
  const newLetter = LETTERS[((rawIdx % 7) + 7) % 7];
  const newOctave = baseOctave + Math.floor(rawIdx / 7);

  const targetAbs = spelledAbsolute(letter, accidental, baseOctave) + dir * itv.semitones;
  const newAccidental = targetAbs - spelledAbsolute(newLetter, 0, newOctave);
  if (newAccidental < -2 || newAccidental > 2) {
    throw new Error(
      `Grafia impossível: "${note}" ${direction === "down" ? "-" : "+"} ${itv.quality}${itv.number} exigiria acidente além de bb/##`
    );
  }
  const name = spelledName({ letter: newLetter, accidental: newAccidental });
  return octave === null ? name : name + newOctave;
}

// ---------------------------------------------------------------------------
// Escalas (trabalham com classes de altura grafadas — oitava do tônico é ignorada)
// ---------------------------------------------------------------------------

/** Intervalos de cada grau da escala maior a partir da tônica. */
const MAJOR_DEGREE_INTERVALS: Interval[] = [
  interval("P", 1),
  interval("M", 2),
  interval("M", 3),
  interval("P", 4),
  interval("P", 5),
  interval("M", 6),
  interval("M", 7),
];

function rotate<T>(arr: T[], start: number): T[] {
  return [...arr.slice(start), ...arr.slice(0, start)];
}

/** Tônica sem oitava, validada. */
function tonicName(tonic: string): string {
  return spelledName(spell(tonic));
}

/** Escala maior: 7 notas grafadas pela fórmula intervalar (letras consecutivas). */
export function majorScale(tonic: string): string[] {
  const t = tonicName(tonic);
  return MAJOR_DEGREE_INTERVALS.map((itv) => transpose(t, itv, "up"));
}

/** Tônica da relativa menor = 6º grau da escala maior. */
export function relativeMinorOf(majorTonic: string): string {
  return majorScale(majorTonic)[5];
}

/** Tônica da relativa maior = 3ª menor acima da tônica menor. */
export function relativeMajorOf(minorTonic: string): string {
  return transpose(tonicName(minorTonic), interval("m", 3), "up");
}

/** Menor natural: rotação da relativa maior a partir do 6º grau (não reimplementa escala). */
export function naturalMinorScale(tonic: string): string[] {
  return rotate(majorScale(relativeMajorOf(tonic)), 5);
}

// ---------------------------------------------------------------------------
// Modos gregorianos (rotações da escala maior)
// ---------------------------------------------------------------------------

export type ModeId =
  | "ionian"
  | "dorian"
  | "phrygian"
  | "lydian"
  | "mixolydian"
  | "aeolian"
  | "locrian";

/** Ordem canônica: grau I ao VII da escala maior. */
export const MODES: ModeId[] = [
  "ionian",
  "dorian",
  "phrygian",
  "lydian",
  "mixolydian",
  "aeolian",
  "locrian",
];

export const MODE_LABELS: Record<ModeId, string> = {
  ionian: "Jônio",
  dorian: "Dórico",
  phrygian: "Frígio",
  lydian: "Lídio",
  mixolydian: "Mixolídio",
  aeolian: "Eólio",
  locrian: "Lócrio",
};

/**
 * Modo a partir de uma tônica qualquer: acha a maior-mãe (transpõe a tônica
 * PARA BAIXO pelo intervalo do grau do modo) e rotaciona — a grafia da mãe
 * garante a grafia do modo (Eb dórico vem de Db maior: Eb F Gb Ab Bb C Db).
 */
export function modeScale(tonic: string, mode: ModeId): string[] {
  const degree = MODES.indexOf(mode);
  const parentTonic = transpose(tonicName(tonic), MAJOR_DEGREE_INTERVALS[degree], "down");
  return rotate(majorScale(parentTonic), degree);
}

/** As 7 rotações da escala maior de uma tônica, indexadas por modo. */
export function modesOfMajor(majorTonic: string): Record<ModeId, string[]> {
  const scale = majorScale(majorTonic);
  return Object.fromEntries(MODES.map((mode, i) => [mode, rotate(scale, i)])) as Record<
    ModeId,
    string[]
  >;
}

// ---------------------------------------------------------------------------
// Pentatônicas e blues (sub-etapa 2.1c) — derivadas por REMOÇÃO de graus da
// escala-mãe já calculada, nunca recálculo de nota
// ---------------------------------------------------------------------------

/** Pentatônica maior: graus 1 2 3 5 6 da escala maior (remove 4º e 7º). */
export function majorPentatonic(tonic: string): string[] {
  const scale = majorScale(tonic);
  return [scale[0], scale[1], scale[2], scale[4], scale[5]];
}

/** Pentatônica menor: graus 1 b3 4 5 b7 da menor natural (remove 2º e b6). */
export function minorPentatonic(tonic: string): string[] {
  const scale = naturalMinorScale(tonic);
  return [scale[0], scale[2], scale[3], scale[4], scale[6]];
}

/**
 * Escala blues: pentatônica menor + blue note entre o 4º e o 5º grau —
 * ordem 1, b3, 4, #4, 5, b7 (6 notas).
 *
 * GRAFIA DA BLUE NOTE: #4 (4ª aumentada da tônica), NÃO b5. Decisão PEDAGÓGICA,
 * não verdade matemática única: #4 é a convenção mais comum em material didático
 * de baixo/guitarra e evita ambiguidade com o 5º grau real, que continua presente
 * na escala. Calculada pelo sistema de intervalos do motor (transpose + interval),
 * mantendo a garantia de grafia por construção: #4 de F = B, de Bb = E — nunca Cb/Fb.
 */
export function bluesScale(tonic: string): string[] {
  const penta = minorPentatonic(tonic);
  const blueNote = transpose(tonicName(tonic), interval("A", 4), "up");
  return [...penta.slice(0, 3), blueNote, ...penta.slice(3)];
}

// ---------------------------------------------------------------------------
// Campo harmônico (tríades diatônicas) — sub-etapa 2.1b
// ---------------------------------------------------------------------------

export type TriadQuality = "major" | "minor" | "diminished" | "augmented";

export const TRIAD_QUALITY_LABELS: Record<TriadQuality, string> = {
  major: "maior",
  minor: "menor",
  diminished: "diminuta",
  augmented: "aumentada",
};

export type KeyMode = "major" | "naturalMinor";

export interface Triad {
  /** Grau da escala, 1..7. */
  degree: number;
  /** [fundamental, terça, quinta] — nomes grafados, tirados DIRETO da escala. */
  notes: [string, string, string];
  quality: TriadQuality;
  /** Cifra: "F", "Gm", "E°", "C+". */
  symbol: string;
  /** Algarismo romano: "IV", "ii", "vii°". */
  roman: string;
}

const TRIAD_SUFFIX: Record<TriadQuality, string> = {
  major: "",
  minor: "m",
  diminished: "°",
  augmented: "+",
};

const ROMAN_NUMERALS = ["I", "II", "III", "IV", "V", "VI", "VII"];

/**
 * Qualidade pelos intervalos REAIS fundamental→terça e fundamental→quinta
 * (via intervalBetween — nada de tabela de qualidades por grau).
 */
function triadQuality(root: string, third: string, fifth: string): TriadQuality {
  const t = intervalBetween(root, third);
  const f = intervalBetween(root, fifth);
  if (t.number === 3 && f.number === 5) {
    if (t.quality === "M" && f.quality === "P") return "major";
    if (t.quality === "m" && f.quality === "P") return "minor";
    if (t.quality === "m" && f.quality === "d") return "diminished";
    if (t.quality === "M" && f.quality === "A") return "augmented";
  }
  throw new Error(`Tríade sem qualidade nomeável: ${root}-${third}-${fifth}`);
}

/**
 * As 7 tríades diatônicas da tonalidade. As notas de cada grau são os elementos
 * 1/3/5 do array da escala JÁ calculada (empilhamento em terças por índice) —
 * a grafia correta da escala se propaga por construção: em F maior o IV é
 * Bb–D–F, nunca A#–D–F nem Bb–D–Gb.
 */
export function diatonicTriads(tonic: string, mode: KeyMode): Triad[] {
  const scale = mode === "major" ? majorScale(tonic) : naturalMinorScale(tonic);
  return scale.map((root, i) => {
    const notes: [string, string, string] = [root, scale[(i + 2) % 7], scale[(i + 4) % 7]];
    const quality = triadQuality(notes[0], notes[1], notes[2]);
    const upper = quality === "major" || quality === "augmented";
    const base = ROMAN_NUMERALS[i];
    const roman = (upper ? base : base.toLowerCase()) + (quality === "augmented" ? "+" : quality === "diminished" ? "°" : "");
    return { degree: i + 1, notes, quality, symbol: root + TRIAD_SUFFIX[quality], roman };
  });
}

// ---------------------------------------------------------------------------
// Central de Conteúdo (Módulo 3.4) — SÓ o tipo; persistência é da sub-etapa 2.4
// ---------------------------------------------------------------------------

export interface ContentEntry {
  id: string;
  topic: string;
  title: string;
  body: string;
  reviewStatus: "nao_revisado" | "confirmado" | "contem_erro";
  /** Observação livre do revisor. */
  note: string;
  /** Data de criação em ISO 8601. */
  createdAt: string;
}
