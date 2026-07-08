import { describe, it, expect } from "vitest";
import {
  DEFAULT_NOTE_POOL,
  applyOutcome,
  createTimedRound,
  isCorrectAnswer,
  noteToBassTex,
  pickRandomNote,
  roundAccuracy,
  soundingOctave,
  timeLimitForDifficulty,
  type AnswerOutcome,
  type TimedRoundState,
} from "./reading-engine";

describe("isCorrectAnswer", () => {
  it("aceita a letra certa, ignorando a oitava", () => {
    expect(isCorrectAnswer("A2", "A")).toBe(true);
    expect(isCorrectAnswer("C3", "C")).toBe(true);
    expect(isCorrectAnswer("E2", "E")).toBe(true);
  });

  it("rejeita a letra errada", () => {
    expect(isCorrectAnswer("A2", "B")).toBe(false);
    expect(isCorrectAnswer("C3", "D")).toBe(false);
  });
});

describe("pickRandomNote", () => {
  it("sempre retorna uma nota do pool", () => {
    for (let i = 0; i < 50; i++) {
      expect(DEFAULT_NOTE_POOL).toContain(pickRandomNote());
    }
  });

  it("usa o rng injetado para selecionar a posição (determinístico)", () => {
    expect(pickRandomNote(DEFAULT_NOTE_POOL, () => 0)).toBe(DEFAULT_NOTE_POOL[0]);
    expect(pickRandomNote(DEFAULT_NOTE_POOL, () => 0.999)).toBe(
      DEFAULT_NOTE_POOL[DEFAULT_NOTE_POOL.length - 1]
    );
    const pool = ["E2", "F2", "G2"];
    expect(pickRandomNote(pool, () => 0.5)).toBe("F2"); // floor(0.5 * 3) = 1 -> índice 1

  });
});

describe("noteToBassTex", () => {
  it("monta alphaTex em clave de fá com a nota escrita", () => {
    expect(noteToBassTex("G2")).toContain("\\clef F4");
    expect(noteToBassTex("G2")).toContain("g2");
    expect(noteToBassTex("C3")).toContain("c3");
  });
});

describe("soundingOctave", () => {
  it("é uma oitava abaixo do escrito (baixo soa 8ª abaixo)", () => {
    expect(soundingOctave("E2")).toBe(1); // escrito E2 -> soa E1
    expect(soundingOctave("A2")).toBe(1); // escrito A2 -> soa A1
    expect(soundingOctave("C3")).toBe(2); // escrito C3 -> soa C2
  });
});

describe("timeLimitForDifficulty", () => {
  it("valores positivos e estritamente decrescentes de Fácil → Difícil", () => {
    const facil = timeLimitForDifficulty("facil");
    const medio = timeLimitForDifficulty("medio");
    const dificil = timeLimitForDifficulty("dificil");
    expect(dificil).toBeGreaterThan(0);
    expect(facil).toBeGreaterThan(medio);
    expect(medio).toBeGreaterThan(dificil);
  });
});

/** Aplica uma sequência de resultados de uma vez (leitura dos cenários fica linear). */
function play(state: TimedRoundState, outcomes: AnswerOutcome[]): TimedRoundState {
  return outcomes.reduce(applyOutcome, state);
}

describe("rodada fixa — término e contagens", () => {
  it("termina exatamente na N-ésima resposta, não antes", () => {
    const almost = play(createTimedRound({ kind: "fixed", total: 3 }), ["correct", "wrong"]);
    expect(almost.finished).toBe(false);
    const done = applyOutcome(almost, "timeout");
    expect(done.finished).toBe(true);
    expect(done.answered).toBe(3);
  });

  it("conta correct/wrong/timeout separados e calcula a acurácia", () => {
    const s = play(createTimedRound({ kind: "fixed", total: 4 }), [
      "correct",
      "wrong",
      "correct",
      "timeout",
    ]);
    expect(s.correct).toBe(2);
    expect(s.wrong).toBe(1);
    expect(s.timeouts).toBe(1);
    expect(roundAccuracy(s)).toBeCloseTo(0.5, 6);
  });

  it("acurácia sem respostas é 0 (sem divisão por zero)", () => {
    expect(roundAccuracy(createTimedRound({ kind: "fixed", total: 5 }))).toBe(0);
  });
});

describe("streak", () => {
  it("cresce com acertos e zera em erro E em timeout; bestStreak não regride", () => {
    let s = play(createTimedRound({ kind: "fixed", total: 10 }), [
      "correct",
      "correct",
      "correct",
    ]);
    expect(s.streak).toBe(3);
    expect(s.bestStreak).toBe(3);

    s = applyOutcome(s, "wrong");
    expect(s.streak).toBe(0);
    expect(s.bestStreak).toBe(3); // recorde preservado

    s = play(s, ["correct", "timeout"]);
    expect(s.streak).toBe(0); // timeout também zera
    expect(s.bestStreak).toBe(3); // streak de 1 não bate o recorde
  });
});

describe("rodada contínua — término", () => {
  it("não termina enquanto só há acertos", () => {
    const s = play(createTimedRound({ kind: "continuous" }), ["correct", "correct", "correct"]);
    expect(s.finished).toBe(false);
    expect(s.streak).toBe(3);
  });

  it("termina no primeiro erro", () => {
    const s = play(createTimedRound({ kind: "continuous" }), ["correct", "wrong"]);
    expect(s.finished).toBe(true);
    expect(s.bestStreak).toBe(1);
  });

  it("termina no primeiro timeout", () => {
    const s = play(createTimedRound({ kind: "continuous" }), ["correct", "correct", "timeout"]);
    expect(s.finished).toBe(true);
    expect(s.bestStreak).toBe(2);
  });
});

describe("applyOutcome em rodada terminada", () => {
  it("é no-op (guarda contra double-fire da UI)", () => {
    const done = play(createTimedRound({ kind: "continuous" }), ["correct", "wrong"]);
    expect(done.finished).toBe(true);
    expect(applyOutcome(done, "correct")).toEqual(done);
    expect(applyOutcome(done, "timeout")).toEqual(done);
  });
});