import { parseNote, pitchClassName, pitchClassOf } from "./note-utils";
import { CLEF_TOKEN, type Clef } from "./rhythm-engine";

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

/**
 * alphaTex de uma única nota escrita (semínima), na clave dada (default fá).
 * Em SOL a escrita sobe uma 8ª (convenção de guitarra — também instrumento transpositor):
 * a nota SOANTE é a mesma, mas cai numa região legível da pauta de sol em vez de ficar
 * 5+ linhas suplementares abaixo. O áudio não muda (deriva da nota do pool, não da escrita).
 */
export function noteToBassTex(writtenNote: string, clef: Clef = "F"): string {
  const { octave } = parseNote(writtenNote);
  const name = pitchClassName(writtenNote).toLowerCase();
  const writtenOctave = clef === "G" ? octave + 1 : octave;
  return `\\clef ${CLEF_TOKEN[clef]}\n.\n:4 ${name}${writtenOctave}`;
}

/** Oitava soante para o áudio: o baixo soa uma 8ª abaixo do escrito. */
export function soundingOctave(writtenNote: string): number {
  return parseNote(writtenNote).octave - 1;
}

// ---------------------------------------------------------------------------
// Modo Cronometrado (1.6a): tempo limite por nota + rodada fixa/contínua.
// Sem persistência (resultado dura a sessão) — tabela de resultados fica pro Módulo 3.
// ---------------------------------------------------------------------------

export type Difficulty = "facil" | "medio" | "dificil";

/**
 * Segundos por nota, por dificuldade. Tabela curada (mais fácil de recalibrar que uma
 * curva): Fácil 8s = iniciante decodificando linha/espaço com calma; Médio 5s = leitura
 * deliberada sem contar linhas do zero; Difícil 3s = beira o reconhecimento imediato
 * (meta didática da leitura à primeira vista).
 */
const TIME_LIMIT_SEC: Record<Difficulty, number> = { facil: 8, medio: 5, dificil: 3 };

export function timeLimitForDifficulty(difficulty: Difficulty): number {
  return TIME_LIMIT_SEC[difficulty];
}

export type RoundFormat = { kind: "fixed"; total: number } | { kind: "continuous" };

export type AnswerOutcome = "correct" | "wrong" | "timeout";

export interface TimedRoundState {
  format: RoundFormat;
  answered: number;
  correct: number;
  /** Resposta errada (leitura) — separado de `timeouts` (velocidade) no resumo. */
  wrong: number;
  timeouts: number;
  streak: number;
  bestStreak: number;
  finished: boolean;
}

export function createTimedRound(format: RoundFormat): TimedRoundState {
  return {
    format,
    answered: 0,
    correct: 0,
    wrong: 0,
    timeouts: 0,
    streak: 0,
    bestStreak: 0,
    finished: false,
  };
}

/**
 * Aplica um resultado à rodada (imutável). `correct` estende o streak; `wrong`/`timeout`
 * zeram (bestStreak preserva o recorde). Término: fixa ao responder a N-ésima nota;
 * contínua em qualquer resultado != correct (parada manual é a UI parar de alimentar o
 * reducer). Em estado `finished` é no-op — guarda contra double-fire da UI.
 */
export function applyOutcome(state: TimedRoundState, outcome: AnswerOutcome): TimedRoundState {
  if (state.finished) return state;

  const streak = outcome === "correct" ? state.streak + 1 : 0;
  const answered = state.answered + 1;
  const finished =
    state.format.kind === "fixed" ? answered >= state.format.total : outcome !== "correct";

  return {
    ...state,
    answered,
    correct: state.correct + (outcome === "correct" ? 1 : 0),
    wrong: state.wrong + (outcome === "wrong" ? 1 : 0),
    timeouts: state.timeouts + (outcome === "timeout" ? 1 : 0),
    streak,
    bestStreak: Math.max(state.bestStreak, streak),
    finished,
  };
}

/** Fração de acertos sobre o respondido (0 se nada respondido). */
export function roundAccuracy(state: TimedRoundState): number {
  return state.answered > 0 ? state.correct / state.answered : 0;
}