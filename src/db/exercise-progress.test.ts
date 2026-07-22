import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  _resetExerciseProgressFallback,
  averageRatio,
  getExerciseProgress,
  getPracticeDays,
  localDayString,
  saveExerciseResult,
} from "./exercise-progress";
import { initDb } from "./database";

// SQLite real não roda em jsdom — banco mockado, regras verificadas em JS de verdade
// (mesmo padrão do level-progress.test.ts original da 3b).
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
    kind: "tap",
    exercise_id: "l1",
    best_ratio: 0.7,
    ratio_sum: 1.4,
    ratio_count: 2,
    passed: 0,
    attempts_count: 3,
    last_attempted_at: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

/** Params do último INSERT na tabela pedida (há 2 execute por save: progresso e dia). */
function lastInsertParamsFor(table: string) {
  const calls = mockDb.execute.mock.calls.filter((c) => (c[0] as string).includes(table));
  expect(calls.length).toBeGreaterThan(0);
  return calls[calls.length - 1][1] as unknown[];
}

beforeEach(() => {
  vi.clearAllMocks();
  _resetExerciseProgressFallback();
  vi.mocked(initDb).mockResolvedValue(mockDb as never);
  mockDb.execute.mockResolvedValue(undefined);
});

describe("localDayString", () => {
  it("formata YYYY-MM-DD com zero à esquerda, no fuso local", () => {
    expect(localDayString(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(localDayString(new Date(2026, 11, 31))).toBe("2026-12-31");
  });
});

describe("averageRatio", () => {
  it("é null sem tentativas contadas (linha migrada da v1) e a média certa com elas", () => {
    const base = {
      kind: "tap" as const,
      exerciseId: "l1",
      bestRatio: 0.9,
      passed: true,
      attemptsCount: 7,
      lastAttemptedAt: "",
    };
    expect(averageRatio({ ...base, ratioSum: 0, ratioCount: 0 })).toBeNull();
    expect(averageRatio({ ...base, ratioSum: 1.5, ratioCount: 2 })).toBe(0.75);
  });
});

describe("saveExerciseResult — regras de merge", () => {
  it("primeira tentativa: insere best/sum/count/passed/attempts", async () => {
    mockDb.select.mockResolvedValue([]);
    await saveExerciseResult("tap", "l1", 0.85, true);

    const [kind, id, best, sum, count, passed, attempts] = lastInsertParamsFor(
      "exercise_progress"
    );
    expect(kind).toBe("tap");
    expect(id).toBe("l1");
    expect(best).toBe(0.85);
    expect(sum).toBe(0.85);
    expect(count).toBe(1);
    expect(passed).toBe(1);
    expect(attempts).toBe(1);
  });

  it("tentativa PIOR mantém best_ratio mas acumula média e conta", async () => {
    mockDb.select.mockImplementation(async (sql: string) =>
      sql.includes("exercise_progress") ? [row({ best_ratio: 0.9, passed: 1 })] : []
    );
    await saveExerciseResult("tap", "l1", 0.6, false);

    const [, , best, sum, count, passed, attempts] = lastInsertParamsFor("exercise_progress");
    expect(best).toBe(0.9); // não regrediu
    expect(sum).toBeCloseTo(2.0); // 1.4 + 0.6
    expect(count).toBe(3); // 2 + 1
    expect(passed).toBe(1); // sticky
    expect(attempts).toBe(4); // 3 + 1
  });

  it("tentativa MELHOR sobrescreve best_ratio", async () => {
    mockDb.select.mockImplementation(async (sql: string) =>
      sql.includes("exercise_progress") ? [row({ best_ratio: 0.7 })] : []
    );
    await saveExerciseResult("tap", "l1", 0.95, true);

    const [, , best] = lastInsertParamsFor("exercise_progress");
    expect(best).toBe(0.95);
  });

  it("linha migrada (sum/count zerados) começa a média do zero sem inventar histórico", async () => {
    mockDb.select.mockImplementation(async (sql: string) =>
      sql.includes("exercise_progress")
        ? [row({ ratio_sum: 0, ratio_count: 0, attempts_count: 10 })]
        : []
    );
    await saveExerciseResult("tap", "l1", 0.8, false);

    const [, , , sum, count, , attempts] = lastInsertParamsFor("exercise_progress");
    expect(sum).toBe(0.8); // média nasce agora
    expect(count).toBe(1);
    expect(attempts).toBe(11); // histórico de tentativas preservado
  });
});

describe("saveExerciseResult — practice_days (heatmap)", () => {
  it("incrementa a contagem do DIA LOCAL e do kind da tentativa", async () => {
    mockDb.select.mockImplementation(async (sql: string) =>
      sql.includes("practice_days") ? [{ day: "x", kind: "tap", count: 4 }] : []
    );
    await saveExerciseResult("tap", "l1", 0.5, false);

    const [day, kind, count] = lastInsertParamsFor("practice_days");
    expect(day).toBe(localDayString(new Date()));
    expect(kind).toBe("tap");
    expect(count).toBe(5); // 4 + 1
  });

  it("primeiro exercício do dia cria a contagem em 1", async () => {
    mockDb.select.mockResolvedValue([]);
    await saveExerciseResult("dictation", "d1", 1, true);

    const [, kind, count] = lastInsertParamsFor("practice_days");
    expect(kind).toBe("dictation");
    expect(count).toBe(1);
  });
});

describe("getExerciseProgress / getPracticeDays", () => {
  it("mapeia linhas pro modelo (passed 0/1 → boolean) e filtra por kind no SQL", async () => {
    mockDb.select.mockResolvedValue([row({ passed: 1 }), row({ exercise_id: "l2" })]);

    const records = await getExerciseProgress("tap");
    expect(records[0]).toMatchObject({ kind: "tap", exerciseId: "l1", passed: true });
    expect(mockDb.select.mock.calls[0][0]).toContain("WHERE kind = $1");
    expect(mockDb.select.mock.calls[0][1]).toEqual(["tap"]);
  });

  it("devolve as contagens diárias como registros", async () => {
    mockDb.select.mockResolvedValue([{ day: "2026-07-22", kind: "tap", count: 3 }]);
    const days = await getPracticeDays();
    expect(days).toEqual([{ day: "2026-07-22", kind: "tap", count: 3 }]);
  });
});

describe("fallback em memória (SQLite indisponível)", () => {
  beforeEach(() => {
    vi.mocked(initDb).mockRejectedValue(new Error("no tauri"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("aplica as mesmas regras, conta os dias e avisa UMA vez só", async () => {
    await saveExerciseResult("tap", "l1", 0.9, true);
    await saveExerciseResult("tap", "l1", 0.5, false); // pior: best não regride
    await saveExerciseResult("timed", "t1", 0.3, false);

    const tap = (await getExerciseProgress("tap")).find((r) => r.exerciseId === "l1")!;
    expect(tap.bestRatio).toBe(0.9);
    expect(tap.passed).toBe(true);
    expect(tap.attemptsCount).toBe(2);
    expect(averageRatio(tap)).toBeCloseTo(0.7); // (0.9+0.5)/2

    const days = await getPracticeDays();
    const today = localDayString(new Date());
    expect(days).toContainEqual({ day: today, kind: "tap", count: 2 });
    expect(days).toContainEqual({ day: today, kind: "timed", count: 1 });

    expect(console.warn).toHaveBeenCalledTimes(1);
  });
});
