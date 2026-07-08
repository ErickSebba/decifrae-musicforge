import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  _resetLevelProgressFallback,
  getLevelProgress,
  saveLevelResult,
} from "./level-progress";
import { initDb } from "./database";

// SQLite real não roda em jsdom — mocka o módulo de banco (mesmo padrão do mock de
// audio-engine em Fretboard.test.tsx). A lógica de merge fica em JS justamente pra ser
// verificável aqui de verdade, não como string de SQL.
vi.mock("./database", () => ({
  initDb: vi.fn(),
}));

const mockDb = {
  select: vi.fn(),
  execute: vi.fn(),
};

/** Linha existente no formato do banco (passed como 0/1). */
function row(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    level_id: "l1",
    best_ratio: 0.7,
    passed: 0,
    attempts_count: 3,
    last_attempted_at: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

/** Params do último INSERT: [level_id, best_ratio, passed, attempts_count, last_attempted_at]. */
function lastInsertParams() {
  const calls = mockDb.execute.mock.calls;
  const call = calls[calls.length - 1];
  return call[1] as [string, number, number, number, string];
}

beforeEach(() => {
  vi.clearAllMocks();
  _resetLevelProgressFallback();
  vi.mocked(initDb).mockResolvedValue(mockDb as never);
  mockDb.execute.mockResolvedValue(undefined);
});

describe("saveLevelResult — só sobrescreve quando melhora", () => {
  it("primeira tentativa: insere ratio, passed e attempts_count=1", async () => {
    mockDb.select.mockResolvedValue([]);
    await saveLevelResult("l1", 0.85, true);

    const [levelId, bestRatio, passed, attempts] = lastInsertParams();
    expect(levelId).toBe("l1");
    expect(bestRatio).toBe(0.85);
    expect(passed).toBe(1);
    expect(attempts).toBe(1);
  });

  it("tentativa PIOR mantém best_ratio, mas conta a tentativa", async () => {
    mockDb.select.mockResolvedValue([row({ best_ratio: 0.9, passed: 1 })]);
    await saveLevelResult("l1", 0.6, false);

    const [, bestRatio, , attempts] = lastInsertParams();
    expect(bestRatio).toBe(0.9); // não regrediu
    expect(attempts).toBe(4); // 3 + 1
  });

  it("tentativa MELHOR sobrescreve best_ratio", async () => {
    mockDb.select.mockResolvedValue([row({ best_ratio: 0.7 })]);
    await saveLevelResult("l1", 0.95, true);

    const [, bestRatio] = lastInsertParams();
    expect(bestRatio).toBe(0.95);
  });

  it("passed salvo nunca regride com reprovação posterior", async () => {
    mockDb.select.mockResolvedValue([row({ best_ratio: 0.9, passed: 1 })]);
    await saveLevelResult("l1", 0.3, false);

    const [, , passed] = lastInsertParams();
    expect(passed).toBe(1); // continua passado
  });

  it("reprovação em nível nunca passado grava passed=0", async () => {
    mockDb.select.mockResolvedValue([row({ passed: 0 })]);
    await saveLevelResult("l1", 0.5, false);

    const [, , passed] = lastInsertParams();
    expect(passed).toBe(0);
  });
});

describe("getLevelProgress", () => {
  it("mapeia linhas do banco pro modelo (passed 0/1 → boolean)", async () => {
    mockDb.select.mockResolvedValue([
      row({ level_id: "l1", passed: 1, best_ratio: 0.9 }),
      row({ level_id: "l2", passed: 0, best_ratio: 0.4, attempts_count: 1 }),
    ]);

    const records = await getLevelProgress();
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({ levelId: "l1", passed: true, bestRatio: 0.9 });
    expect(records[1]).toMatchObject({ levelId: "l2", passed: false, attemptsCount: 1 });
  });
});

describe("fallback em memória (SQLite indisponível)", () => {
  beforeEach(() => {
    vi.mocked(initDb).mockRejectedValue(new Error("no tauri"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("não lança, aplica as mesmas regras em memória e avisa UMA vez só", async () => {
    await saveLevelResult("l1", 0.9, true);
    await saveLevelResult("l1", 0.5, false); // pior: não regride
    await saveLevelResult("l2", 0.3, false);

    const records = await getLevelProgress();
    const l1 = records.find((r) => r.levelId === "l1")!;
    expect(l1.bestRatio).toBe(0.9);
    expect(l1.passed).toBe(true);
    expect(l1.attemptsCount).toBe(2);

    expect(console.warn).toHaveBeenCalledTimes(1); // sem poluir o console
  });
});