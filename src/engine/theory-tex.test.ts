import { describe, it, expect } from "vitest";
import { scaleToTex, scaleToHighlight } from "./theory-tex";
import { majorScale } from "./theory-engine";

describe("scaleToTex", () => {
  it("Dó maior em clave de Fá: semínimas a partir de c2, sem virada de oitava", () => {
    expect(scaleToTex(majorScale("C"), "F")).toBe(
      "\\clef F4\n.\n:4 c2 :4 d2 :4 e2 :4 f2 :4 g2 :4 a2 :4 b2"
    );
  });

  it("Fá maior em clave de Fá: bb2 (grafia do motor preservada) e virada de oitava em c3", () => {
    expect(scaleToTex(majorScale("F"), "F")).toBe(
      "\\clef F4\n.\n:4 f2 :4 g2 :4 a2 :4 bb2 :4 c3 :4 d3 :4 e3"
    );
  });

  it("clave de Sol escreve uma 8ª acima (convenção do noteToBassTex)", () => {
    expect(scaleToTex(majorScale("C"), "G")).toBe(
      "\\clef G2\n.\n:4 c3 :4 d3 :4 e3 :4 f3 :4 g3 :4 a3 :4 b3"
    );
    expect(scaleToTex(majorScale("F"), "G")).toBe(
      "\\clef G2\n.\n:4 f3 :4 g3 :4 a3 :4 bb3 :4 c4 :4 d4 :4 e4"
    );
  });

  it("duration e startOctave são configuráveis", () => {
    expect(scaleToTex(["C", "D"], "F", { duration: 2, startOctave: 3 })).toBe(
      "\\clef F4\n.\n:2 c3 :2 d3"
    );
  });

  it("letra anterior vira oitava; letra repetida (blue note) NÃO vira", () => {
    expect(scaleToTex(["B", "C"], "F")).toBe("\\clef F4\n.\n:4 b2 :4 c3");
    expect(scaleToTex(["F", "F#"], "F")).toBe("\\clef F4\n.\n:4 f2 :4 f#2");
  });

  it("lança para acidente duplo (grafia teórica fora do alcance da pauta atual)", () => {
    expect(() => scaleToTex(["Bbb", "C"], "F")).toThrow(/duplo/i);
  });

  it("lança para sequência vazia", () => {
    expect(() => scaleToTex([], "F")).toThrow(/vazia/i);
  });
});

describe("scaleToHighlight", () => {
  it("preserva a grafia do motor para acidentes simples", () => {
    expect(scaleToHighlight(majorScale("F"))).toEqual(["F", "G", "A", "Bb", "C", "D", "E"]);
    expect(scaleToHighlight(majorScale("D"))).toEqual(["D", "E", "F#", "G", "A", "B", "C#"]);
  });

  it("degrada acidente duplo enarmonicamente (highlight é por pitch class)", () => {
    expect(scaleToHighlight(["F##"])).toEqual(["G"]);
    expect(scaleToHighlight(["Bbb"])).toEqual(["A"]);
  });
});
