import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  _resetContentEntriesFallback,
  getContentEntries,
  getContentEntryByTopic,
} from "./content-entries";
import { initDb } from "./database";

// SQLite real não roda em jsdom — mocka o módulo de banco (mesmo padrão do
// level-progress.test.ts). Seed e mapeamento ficam em JS pra serem verificáveis aqui.
vi.mock("./database", () => ({
  initDb: vi.fn(),
}));

const mockDb = {
  select: vi.fn(),
  execute: vi.fn(),
};

/** Linha existente no formato do banco. */
function row(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "theory-dorian",
    topic: "dorian",
    title: "Modo Dórico",
    body: "**Fórmula intervalar:**\n1 - 2 - b3 - 4 - 5 - 6 - b7",
    review_status: "confirmado",
    note: "",
    created_at: "2026-07-09T00:00:00.000Z",
    ...overrides,
  };
}

/** Responde COUNT com n e SELECTs subsequentes com as linhas dadas. */
function mockCountThen(n: number, rows: unknown[] = []) {
  mockDb.select.mockImplementation(async (sql: string) =>
    sql.includes("COUNT(*)") ? [{ n }] : rows
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  _resetContentEntriesFallback();
  vi.mocked(initDb).mockResolvedValue(mockDb as never);
  mockDb.execute.mockResolvedValue(undefined);
});

describe("seed idempotente", () => {
  it("tabela vazia: insere as 12 entradas com review_status confirmado e id theory-<topic>", async () => {
    mockCountThen(0);
    await getContentEntries();

    const inserts = mockDb.execute.mock.calls.filter(([sql]) =>
      String(sql).includes("INSERT INTO content_entries")
    );
    expect(inserts).toHaveLength(12);

    const params = inserts.map(([, p]) => p as string[]);
    for (const [id, topic, title, body, reviewStatus] of params) {
      expect(id).toBe(`theory-${topic}`);
      expect(title).not.toBe("");
      expect(body).toContain("**Fórmula intervalar:**");
      expect(reviewStatus).toBe("confirmado");
    }
    const topics = params.map(([, topic]) => topic);
    expect(topics).toContain("major");
    expect(topics).toContain("blues");
  });

  it("tabela já populada: ZERO inserts", async () => {
    mockCountThen(12, [row()]);
    await getContentEntries();

    const inserts = mockDb.execute.mock.calls.filter(([sql]) =>
      String(sql).includes("INSERT INTO content_entries")
    );
    expect(inserts).toHaveLength(0);
  });

  it("múltiplas leituras na mesma sessão: o seed (COUNT) roda uma vez só", async () => {
    mockCountThen(0);
    await getContentEntries();
    await getContentEntryByTopic("dorian");
    await getContentEntries();

    const counts = mockDb.select.mock.calls.filter(([sql]) =>
      String(sql).includes("COUNT(*)")
    );
    expect(counts).toHaveLength(1);
  });
});

describe("getContentEntryByTopic", () => {
  it("mapeia a linha do banco pro modelo (snake_case → camelCase)", async () => {
    mockCountThen(12, [row()]);
    const entry = await getContentEntryByTopic("dorian");

    expect(entry).toMatchObject({
      id: "theory-dorian",
      topic: "dorian",
      title: "Modo Dórico",
      reviewStatus: "confirmado",
      createdAt: "2026-07-09T00:00:00.000Z",
    });
  });

  it("retorna null para topic sem entrada", async () => {
    mockCountThen(12, []);
    expect(await getContentEntryByTopic("inexistente")).toBeNull();
  });
});

describe("fallback em memória (SQLite indisponível)", () => {
  beforeEach(() => {
    vi.mocked(initDb).mockRejectedValue(new Error("no tauri"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("semeia em memória, resolve por topic e avisa UMA vez só", async () => {
    const entries = await getContentEntries();
    expect(entries).toHaveLength(12);

    const dorian = await getContentEntryByTopic("dorian");
    expect(dorian?.title).toBe("Modo Dórico");
    expect(dorian?.reviewStatus).toBe("confirmado");

    expect(await getContentEntryByTopic("inexistente")).toBeNull();
    expect(console.warn).toHaveBeenCalledTimes(1);
  });
});
