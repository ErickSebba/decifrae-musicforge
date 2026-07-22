import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  _resetLevelProgressFallback,
  getLevelProgress,
  saveLevelResult,
} from "./level-progress";
import { initDb } from "./database";

/**
 * Teste do ADAPTER (3+5.0): level-progress delega pra tabela unificada exercise_progress
 * com kind 'tap'. As regras de merge/fallback completas são testadas em
 * exercise-progress.test.ts — aqui garantimos o contrato que as telas do Módulo 1 e o
 * deriveUnlockedLevels consomem (ProgressRecord) e a delegação correta.
 * (Reescrito da versão da 3b, que testava a tabela tap_level_progress absorvida pela
 * migração v1 — mudança prevista e aprovada no plano da 3+5.0.)
 */

vi.mock("./database", () => ({
  initDb: vi.fn(),
}));

const mockDb = {
  select: vi.fn(),
  execute: vi.fn(),
};

function progressRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    kind: "tap",
    exercise_id: "l1",
    best_ratio: 0.7,
    ratio_sum: 0.7,
    ratio_count: 1,
    passed: 0,
    attempts_count: 3,
    last_attempted_at: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  _resetLevelProgressFallback();
  vi.mocked(initDb).mockResolvedValue(mockDb as never);
  mockDb.execute.mockResolvedValue(undefined);
});

describe("saveLevelResult — delega pro exercise_progress com kind 'tap'", () => {
  it("grava na tabela unificada com kind 'tap' e aplica as regras de merge", async () => {
    mockDb.select.mockImplementation(async (sql: string) =>
      sql.includes("exercise_progress") ? [progressRow({ best_ratio: 0.9, passed: 1 })] : []
    );
    await saveLevelResult("l1", 0.6, false);

    const call = mockDb.execute.mock.calls.find((c) =>
      (c[0] as string).includes("exercise_progress")
    )!;
    const [kind, levelId, bestRatio, , , passed, attempts] = call[1] as unknown[];
    expect(kind).toBe("tap");
    expect(levelId).toBe("l1");
    expect(bestRatio).toBe(0.9); // não regrediu
    expect(passed).toBe(1); // sticky
    expect(attempts).toBe(4); // 3 + 1
  });
});

describe("getLevelProgress — contrato ProgressRecord das telas/deriveUnlockedLevels", () => {
  it("consulta só kind 'tap' e mapeia pro formato ProgressRecord (sem campos de média)", async () => {
    mockDb.select.mockResolvedValue([
      progressRow({ exercise_id: "l1", passed: 1, best_ratio: 0.9 }),
      progressRow({ exercise_id: "l2", passed: 0, best_ratio: 0.4, attempts_count: 1 }),
    ]);

    const records = await getLevelProgress();
    expect(mockDb.select.mock.calls[0][1]).toEqual(["tap"]);
    expect(records).toHaveLength(2);
    expect(records[0]).toEqual({
      levelId: "l1",
      bestRatio: 0.9,
      passed: true,
      attemptsCount: 3,
      lastAttemptedAt: "2026-07-01T00:00:00.000Z",
    });
    expect(records[1]).toMatchObject({ levelId: "l2", passed: false, attemptsCount: 1 });
  });
});

describe("fallback em memória via adapter", () => {
  it("mantém as regras do Tap quando o SQLite falta", async () => {
    vi.mocked(initDb).mockRejectedValue(new Error("no tauri"));
    vi.spyOn(console, "warn").mockImplementation(() => {});

    await saveLevelResult("l1", 0.9, true);
    await saveLevelResult("l1", 0.5, false); // pior: não regride

    const records = await getLevelProgress();
    const l1 = records.find((r) => r.levelId === "l1")!;
    expect(l1.bestRatio).toBe(0.9);
    expect(l1.passed).toBe(true);
    expect(l1.attemptsCount).toBe(2);
    expect(console.warn).toHaveBeenCalledTimes(1);
  });
});
