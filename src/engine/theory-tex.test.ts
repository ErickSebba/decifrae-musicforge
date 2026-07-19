import { describe, it, expect } from "vitest";
import {
  fretPositionFor,
  phrasePlaybackSchedule,
  phraseToFrettedTex,
  phraseToTex,
  scalePlaybackSchedule,
  scaleToFrettedTex,
  scaleToTex,
  scaleToHighlight,
  type PhraseStep,
} from "./theory-tex";
import { bluesScale, majorScale } from "./theory-engine";
import { noteToMidi } from "./note-utils";
import type { Clef } from "./rhythm-engine";

const BASS = ["E1", "A1", "D2", "G2"];

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

  it("C blues em Fá: blue note f#2 na MESMA oitava do 4º grau (regressão)", () => {
    expect(scaleToTex(bluesScale("C"), "F")).toBe(
      "\\clef F4\n.\n:4 c2 :4 eb2 :4 f2 :4 f#2 :4 g2 :4 bb2"
    );
  });

  it("lança para acidente duplo (grafia teórica fora do alcance da pauta atual)", () => {
    expect(() => scaleToTex(["Bbb", "C"], "F")).toThrow(/duplo/i);
  });

  it("lança para sequência vazia", () => {
    expect(() => scaleToTex([], "F")).toThrow(/vazia/i);
  });
});

describe("scaleToTex — opção tempo (playback, 2.3)", () => {
  it("emite \\tempo antes da clave quando informado (eixo MIDI = clock)", () => {
    expect(scaleToTex(["C", "D"], "F", { tempo: 90 })).toBe(
      "\\tempo 90\n\\clef F4\n.\n:4 c2 :4 d2"
    );
  });

  it("sem tempo, a saída estática da 2.2 permanece idêntica", () => {
    expect(scaleToTex(["C", "D"], "F")).toBe("\\clef F4\n.\n:4 c2 :4 d2");
  });
});

describe("scalePlaybackSchedule (2.3)", () => {
  it("7 notas a 60 BPM: 1ª em t=0, onsets a cada 1000ms, duração 1000, total 7000", () => {
    const s = scalePlaybackSchedule(majorScale("C"), 60);
    expect(s.notes.map((n) => n.timeMs)).toEqual([0, 1000, 2000, 3000, 4000, 5000, 6000]);
    expect(s.notes.every((n) => n.durationMs === 1000)).toBe(true);
    expect(s.totalMs).toBe(7000);
  });

  it("120 BPM: passo de 500ms", () => {
    const s = scalePlaybackSchedule(majorScale("C"), 120);
    expect(s.notes[1].timeMs).toBe(500);
    expect(s.totalMs).toBe(3500);
  });

  it("blues (6 notas) gera 6 eventos, incluindo a blue note", () => {
    const s = scalePlaybackSchedule(bluesScale("C"), 60);
    expect(s.notes).toHaveLength(6);
    expect(s.notes[3].name).toBe("F#");
  });

  it("oitava escrita = MESMA atribuição da pauta (F maior: 2 2 2 2 3 3 3), grafia preservada", () => {
    const s = scalePlaybackSchedule(majorScale("F"), 90);
    expect(s.notes.map((n) => n.writtenOctave)).toEqual([2, 2, 2, 2, 3, 3, 3]);
    expect(s.notes.map((n) => n.name)).toEqual(["F", "G", "A", "Bb", "C", "D", "E"]);
  });
});

describe("phraseToTex (2.5)", () => {
  const phrase: PhraseStep[] = [
    { duration: "seminima", note: "C2" },
    { duration: "pausa-seminima", note: null },
    { duration: "colcheia", note: "D2" },
    { duration: "minima", note: "E2" },
  ];

  it("frase mista em Fá: escrita uma 8ª acima do soante, pausa como r, \\tempo sempre", () => {
    expect(phraseToTex(phrase, "F", 90)).toBe(
      "\\tempo 90\n\\clef F4\n.\n:4 c3 :4 r :8 d3 :2 e3"
    );
  });

  it("em Sol escreve mais uma 8ª acima (mecânica nº 5 — áudio não muda)", () => {
    expect(phraseToTex(phrase, "G", 90)).toBe(
      "\\tempo 90\n\\clef G2\n.\n:4 c4 :4 r :8 d4 :2 e4"
    );
  });

  it("passo de nota ainda sem nota escolhida vira pausa (placeholder honesto)", () => {
    expect(phraseToTex([{ duration: "seminima", note: null }], "F", 90)).toBe(
      "\\tempo 90\n\\clef F4\n.\n:4 r"
    );
  });

  it("frase vazia: só o header (a UI nem monta a pauta nesse caso)", () => {
    expect(phraseToTex([], "F", 90)).toBe("\\tempo 90\n\\clef F4\n.\n");
  });

  it("nome com sustenido do braço entra como veio (decisão da grafia do Fretboard)", () => {
    expect(phraseToTex([{ duration: "seminima", note: "A#1" }], "F", 90)).toBe(
      "\\tempo 90\n\\clef F4\n.\n:4 a#2"
    );
  });
});

