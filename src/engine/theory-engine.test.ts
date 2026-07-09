import { describe, it, expect } from "vitest";
import {
  bluesScale,
  diatonicTriads,
  majorPentatonic,
  minorPentatonic,
  spell,
  spelledName,
  spelledPitchClass,
  interval,
  intervalBetween,
  transpose,
  majorScale,
  naturalMinorScale,
  relativeMinorOf,
  relativeMajorOf,
  modeScale,
  modesOfMajor,
  MODES,
  MODE_LABELS,
  INTERVAL_LABELS,
} from "./theory-engine";

describe("spell / spelledName", () => {
  it("ida e volta com acidentes simples e duplos", () => {
    for (const name of ["C", "Eb", "F#", "F##", "Bbb", "Cb", "B#"]) {
      expect(spelledName(spell(name))).toBe(name);
    }
  });

  it("ignora a oitava e normaliza acidente unicode", () => {
    expect(spell("Bb3")).toEqual({ letter: "B", accidental: -1 });
    expect(spell("F♯")).toEqual({ letter: "F", accidental: 1 });
  });

  it("lança para nomes inválidos", () => {
    expect(() => spell("H")).toThrow();
    expect(() => spell("C###")).toThrow();
    expect(() => spell("")).toThrow();
  });

  it("spelledName lança para acidente fora de bb..##", () => {
    expect(() => spelledName({ letter: "C", accidental: 3 })).toThrow();
  });
});

describe("spelledPitchClass", () => {
  it("letra + acidente por aritmética, coerente com note-utils", () => {
    expect(spelledPitchClass(spell("C"))).toBe(0);
    expect(spelledPitchClass(spell("Bb"))).toBe(10);
    expect(spelledPitchClass(spell("F##"))).toBe(7); // enarmônico de G
    expect(spelledPitchClass(spell("Bbb"))).toBe(9); // enarmônico de A
    expect(spelledPitchClass(spell("Cb"))).toBe(11);
  });
});

describe("interval (construtor)", () => {
  it("tabela base de semitons", () => {
    expect(interval("P", 1).semitones).toBe(0);
    expect(interval("M", 2).semitones).toBe(2);
    expect(interval("m", 3).semitones).toBe(3);
    expect(interval("P", 4).semitones).toBe(5);
    expect(interval("A", 4).semitones).toBe(6);
    expect(interval("d", 5).semitones).toBe(6);
    expect(interval("P", 5).semitones).toBe(7);
    expect(interval("m", 6).semitones).toBe(8);
    expect(interval("M", 7).semitones).toBe(11);
    expect(interval("P", 8).semitones).toBe(12);
  });

  it("lança para combinações inexistentes", () => {
    expect(() => interval("P", 3)).toThrow(); // justo só em 1/4/5/8
    expect(() => interval("M", 5)).toThrow(); // maior/menor só em 2/3/6/7
    expect(() => interval("m", 4)).toThrow();
    expect(() => interval("M", 9)).toThrow(); // composto fora de escopo
    expect(() => interval("M", 0)).toThrow();
  });
});

describe("INTERVAL_LABELS / MODE_LABELS (PT-BR)", () => {
  it("rotula intervalos comuns", () => {
    expect(INTERVAL_LABELS["M3"]).toBe("3ª maior");
    expect(INTERVAL_LABELS["m3"]).toBe("3ª menor");
    expect(INTERVAL_LABELS["P5"]).toBe("5ª justa");
    expect(INTERVAL_LABELS["A4"]).toBe("4ª aumentada");
    expect(INTERVAL_LABELS["d5"]).toBe("5ª diminuta");
    expect(INTERVAL_LABELS["P1"]).toBe("1ª justa (uníssono)");
    expect(INTERVAL_LABELS["P8"]).toBe("8ª justa (oitava)");
  });

  it("rotula os 7 modos na ordem jônio → lócrio", () => {
    expect(MODES.map((m) => MODE_LABELS[m])).toEqual([
      "Jônio",
      "Dórico",
      "Frígio",
      "Lídio",
      "Mixolídio",
      "Eólio",
      "Lócrio",
    ]);
  });
});

