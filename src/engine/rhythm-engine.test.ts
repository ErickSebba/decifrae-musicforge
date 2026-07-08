import { describe, it, expect } from "vitest";
import {
  classifyTap,
  dictationSchedule,
  expectedTapTimes,
  metronomeClickTimes,
  patternDurationMs,
  patternToTex,
  type RhythmPattern,
} from "./rhythm-engine";

const FOUR_QUARTERS: RhythmPattern = {
  tempo: 60, // 1000 ms/batida
  events: [{ beats: 1 }, { beats: 1 }, { beats: 1 }, { beats: 1 }],
};

describe("dictationSchedule", () => {
  it("lead-in gera N pulsos antes do zero do padrão e desloca notas e grade", () => {
    const s = dictationSchedule(FOUR_QUARTERS, 4); // 60 BPM → 1000 ms/batida
    // 4 pulsos de lead-in + 4 da grade do padrão, deslocados 4000 ms.
    expect(s.pulseTimesMs).toEqual([0, 1000, 2000, 3000, 4000, 5000, 6000, 7000]);
    expect(s.noteTimesMs).toEqual([4000, 5000, 6000, 7000]);
    expect(s.totalMs).toBe(8000);
  });

  it("pausas não geram nota (mas o pulso de fundo continua)", () => {
    const withRest: RhythmPattern = {
      tempo: 60,
      events: [{ beats: 1 }, { beats: 1, rest: true }, { beats: 1 }],
    };
    const s = dictationSchedule(withRest, 3);
    expect(s.noteTimesMs).toEqual([3000, 5000]); // 2ª batida do padrão é pausa
    expect(s.pulseTimesMs).toHaveLength(3 + 3); // lead-in + grade
  });

  it("leadInBeats = 0 degenera pros tempos originais do padrão", () => {
    const s = dictationSchedule(FOUR_QUARTERS, 0);
    expect(s.noteTimesMs).toEqual(expectedTapTimes(FOUR_QUARTERS));
    expect(s.pulseTimesMs).toEqual(metronomeClickTimes(FOUR_QUARTERS));
    expect(s.totalMs).toBe(patternDurationMs(FOUR_QUARTERS));
  });
});

describe("expectedTapTimes", () => {
  it("60 BPM, 4 semínimas → [0, 1000, 2000, 3000]", () => {
    expect(expectedTapTimes(FOUR_QUARTERS)).toEqual([0, 1000, 2000, 3000]);
  });

  it("pausa ocupa tempo mas não gera alvo", () => {
    const withRest: RhythmPattern = {
      tempo: 60,
      events: [{ beats: 1 }, { beats: 1, rest: true }, { beats: 1 }],
    };
    expect(expectedTapTimes(withRest)).toEqual([0, 2000]);
  });
});

describe("metronomeClickTimes", () => {
  it("um clique por batida", () => {
    expect(metronomeClickTimes(FOUR_QUARTERS)).toEqual([0, 1000, 2000, 3000]);
  });
});

describe("patternDurationMs", () => {
  it("soma das durações × ms por batida", () => {
    expect(patternDurationMs(FOUR_QUARTERS)).toBe(4000);
  });
});

describe("classifyTap", () => {
  const targets = [0, 1000, 2000, 3000];

  it("dentro de perfectMs → perfect", () => {
    expect(classifyTap(1030, targets).result).toBe("perfect");
  });

  it("entre perfectMs e goodMs → good", () => {
    expect(classifyTap(1100, targets).result).toBe("good");
  });

  it("fora de goodMs → miss (index -1)", () => {
    const r = classifyTap(1500, targets);
    expect(r.result).toBe("miss");
    expect(r.index).toBe(-1);
  });

  it("não casa um alvo já consumido", () => {
    const consumed = new Set<number>([1]);
    // 1000 está consumido; o mais próximo livre é 0 ou 2000 (1000 de distância) → miss.
    expect(classifyTap(1000, targets, undefined, consumed).result).toBe("miss");
  });

  it("retorna o index do alvo casado para consumo", () => {
    expect(classifyTap(2010, targets).index).toBe(2);
  });
});

describe("patternToTex", () => {
  it("contém o tempo, a clave de fá e uma nota por evento", () => {
    const tex = patternToTex(FOUR_QUARTERS);
    expect(tex).toContain("\\tempo 60");
    expect(tex).toContain("\\clef F4");
    expect(tex.match(/c3/g)).toHaveLength(4);
  });

  it("renderiza pausa como 'r'", () => {
    const tex = patternToTex({ tempo: 60, events: [{ beats: 1, rest: true }] });
    expect(tex).toContain(":4 r");
  });
});