describe("phrasePlaybackSchedule (2.5)", () => {
  it("durações heterogêneas a 60 BPM: onsets acumulados, pausa ocupa tempo sem evento", () => {
    const s = phrasePlaybackSchedule(
      [
        { duration: "seminima", note: "C2" },
        { duration: "minima", note: "D2" },
        { duration: "colcheia", note: "E2" },
        { duration: "pausa-seminima", note: null },
        { duration: "seminima", note: "F2" },
      ],
      60
    );
    expect(s.notes.map((n) => n.timeMs)).toEqual([0, 1000, 3000, 4500]);
    expect(s.notes.map((n) => n.durationMs)).toEqual([1000, 2000, 500, 1000]);
    expect(s.notes.map((n) => n.name)).toEqual(["C", "D", "E", "F"]);
    expect(s.notes.map((n) => n.writtenOctave)).toEqual([3, 3, 3, 3]); // soante + 1
    expect(s.totalMs).toBe(5500);
  });

  it("passo incompleto (nota null) avança o tempo sem gerar evento", () => {
    const s = phrasePlaybackSchedule(
      [
        { duration: "seminima", note: null },
        { duration: "seminima", note: "C2" },
      ],
      60
    );
    expect(s.notes).toHaveLength(1);
    expect(s.notes[0].timeMs).toBe(1000);
    expect(s.totalMs).toBe(2000);
  });

  it("frase vazia e só-pausas não geram eventos nem crasham", () => {
    expect(phrasePlaybackSchedule([], 60)).toEqual({ notes: [], totalMs: 0 });
    const rests = phrasePlaybackSchedule(
      [
        { duration: "pausa-seminima", note: null },
        { duration: "pausa-seminima", note: null },
      ],
      60
    );
    expect(rests.notes).toEqual([]);
    expect(rests.totalMs).toBe(2000);
  });
});

describe("fretPositionFor (2.6) — digitação automática v1", () => {
  it("escolhe a corda com a menor casa", () => {
    expect(fretPositionFor(noteToMidi("C2"), BASS)).toEqual({ stringIndex: 1, fret: 3 }); // A1+3
    expect(fretPositionFor(noteToMidi("D2"), BASS)).toEqual({ stringIndex: 2, fret: 0 }); // D solta
    expect(fretPositionFor(noteToMidi("G2"), BASS)).toEqual({ stringIndex: 3, fret: 0 }); // G solta
    expect(fretPositionFor(noteToMidi("E1"), BASS)).toEqual({ stringIndex: 0, fret: 0 });
    expect(fretPositionFor(noteToMidi("A2"), BASS)).toEqual({ stringIndex: 3, fret: 2 }); // G+2, não D+7
  });

  it("altura abaixo da corda mais grave não existe no instrumento", () => {
    expect(fretPositionFor(noteToMidi("C1"), BASS)).toBeNull();
  });
});

