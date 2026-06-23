import { describe, it, expect } from "vitest";
import {
  noteAtFret,
  noteToMidi,
  midiToNoteName,
  pitchClassOf,
  pitchClassName,
} from "./note-utils";

describe("noteAtFret", () => {
  it("corda solta (traste 0) é a própria nota da corda", () => {
    expect(noteAtFret("A1", 0)).toBe("A1");
    expect(noteAtFret("E1", 0)).toBe("E1");
    expect(noteAtFret("D2", 0)).toBe("D2");
  });

  it("calcula notas trastadas em casos conhecidos do baixo", () => {
    expect(noteAtFret("E1", 5)).toBe("A1"); // 5ª casa da corda E = A
    expect(noteAtFret("E1", 12)).toBe("E2"); // oitava
    expect(noteAtFret("G2", 2)).toBe("A2");
    expect(noteAtFret("A1", 3)).toBe("C2");
  });
});

describe("noteToMidi / midiToNoteName", () => {
  it("A4 = 69", () => {
    expect(noteToMidi("A4")).toBe(69);
    expect(midiToNoteName(69)).toBe("A4");
  });

  it("ida e volta preserva a nota (com sustenido)", () => {
    for (const note of ["E1", "A1", "D2", "G2", "C#3", "F4"]) {
      expect(midiToNoteName(noteToMidi(note))).toBe(note);
    }
  });
});

describe("pitchClassOf — enarmônicos", () => {
  it("trata sustenido e bemol como a mesma classe de altura", () => {
    expect(pitchClassOf("F#")).toBe(pitchClassOf("Gb"));
    expect(pitchClassOf("C#")).toBe(pitchClassOf("Db"));
    expect(pitchClassOf("A#")).toBe(pitchClassOf("Bb"));
  });

  it("lança erro para nome inválido", () => {
    expect(() => pitchClassOf("H")).toThrow();
  });
});

describe("pitchClassName", () => {
  it("remove a oitava", () => {
    expect(pitchClassName("A#2")).toBe("A#");
    expect(pitchClassName("E1")).toBe("E");
  });
});