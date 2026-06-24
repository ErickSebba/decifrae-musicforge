import { describe, it, expect } from "vitest";
import {
  DEFAULT_NOTE_POOL,
  isCorrectAnswer,
  noteToBassTex,
  pickRandomNote,
  soundingOctave,
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