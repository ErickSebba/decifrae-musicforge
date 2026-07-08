import { describe, it, expect } from "vitest";
import {
  CURATED_LEVELS,
  computeSummary,
  deriveUnlockedLevels,
  levelBars,
  levelRepeats,
  levelToPattern,
  levelToTex,
  type ProgressRecord,
} from "./levels";
import { expectedTapTimes, patternDurationMs, splitIntoBars } from "./rhythm-engine";

describe("níveis curados — integridade musical", () => {
  it.each(CURATED_LEVELS.map((lv) => [lv.name, lv] as const))(
    "'%s' tem todos os compassos fechando exatamente a fórmula",
    (_name, level) => {
      // splitIntoBars lança se algum compasso estourar ou ficar incompleto.
      const bars = levelBars(level);
      expect(bars).toHaveLength(level.structure.bars);
    }
  );

  it("há 6 níveis, todos em 4/4 e com threshold válido", () => {
    expect(CURATED_LEVELS).toHaveLength(6);
    for (const lv of CURATED_LEVELS) {
      expect(lv.timeSignature).toEqual({ count: 4, unit: 4 });
      expect(lv.passThreshold).toBeGreaterThan(0);
      expect(lv.passThreshold).toBeLessThanOrEqual(1);
    }
  });
});

describe("levelToPattern — expansão loop vs through", () => {
  it("loop N×M: alvos e duração cobrem todas as repetições", () => {
    const loop = CURATED_LEVELS.find((lv) => lv.structure.type === "loop")!;
    const repeats = levelRepeats(loop);
    expect(repeats).toBeGreaterThan(1);

    const onePass = { tempo: loop.suggestedBpm, events: loop.pattern };
    const expanded = levelToPattern(loop);

    expect(expectedTapTimes(expanded)).toHaveLength(expectedTapTimes(onePass).length * repeats);
    expect(patternDurationMs(expanded)).toBeCloseTo(patternDurationMs(onePass) * repeats, 6);
  });

  it("through: uma passada só (sem duplicação)", () => {
    const through = CURATED_LEVELS.find((lv) => lv.structure.type === "through")!;
    expect(levelRepeats(through)).toBe(1);
    expect(levelToPattern(through).events).toHaveLength(through.pattern.length);
  });

  it("bpm passado sobrescreve o sugerido", () => {
    expect(levelToPattern(CURATED_LEVELS[0], 123).tempo).toBe(123);
    expect(levelToPattern(CURATED_LEVELS[0]).tempo).toBe(CURATED_LEVELS[0].suggestedBpm);
  });
});

describe("computeSummary — aprovação", () => {
  it("na fronteira do threshold passa (>=)", () => {
    // 8 de 10 = 0.8, threshold 0.8 → passa.
    expect(computeSummary({ perfect: 5, good: 3 }, 10, 0.8).passed).toBe(true);
  });

  it("abaixo do threshold reprova", () => {
    expect(computeSummary({ perfect: 5, good: 2 }, 10, 0.8).passed).toBe(false);
  });

  it("ratio é (perfect+good)/totalTargets", () => {
    const s = computeSummary({ perfect: 3, good: 1 }, 8, 0.8);
    expect(s.hits).toBe(4);
    expect(s.ratio).toBeCloseTo(0.5, 6);
  });

  it("sem alvos não passa (ratio 0)", () => {
    expect(computeSummary({ perfect: 0, good: 0 }, 0, 0.8).passed).toBe(false);
  });
});

describe("levelToTex", () => {
  it("emite fórmula de compasso e separadores de compasso", () => {
    const tex = levelToTex(CURATED_LEVELS[1]); // through, 4 compassos
    expect(tex).toContain("\\ts 4 4");
    expect(tex.match(/\|/g)).toHaveLength(3); // 4 compassos → 3 separadores
  });

  it("loop expande os compassos por extenso (sem sinais de repetição)", () => {
    const loop = CURATED_LEVELS[0]; // 2 compassos × 2
    const tex = levelToTex(loop);
    expect(tex.match(/\|/g)).toHaveLength(3); // 4 compassos escritos
    expect(tex).not.toContain("\\ro");
  });

  it("semibreve vira token :1", () => {
    const tex = levelToTex(CURATED_LEVELS[2]); // nível com semibreves
    expect(tex).toContain(":1 c3");
  });
});

describe("deriveUnlockedLevels — desbloqueio linear derivado", () => {
  const ORDER = ["a", "b", "c", "d"];
  const rec = (levelId: string, passed: boolean): ProgressRecord => ({
    levelId,
    bestRatio: passed ? 0.9 : 0.5,
    passed,
    attemptsCount: 1,
    lastAttemptedAt: "2026-07-07T00:00:00.000Z",
  });

  it("sem progresso, só o primeiro nível abre", () => {
    expect(deriveUnlockedLevels(ORDER, [])).toEqual(new Set(["a"]));
  });

  it("passados em sequência abrem o seguinte de cada um", () => {
    const unlocked = deriveUnlockedLevels(ORDER, [rec("a", true), rec("b", true)]);
    expect(unlocked).toEqual(new Set(["a", "b", "c"]));
    expect(unlocked.has("d")).toBe(false);
  });

  it("todos passados → tudo aberto", () => {
    const all = ORDER.map((id) => rec(id, true));
    expect(deriveUnlockedLevels(ORDER, all)).toEqual(new Set(ORDER));
  });

  it("tentativa reprovada (passed=false) não desbloqueia o seguinte", () => {
    expect(deriveUnlockedLevels(ORDER, [rec("a", false)])).toEqual(new Set(["a"]));
  });

  it("ids desconhecidos no progresso são ignorados", () => {
    expect(deriveUnlockedLevels(ORDER, [rec("zzz", true)])).toEqual(new Set(["a"]));
  });

  it("ordem vazia → nada aberto", () => {
    expect(deriveUnlockedLevels([], [rec("a", true)])).toEqual(new Set());
  });
});

describe("splitIntoBars — detecção de compasso quebrado", () => {
  it("lança quando um evento estoura a barra", () => {
    expect(() =>
      splitIntoBars([{ beats: 2 }, { beats: 4 }], { count: 4, unit: 4 })
    ).toThrow(/quebrado/i);
  });

  it("lança quando o último compasso fica incompleto", () => {
    expect(() =>
      splitIntoBars([{ beats: 1 }, { beats: 1 }], { count: 4, unit: 4 })
    ).toThrow(/incompleto/i);
  });
});