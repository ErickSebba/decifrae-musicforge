import { describe, it, expect } from "vitest";
import {
  CURATED_LEVELS,
  computeSummary,
  deriveUnlockedLevels,
  levelRepeats,
  levelToPattern,
  levelToTex,
  type ProgressRecord,
} from "./levels";
import {
  expectedTapTimes,
  patternDurationMs,
  splitIntoBars,
  type RhythmEvent,
} from "./rhythm-engine";

// Atalhos para passadas LITERAIS: as funções de nível recebem a passada como parâmetro e
// não sabem se veio do gerador ou de um array escrito à mão — estes testes provam isso.
const q: RhythmEvent = { beats: 1 };
const h: RhythmEvent = { beats: 2 };
const w: RhythmEvent = { beats: 4 };
const rq: RhythmEvent = { beats: 1, rest: true };

describe("perfis curados — configuração", () => {
  it("há 6 perfis: l1–l5 em 4/4 e l6 em 3/4, thresholds válidos", () => {
    expect(CURATED_LEVELS).toHaveLength(6);
    for (const lv of CURATED_LEVELS.slice(0, 5)) {
      expect(lv.timeSignature).toEqual({ count: 4, unit: 4 });
    }
    expect(CURATED_LEVELS[5].timeSignature).toEqual({ count: 3, unit: 4 });
    for (const lv of CURATED_LEVELS) {
      expect(lv.passThreshold).toBeGreaterThan(0);
      expect(lv.passThreshold).toBeLessThanOrEqual(1);
      expect(lv.vocabulary.length).toBeGreaterThan(0);
    }
  });

  it("o perfil 3/4 não inclui semibreve (não cabe em 3 batidas)", () => {
    expect(CURATED_LEVELS[5].vocabulary).not.toContain("semibreve");
  });
});

describe("levelToPattern — expansão loop vs through (passada por parâmetro)", () => {
  const PASS_2_BARS: RhythmEvent[] = [q, q, q, q, h, h]; // 2 compassos 4/4 literais

  it("loop N×M: alvos e duração cobrem todas as repetições", () => {
    const loop = CURATED_LEVELS.find((lv) => lv.structure.type === "loop")!;
    const repeats = levelRepeats(loop);
    expect(repeats).toBeGreaterThan(1);

    const onePass = { tempo: loop.suggestedBpm, events: PASS_2_BARS };
    const expanded = levelToPattern(loop, PASS_2_BARS);

    expect(expectedTapTimes(expanded)).toHaveLength(expectedTapTimes(onePass).length * repeats);
    expect(patternDurationMs(expanded)).toBeCloseTo(patternDurationMs(onePass) * repeats, 6);
  });

  it("through: uma passada só (sem duplicação)", () => {
    const through = CURATED_LEVELS.find((lv) => lv.structure.type === "through")!;
    expect(levelRepeats(through)).toBe(1);
    expect(levelToPattern(through, PASS_2_BARS).events).toHaveLength(PASS_2_BARS.length);
  });

  it("bpm passado sobrescreve o sugerido", () => {
    expect(levelToPattern(CURATED_LEVELS[0], PASS_2_BARS, 123).tempo).toBe(123);
    expect(levelToPattern(CURATED_LEVELS[0], PASS_2_BARS).tempo).toBe(
      CURATED_LEVELS[0].suggestedBpm
    );
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
  it("emite fórmula de compasso e separadores para passada 4/4", () => {
    // l2 (through, 4 compassos) com passada literal de 4 compassos.
    const pass = [q, q, h, h, q, q, q, h, q, h, h];
    const tex = levelToTex(CURATED_LEVELS[1], pass);
    expect(tex).toContain("\\ts 4 4");
    expect(tex.match(/\|/g)).toHaveLength(3); // 4 compassos → 3 separadores
  });

  it("loop expande os compassos por extenso (sem sinais de repetição)", () => {
    const loop = CURATED_LEVELS[0]; // 2 compassos × 2
    const tex = levelToTex(loop, [q, q, q, q, q, q, q, q]);
    expect(tex.match(/\|/g)).toHaveLength(3); // 4 compassos escritos
    expect(tex).not.toContain("\\ro");
  });

  it("semibreve vira token :1", () => {
    const tex = levelToTex(CURATED_LEVELS[2], [w, q, q, h, h, h, w]);
    expect(tex).toContain(":1 c3");
  });

  it("perfil 3/4 emite \\ts 3 4 com compassos de 3 batidas", () => {
    // 4 compassos 3/4: | q q q | h q | q h | r q q |
    const pass = [q, q, q, h, q, q, h, rq, q, q];
    const tex = levelToTex(CURATED_LEVELS[5], pass);
    expect(tex).toContain("\\ts 3 4");
    expect(tex.match(/\|/g)).toHaveLength(3);
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