import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  _resetPracticeDiaryFallback,
  addSession,
  archiveExercise,
  createExercise,
  getExercises,
  getSessions,
  updateExercise,
} from "./practice-diary";
import { initDb } from "./database";
import { localDayString } from "./exercise-progress";

vi.mock("./database", () => ({
  initDb: vi.fn(),
}));

const mockDb = {
  select: vi.fn(),
  execute: vi.fn(),
};

function exerciseRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "ex-1",
    name: "Escala maior em 2 oitavas",
    category: "escalas",
    complexity: 3,
    target_bpm: 120,
    archived: 0,
    created_at: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  _resetPracticeDiaryFallback();
  vi.mocked(initDb).mockResolvedValue(mockDb as never);
  mockDb.execute.mockResolvedValue(undefined);
  mockDb.select.mockResolvedValue([]);
});

describe("createExercise", () => {
  it("gera uuid, clampa complexity em 1..5 e insere", async () => {
    const created = await createExercise({
      name: "  Walking bass  ",
      category: "grooves",
      complexity: 99,
      targetBpm: 90,
    });

    expect(created.name).toBe("Walking bass"); // trim
    expect(created.complexity).toBe(5); // clamp
    expect(created.archived).toBe(false);
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/);

    const [sql, params] = mockDb.execute.mock.calls[0];
    expect(sql).toContain("INSERT OR REPLACE INTO exercises");
    expect(params[1]).toBe("Walking bass");
    expect(params[3]).toBe(5);
  });

  it("nome vazio lança (erro de negócio, nunca engolido)", async () => {
    await expect(createExercise({ name: "   ", category: "x", complexity: 3 })).rejects.toThrow(
      "precisa de nome"
    );
    expect(mockDb.execute).not.toHaveBeenCalled();
  });
});

describe("updateExercise / archiveExercise", () => {
  it("aplica patch parcial preservando o resto", async () => {
    mockDb.select.mockResolvedValue([exerciseRow()]);
    const updated = await updateExercise("ex-1", { targetBpm: 140 });

    expect(updated.targetBpm).toBe(140);
    expect(updated.name).toBe("Escala maior em 2 oitavas"); // preservado
    expect(updated.complexity).toBe(3);
  });

  it("id inexistente lança", async () => {
    mockDb.select.mockResolvedValue([]);
    await expect(updateExercise("ghost", { name: "x" })).rejects.toThrow("não encontrado");
  });

  it("archive marca archived=1 (nunca DELETE) e é idempotente", async () => {
    mockDb.select.mockResolvedValue([exerciseRow()]);
    await archiveExercise("ex-1");

    const [sql, params] = mockDb.execute.mock.calls[0];
    expect(sql).toContain("INSERT OR REPLACE INTO exercises");
    expect(sql).not.toContain("DELETE");
    expect(params[5]).toBe(1); // archived

    mockDb.execute.mockClear();
    mockDb.select.mockResolvedValue([exerciseRow({ archived: 1 })]);
    await archiveExercise("ex-1"); // já arquivado → no-op
    expect(mockDb.execute).not.toHaveBeenCalled();
  });
});

describe("getExercises", () => {
  it("filtra arquivados por padrão; includeArchived devolve todos", async () => {
    mockDb.select.mockResolvedValue([
      exerciseRow(),
      exerciseRow({ id: "ex-2", archived: 1 }),
    ]);

    expect(await getExercises()).toHaveLength(1);
    expect(await getExercises(true)).toHaveLength(2);
  });
});

describe("addSession", () => {
  it("valida exercício, clampa rating, default practicedOn = hoje local", async () => {
    mockDb.select.mockImplementation(async (sql: string) =>
      sql.includes("FROM exercises") ? [exerciseRow()] : []
    );
    const session = await addSession({ exerciseId: "ex-1", bpm: 100, rating: 9 });

    expect(session.rating).toBe(5); // clamp
    expect(session.practicedOn).toBe(localDayString(new Date()));
    const call = mockDb.execute.mock.calls.find((c) =>
      (c[0] as string).includes("practice_sessions")
    )!;
    expect(call[1][1]).toBe("ex-1");
  });

  it("exercício inexistente lança e nada é gravado", async () => {
    mockDb.select.mockResolvedValue([]);
    await expect(addSession({ exerciseId: "ghost" })).rejects.toThrow("não encontrado");
    expect(mockDb.execute).not.toHaveBeenCalled();
  });

  it("exercício ARQUIVADO não aceita sessão nova", async () => {
    mockDb.select.mockResolvedValue([exerciseRow({ archived: 1 })]);
    await expect(addSession({ exerciseId: "ex-1" })).rejects.toThrow("arquivado");
    expect(mockDb.execute).not.toHaveBeenCalled();
  });

  it("backdating: practicedOn explícito é respeitado", async () => {
    mockDb.select.mockResolvedValue([exerciseRow()]);
    const session = await addSession({ exerciseId: "ex-1", practicedOn: "2026-07-01" });
    expect(session.practicedOn).toBe("2026-07-01");
  });
});

describe("getSessions", () => {
  it("ordena por dia desc (createdAt desempata) e filtra por exercício", async () => {
    mockDb.select.mockResolvedValue([
      { id: "s1", exercise_id: "ex-1", practiced_on: "2026-07-01", bpm: null, duration_min: null, rating: null, note: "", created_at: "2026-07-01T10:00:00.000Z" },
      { id: "s2", exercise_id: "ex-1", practiced_on: "2026-07-20", bpm: 100, duration_min: 15, rating: 4, note: "", created_at: "2026-07-20T10:00:00.000Z" },
      { id: "s3", exercise_id: "ex-1", practiced_on: "2026-07-20", bpm: 105, duration_min: 10, rating: 4, note: "", created_at: "2026-07-20T12:00:00.000Z" },
    ]);

    const sessions = await getSessions("ex-1");
    expect(sessions.map((s) => s.id)).toEqual(["s3", "s2", "s1"]);
    expect(mockDb.select.mock.calls[0][1]).toEqual(["ex-1"]);
  });
});

describe("fallback em memória", () => {
  beforeEach(() => {
    vi.mocked(initDb).mockRejectedValue(new Error("no tauri"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("CRUD completo com as MESMAS regras de negócio, warn UMA vez", async () => {
    const ex = await createExercise({ name: "Groove", category: "ritmo", complexity: 2 });
    await addSession({ exerciseId: ex.id, bpm: 80, rating: 3 });
    await archiveExercise(ex.id);

    // Arquivado: some do padrão, aparece com includeArchived, recusa sessão nova.
    expect(await getExercises()).toHaveLength(0);
    expect(await getExercises(true)).toHaveLength(1);
    await expect(addSession({ exerciseId: ex.id })).rejects.toThrow("arquivado");

    const sessions = await getSessions(ex.id);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].bpm).toBe(80);

    expect(console.warn).toHaveBeenCalledTimes(1);
  });
});
