/**
 * Utilitários puros de teoria de notas (sem Web Audio), reutilizados pela engine de áudio
 * e pelo Fretboard. Temperamento igual de 12 tons, MIDI com A4 = 69.
 */

/** Classes de altura (semitons a partir de C). Aceita naturais, sustenidos e bemóis. */
const PITCH_CLASS: Record<string, number> = {
  C: 0,
  "C#": 1,
  Db: 1,
  D: 2,
  "D#": 3,
  Eb: 3,
  E: 4,
  Fb: 4,
  "E#": 5,
  F: 5,
  "F#": 6,
  Gb: 6,
  G: 7,
  "G#": 8,
  Ab: 8,
  A: 9,
  "A#": 10,
  Bb: 10,
  B: 11,
  Cb: 11,
  "B#": 0,
};

/** Nomes ascendentes com sustenido, usados ao converter MIDI -> nome. */
const SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

/** Normaliza acidentes unicode (♯/♭) para ASCII (#/b). */
function normalizeAccidentals(name: string): string {
  return name.replace("♯", "#").replace("♭", "b");
}

/** Classe de altura (0–11) de um nome sem oitava, ex.: "F#" e "Gb" -> 6. */
export function pitchClassOf(name: string): number {
  const normalized = normalizeAccidentals(name);
  const key = normalized.charAt(0).toUpperCase() + normalized.slice(1);
  const pc = PITCH_CLASS[key];
  if (pc === undefined) {
    throw new Error(`Nota inválida: "${name}"`);
  }
  return pc;
}

/** Separa um nome com oitava (ex.: "E1", "F#2", "Gb2") em classe de altura + oitava. */
export function parseNote(note: string): { pitchClass: number; octave: number } {
  const match = normalizeAccidentals(note).match(/^([A-Ga-g][#b]?)(-?\d+)$/);
  if (!match) {
    throw new Error(`Nota inválida: "${note}"`);
  }
  return { pitchClass: pitchClassOf(match[1]), octave: parseInt(match[2], 10) };
}

/** Número MIDI de um nome com oitava. A4 ("A4") = 69. */
export function noteToMidi(note: string): number {
  const { pitchClass, octave } = parseNote(note);
  return 12 * (octave + 1) + pitchClass;
}

/** Nome (com sustenido) + oitava a partir de um número MIDI. */
export function midiToNoteName(midi: number): string {
  const pc = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  return SHARP_NAMES[pc] + octave;
}

/** Nome da nota numa posição do braço: corda solta + nº de traste (corda solta = traste 0). */
export function noteAtFret(openString: string, fret: number): string {
  return midiToNoteName(noteToMidi(openString) + fret);
}

/** Remove a oitava de um nome de nota para exibição/comparação, ex.: "A#2" -> "A#". */
export function pitchClassName(note: string): string {
  return note.replace(/-?\d+$/, "");
}