describe("scaleToFrettedTex (2.6)", () => {
  it("C maior em Fá (startOctave 3): 1ª posição, \\tuning aguda→grave, \\displaytranspose 12", () => {
    expect(scaleToFrettedTex(majorScale("C"), "F", { tempo: 90, tuning: BASS, startOctave: 3 })).toBe(
      "\\tempo 90\n\\tuning g2 d2 a1 e1\n\\displaytranspose 12\n\\clef F4\n.\n" +
        ":4 3.3 :4 0.2 :4 2.2 :4 3.2 :4 0.1 :4 2.1 :4 4.1"
    );
  });

  it("em Sol só muda a transposição de escrita (+2 8ª) e a clave — posições idênticas", () => {
    expect(scaleToFrettedTex(majorScale("C"), "G", { tempo: 90, tuning: BASS, startOctave: 3 })).toBe(
      "\\tempo 90\n\\tuning g2 d2 a1 e1\n\\displaytranspose 24\n\\clef G2\n.\n" +
        ":4 3.3 :4 0.2 :4 2.2 :4 3.2 :4 0.1 :4 2.1 :4 4.1"
    );
  });

  it("nota soante abaixo da corda mais grave lança erro claro", () => {
    // startOctave 2 → soante C1 < E1
    expect(() => scaleToFrettedTex(majorScale("C"), "F", { tempo: 90, tuning: BASS, startOctave: 2 })).toThrow(
      /alcance/i
    );
  });
});

describe("phraseToFrettedTex (2.6)", () => {
  it("usa a posição EXATA clicada; pausa e pendente viram r", () => {
    const steps: PhraseStep[] = [
      { duration: "seminima", note: "C2", position: { stringIndex: 1, fret: 3 } },
      { duration: "pausa-seminima", note: null },
      { duration: "colcheia", note: "E2", position: { stringIndex: 2, fret: 2 } },
      { duration: "minima", note: null }, // pendente
    ];
    expect(phraseToFrettedTex(steps, "F", 90, BASS)).toBe(
      "\\tempo 90\n\\tuning g2 d2 a1 e1\n\\displaytranspose 12\n\\clef F4\n.\n:4 3.3 :4 r :8 2.2 :2 r"
    );
  });

  it("mesma altura em posições diferentes gera casas diferentes (a tab respeita a escolha)", () => {
    const onG: PhraseStep[] = [{ duration: "seminima", note: "A2", position: { stringIndex: 3, fret: 2 } }];
    const onD: PhraseStep[] = [{ duration: "seminima", note: "A2", position: { stringIndex: 2, fret: 7 } }];
    expect(phraseToFrettedTex(onG, "F", 90, BASS)).toContain(":4 2.1");
    expect(phraseToFrettedTex(onD, "F", 90, BASS)).toContain(":4 7.2");
  });

  it("passo com nota sem posição cai na digitação automática", () => {
    const steps: PhraseStep[] = [{ duration: "seminima", note: "A1" }];
    expect(phraseToFrettedTex(steps, "F", 90, BASS)).toContain(":4 0.3"); // corda A solta
  });
});

describe("consistência pitched × fretted (trava-divergência dos dois geradores)", () => {
  /** MIDIs SOANTES extraídos do tex pitched: nome+oitava do token − transposição da clave. */
  function soundingFromPitched(tex: string, clef: Clef): number[] {
    const shift = clef === "G" ? 24 : 12;
    return [...tex.matchAll(/:\d+ ([a-g][#b]?)(\d)/g)].map(([, name, octave]) => {
      const canonical = name.charAt(0).toUpperCase() + name.slice(1);
      return noteToMidi(`${canonical}${octave}`) - shift;
    });
  }

  /** MIDIs SOANTES extraídos do tex fretted: afinação[corda] + casa. */
  function soundingFromFretted(tex: string, tuning: string[]): number[] {
    return [...tex.matchAll(/:\d+ (\d+)\.(\d)/g)].map(([, fret, texString]) => {
      const stringIndex = tuning.length - Number(texString);
      return noteToMidi(tuning[stringIndex]) + Number(fret);
    });
  }

  it("as 12 tônicas × 2 claves produzem as MESMAS alturas soantes nos dois geradores", () => {
    const tonics = ["C", "G", "D", "A", "E", "B", "F#", "F", "Bb", "Eb", "Ab", "Db"];
    for (const tonic of tonics) {
      for (const clef of ["F", "G"] as Clef[]) {
        const notes = majorScale(tonic);
        const pitched = scaleToTex(notes, clef, { tempo: 90, startOctave: 3 });
        const fretted = scaleToFrettedTex(notes, clef, { tempo: 90, tuning: BASS, startOctave: 3 });
        expect(soundingFromFretted(fretted, BASS), `${tonic} ${clef}`).toEqual(
          soundingFromPitched(pitched, clef)
        );
      }
    }
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