describe("intervalBetween (nota → nota, ascendente)", () => {
  it("casos básicos sem oitava", () => {
    expect(intervalBetween("C", "E")).toMatchObject({ quality: "M", number: 3, semitones: 4 });
    expect(intervalBetween("C", "Eb")).toMatchObject({ quality: "m", number: 3, semitones: 3 });
    expect(intervalBetween("B", "C")).toMatchObject({ quality: "m", number: 2, semitones: 1 });
    expect(intervalBetween("C", "B")).toMatchObject({ quality: "M", number: 7, semitones: 11 });
    expect(intervalBetween("F", "Bb")).toMatchObject({ quality: "P", number: 4, semitones: 5 });
  });

  it("grafia distingue enarmônicos: C→F# = 4ª aum., C→Gb = 5ª dim. (mesmos 6 semitons)", () => {
    expect(intervalBetween("C", "F#")).toMatchObject({ quality: "A", number: 4, semitones: 6 });
    expect(intervalBetween("C", "Gb")).toMatchObject({ quality: "d", number: 5, semitones: 6 });
  });

  it("uníssono e uníssono alterado", () => {
    expect(intervalBetween("C", "C")).toMatchObject({ quality: "P", number: 1, semitones: 0 });
    expect(intervalBetween("C", "C#")).toMatchObject({ quality: "A", number: 1, semitones: 1 });
  });

  it("com oitavas usa a distância real", () => {
    expect(intervalBetween("C3", "G3")).toMatchObject({ quality: "P", number: 5, semitones: 7 });
    expect(intervalBetween("C3", "C4")).toMatchObject({ quality: "P", number: 8, semitones: 12 });
    expect(intervalBetween("A2", "F#3")).toMatchObject({ quality: "M", number: 6, semitones: 9 });
  });

  it("com oitavas: descendente, composto e mistura com/sem oitava lançam", () => {
    expect(() => intervalBetween("G3", "C3")).toThrow(/descendente/i);
    expect(() => intervalBetween("C3", "E4")).toThrow(/composto/i);
    expect(() => intervalBetween("C3", "E")).toThrow();
  });
});

