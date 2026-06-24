import { parseNote, pitchClassName, pitchClassOf } from "./note-utils";

/**
 * Lógica pura do modo "Livre" de identificação de notas (sem React/áudio).
 *
 * IMPORTANTE — transposição do baixo: as notas do pool são as notas ESCRITAS na pauta
 * (oitava científica = oitava do alphaTex). O baixo soa uma oitava abaixo do escrito, então
 * a oitava do áudio é tratada separadamente (`soundingOctave`). Para o treino de LEITURA o
 * que importa é a posição escrita; a resposta é só a classe de altura (letra C–B).
 *
 * Pool inicial: naturais da ~1ª posição em clave de fá, do E2 (1 linha suplementar abaixo)
 * até A3 (linha de cima). Só naturais, para casar com os 7 botões C–B.
 *
 * TODO (sub-etapa futura): tornar faixa de notas e clave (Fá/Sol) configuráveis.
 * TODO (sub-etapa futura): adicionar sustenidos/bemóis ao pool. Isso exige repensar a
 *   interface de resposta — hoje são 7 botões naturais (C–B); com acidentes o usuário
 *   precisa de uma forma de distinguir/responder enarmônicos (ex.: F# vs Gb). Decidir UX
 *   (botões de acidente, teclado de piano, resposta pelo Fretboard, etc.) antes de implementar.
 */
export const DEFAULT_NOTE_POOL = [
  "E2",
  "F2",
  "G2",
  "A2",
  "B2",
  "C3",
  "D3",
  "E3",
  "F3",
  "G3",
  "A3",
];

/** Sorteia uma nota escrita do pool. `rng` injetável para teste determinístico. */
export function pickRandomNote(
  pool: string[] = DEFAULT_NOTE_POOL,
  rng: () => number = Math.random
): string {
  return pool[Math.floor(rng() * pool.length)];
}

/** Resposta correta? Compara por classe de altura (enarmônico-safe), ignorando a oitava. */
export function isCorrectAnswer(writtenNote: string, answerLetter: string): boolean {
  return pitchClassOf(pitchClassName(writtenNote)) === pitchClassOf(answerLetter);
}

/** alphaTex de uma única nota escrita na clave de fá (semínima). */
export function noteToBassTex(writtenNote: string): string {
  const { octave } = parseNote(writtenNote);
  const name = pitchClassName(writtenNote).toLowerCase();
  return `\\clef F4\n.\n:4 ${name}${octave}`;
}

/** Oitava soante para o áudio: o baixo soa uma 8ª abaixo do escrito. */
export function soundingOctave(writtenNote: string): number {
  return parseNote(writtenNote).octave - 1;
}