describe("transpose (nota + intervalo → nota)", () => {
  it("a letra vem da distância de letras — grafia correta por construção", () => {
    expect(transpose("C", interval("M", 3))).toBe("E");
    expect(transpose("F", interval("P", 4))).toBe("Bb"); // nunca A#
    expect(transpose("D", interval("m", 3))).toBe("F");
    expect(transpose("B", interval("m", 2))).toBe("C");
    expect(transpose("Gb", interval("A", 4))).toBe("C");
  });

  it("desce com a mesma lógica", () => {
    expect(transpose("C", interval("M", 2), "down")).toBe("Bb");
    expect(transpose("F#", interval("P", 5), "down")).toBe("B");
    expect(transpose("Eb", interval("M", 2), "down")).toBe("Db");
  });

  it("preserva a oitava do input, inclusive na virada em C", () => {
    expect(transpose("C3", interval("P", 5))).toBe("G3");
    expect(transpose("C3", interval("M", 2), "down")).toBe("Bb2");
    expect(transpose("B3", interval("m", 2))).toBe("C4");
    expect(transpose("A2", interval("P", 8))).toBe("A3");
  });

  it("ida e volta é identidade", () => {
    const cases: Array<[string, Parameters<typeof interval>]> = [
      ["C", ["M", 3]],
      ["F#", ["P", 5]],
      ["Bb2", ["M", 6]],
      ["Eb", ["A", 4]],
    ];
    for (const [note, [q, n]] of cases) {
      const itv = interval(q, n);
      expect(transpose(transpose(note, itv, "up"), itv, "down")).toBe(note);
    }
  });

  it("lança quando a grafia exigiria acidente além de bb/##", () => {
    expect(() => transpose("G##", interval("A", 1))).toThrow(/bb\/##/);
  });
});

describe("majorScale — as 12 tônicas contra a grafia de armadura conhecida", () => {
  const expected: Record<string, string[]> = {
    // sustenidos (0 a 6 na armadura)
    C: ["C", "D", "E", "F", "G", "A", "B"],
    G: ["G", "A", "B", "C", "D", "E", "F#"],
    D: ["D", "E", "F#", "G", "A", "B", "C#"],
    A: ["A", "B", "C#", "D", "E", "F#", "G#"],
    E: ["E", "F#", "G#", "A", "B", "C#", "D#"],
    B: ["B", "C#", "D#", "E", "F#", "G#", "A#"],
    "F#": ["F#", "G#", "A#", "B", "C#", "D#", "E#"],
    // bemóis (1 a 5 na armadura)
    F: ["F", "G", "A", "Bb", "C", "D", "E"],
    Bb: ["Bb", "C", "D", "Eb", "F", "G", "A"],
    Eb: ["Eb", "F", "G", "Ab", "Bb", "C", "D"],
    Ab: ["Ab", "Bb", "C", "Db", "Eb", "F", "G"],
    Db: ["Db", "Eb", "F", "Gb", "Ab", "Bb", "C"],
  };

  for (const [tonic, notes] of Object.entries(expected)) {
    it(`${tonic} maior = ${notes.join(" ")}`, () => {
      expect(majorScale(tonic)).toEqual(notes);
    });
  }

  it("Gb maior (enarmônica de F#) grafa com bemóis, seguindo a tônica pedida", () => {
    expect(majorScale("Gb")).toEqual(["Gb", "Ab", "Bb", "Cb", "Db", "Eb", "F"]);
  });

  it("ignora a oitava da tônica", () => {
    expect(majorScale("F2")).toEqual(majorScale("F"));
  });
});

describe("menor natural e relativas", () => {
  it("relativa menor = 6º grau da maior", () => {
    expect(relativeMinorOf("C")).toBe("A");
    expect(relativeMinorOf("G")).toBe("E");
    expect(relativeMinorOf("Eb")).toBe("C");
    expect(relativeMinorOf("F#")).toBe("D#");
  });

  it("relativa maior é o inverso (3ª menor acima)", () => {
    expect(relativeMajorOf("A")).toBe("C");
    expect(relativeMajorOf("E")).toBe("G");
    expect(relativeMajorOf("C")).toBe("Eb");
    expect(relativeMajorOf("D#")).toBe("F#");
  });

  it("menor natural = rotação da relativa maior a partir do 6º grau", () => {
    expect(naturalMinorScale("A")).toEqual(["A", "B", "C", "D", "E", "F", "G"]);
    expect(naturalMinorScale("C")).toEqual(["C", "D", "Eb", "F", "G", "Ab", "Bb"]);
    expect(naturalMinorScale("F#")).toEqual(["F#", "G#", "A", "B", "C#", "D", "E"]);
  });

  it("1ª nota da menor natural é sempre a própria tônica grafada", () => {
    for (const tonic of ["A", "C", "F#", "Bb", "G#"]) {
      expect(naturalMinorScale(tonic)[0]).toBe(tonic);
    }
  });
});

describe("modos gregorianos", () => {
  it("modesOfMajor(C) = as 7 rotações clássicas das notas naturais", () => {
    const modes = modesOfMajor("C");
    expect(modes.ionian).toEqual(["C", "D", "E", "F", "G", "A", "B"]);
    expect(modes.dorian).toEqual(["D", "E", "F", "G", "A", "B", "C"]);
    expect(modes.phrygian).toEqual(["E", "F", "G", "A", "B", "C", "D"]);
    expect(modes.lydian).toEqual(["F", "G", "A", "B", "C", "D", "E"]);
    expect(modes.mixolydian).toEqual(["G", "A", "B", "C", "D", "E", "F"]);
    expect(modes.aeolian).toEqual(["A", "B", "C", "D", "E", "F", "G"]);
    expect(modes.locrian).toEqual(["B", "C", "D", "E", "F", "G", "A"]);
  });

  it("os 7 modos com tônica fixa D — grafia da maior-mãe de cada um", () => {
    expect(modeScale("D", "ionian")).toEqual(["D", "E", "F#", "G", "A", "B", "C#"]);
    expect(modeScale("D", "dorian")).toEqual(["D", "E", "F", "G", "A", "B", "C"]); // mãe C
    expect(modeScale("D", "phrygian")).toEqual(["D", "Eb", "F", "G", "A", "Bb", "C"]); // mãe Bb
    expect(modeScale("D", "lydian")).toEqual(["D", "E", "F#", "G#", "A", "B", "C#"]); // mãe A
    expect(modeScale("D", "mixolydian")).toEqual(["D", "E", "F#", "G", "A", "B", "C"]); // mãe G
    expect(modeScale("D", "aeolian")).toEqual(["D", "E", "F", "G", "A", "Bb", "C"]); // mãe F
    expect(modeScale("D", "locrian")).toEqual(["D", "Eb", "F", "G", "Ab", "Bb", "C"]); // mãe Eb
  });

  it("tônica com bemol: Eb dórico vem de Db maior", () => {
    expect(modeScale("Eb", "dorian")).toEqual(["Eb", "F", "Gb", "Ab", "Bb", "C", "Db"]);
  });

  it("eólio coincide com a menor natural e jônio com a maior", () => {
    for (const tonic of ["C", "D", "F#", "Bb"]) {
      expect(modeScale(tonic, "aeolian")).toEqual(naturalMinorScale(tonic));
      expect(modeScale(tonic, "ionian")).toEqual(majorScale(tonic));
    }
  });

  it("1ª nota do modo é sempre a própria tônica grafada", () => {
    for (const mode of MODES) {
      expect(modeScale("A", mode)[0]).toBe("A");
      expect(modeScale("Bb", mode)[0]).toBe("Bb");
    }
  });
});

describe("diatonicTriads — campo harmônico maior", () => {
  it("C maior: notas, cifra e romano grau a grau (vii° = B°)", () => {
    expect(diatonicTriads("C", "major")).toEqual([
      { degree: 1, notes: ["C", "E", "G"], quality: "major", symbol: "C", roman: "I" },
      { degree: 2, notes: ["D", "F", "A"], quality: "minor", symbol: "Dm", roman: "ii" },
      { degree: 3, notes: ["E", "G", "B"], quality: "minor", symbol: "Em", roman: "iii" },
      { degree: 4, notes: ["F", "A", "C"], quality: "major", symbol: "F", roman: "IV" },
      { degree: 5, notes: ["G", "B", "D"], quality: "major", symbol: "G", roman: "V" },
      { degree: 6, notes: ["A", "C", "E"], quality: "minor", symbol: "Am", roman: "vi" },
      { degree: 7, notes: ["B", "D", "F"], quality: "diminished", symbol: "B°", roman: "vii°" },
    ]);
  });

  it("F maior: IV = Bb–D–F (grafia herdada da escala, nunca A# ou Gb)", () => {
    const triads = diatonicTriads("F", "major");
    expect(triads[3]).toEqual({
      degree: 4,
      notes: ["Bb", "D", "F"],
      quality: "major",
      symbol: "Bb",
      roman: "IV",
    });
    expect(triads.map((t) => t.symbol)).toEqual(["F", "Gm", "Am", "Bb", "C", "Dm", "E°"]);
  });

  it("D maior (tônica com sustenidos): cifras e vii° = C#°", () => {
    const triads = diatonicTriads("D", "major");
    expect(triads.map((t) => t.symbol)).toEqual(["D", "Em", "F#m", "G", "A", "Bm", "C#°"]);
    expect(triads[6].notes).toEqual(["C#", "E", "G"]);
    expect(triads[6].roman).toBe("vii°");
  });
});

describe("diatonicTriads — campo harmônico menor natural", () => {
  it("Lá menor: cifras e romanos, com ii° e VII", () => {
    const triads = diatonicTriads("A", "naturalMinor");
    expect(triads.map((t) => t.symbol)).toEqual(["Am", "B°", "C", "Dm", "Em", "F", "G"]);
    expect(triads.map((t) => t.roman)).toEqual(["i", "ii°", "III", "iv", "v", "VI", "VII"]);
    expect(triads[1].notes).toEqual(["B", "D", "F"]);
    expect(triads[6].notes).toEqual(["G", "B", "D"]);
  });

  it("Dó menor: grafia bemol vinda da escala (Eb, Ab, Bb)", () => {
    const triads = diatonicTriads("C", "naturalMinor");
    expect(triads.map((t) => t.symbol)).toEqual(["Cm", "D°", "Eb", "Fm", "Gm", "Ab", "Bb"]);
    expect(triads[2].notes).toEqual(["Eb", "G", "Bb"]);
    expect(triads[5].notes).toEqual(["Ab", "C", "Eb"]);
  });

  it("Fá# menor (tônica acidentada)", () => {
    const triads = diatonicTriads("F#", "naturalMinor");
    expect(triads.map((t) => t.symbol)).toEqual(["F#m", "G#°", "A", "Bm", "C#m", "D", "E"]);
  });
});

describe("diatonicTriads — invariantes sobre as 12 tônicas", () => {
  const tonics = ["C", "G", "D", "A", "E", "B", "F#", "F", "Bb", "Eb", "Ab", "Db"];

  it("padrão de qualidades derivado por intervalos: maior [M m m M M m dim]", () => {
    for (const tonic of tonics) {
      expect(diatonicTriads(tonic, "major").map((t) => t.quality)).toEqual([
        "major", "minor", "minor", "major", "major", "minor", "diminished",
      ]);
    }
  });

  it("padrão de qualidades do menor natural [m dim M m m M M]", () => {
    for (const tonic of tonics) {
      expect(diatonicTriads(tonic, "naturalMinor").map((t) => t.quality)).toEqual([
        "minor", "diminished", "major", "minor", "minor", "major", "major",
      ]);
    }
  });

  it("notas da tríade são IDÊNTICAS aos graus 1/3/5 do array da escala (não só enarmônicas)", () => {
    for (const tonic of tonics) {
      const scale = majorScale(tonic);
      diatonicTriads(tonic, "major").forEach((triad, i) => {
        expect(triad.notes).toEqual([scale[i], scale[(i + 2) % 7], scale[(i + 4) % 7]]);
        expect(triad.notes[0]).toBe(scale[i]);
        expect(triad.degree).toBe(i + 1);
      });
    }
  });

  it("tônica inválida propaga erro", () => {
    expect(() => diatonicTriads("H", "major")).toThrow();
  });
});

describe("majorPentatonic / minorPentatonic — remoção de graus da escala-mãe", () => {
  it("pentatônica maior de C, F e D (graus 1 2 3 5 6)", () => {
    expect(majorPentatonic("C")).toEqual(["C", "D", "E", "G", "A"]);
    expect(majorPentatonic("F")).toEqual(["F", "G", "A", "C", "D"]);
    expect(majorPentatonic("D")).toEqual(["D", "E", "F#", "A", "B"]);
  });

  it("pentatônica menor de C, F e D (graus 1 b3 4 5 b7)", () => {
    expect(minorPentatonic("C")).toEqual(["C", "Eb", "F", "G", "Bb"]);
    expect(minorPentatonic("F")).toEqual(["F", "Ab", "Bb", "C", "Eb"]);
    expect(minorPentatonic("D")).toEqual(["D", "F", "G", "A", "C"]);
  });

  it("notas são IDÊNTICAS aos graus da escala-mãe (reuso, não recálculo)", () => {
    for (const tonic of ["C", "F", "D", "F#", "Bb", "Eb"]) {
      const major = majorScale(tonic);
      expect(majorPentatonic(tonic)).toEqual([major[0], major[1], major[2], major[4], major[5]]);
      const minor = naturalMinorScale(tonic);
      expect(minorPentatonic(tonic)).toEqual([minor[0], minor[2], minor[3], minor[4], minor[6]]);
    }
  });
});

describe("bluesScale — pentatônica menor + blue note #4", () => {
  it("blues de C, F e Bb: 6 notas na ordem 1 b3 4 #4 5 b7", () => {
    expect(bluesScale("C")).toEqual(["C", "Eb", "F", "F#", "G", "Bb"]);
    expect(bluesScale("F")).toEqual(["F", "Ab", "Bb", "B", "C", "Eb"]);
    expect(bluesScale("Bb")).toEqual(["Bb", "Db", "Eb", "E", "F", "Ab"]);
  });

  it("blue note no índice 3, grafada como #4 — NUNCA como b5", () => {
    expect(bluesScale("C")[3]).toBe("F#");
    expect(bluesScale("C")).not.toContain("Gb"); // b5 de C
    expect(bluesScale("F")[3]).toBe("B");
    expect(bluesScale("F")).not.toContain("Cb"); // b5 de F
    expect(bluesScale("Bb")[3]).toBe("E");
    expect(bluesScale("Bb")).not.toContain("Fb"); // b5 de Bb
  });

  it("fora da blue note, blues é exatamente a pentatônica menor", () => {
    for (const tonic of ["C", "F", "Bb", "A", "E"]) {
      const blues = bluesScale(tonic);
      expect(blues).toHaveLength(6);
      expect([...blues.slice(0, 3), ...blues.slice(4)]).toEqual(minorPentatonic(tonic));
    }
  });
});
