import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  _resetTheoryMapFallback,
  getTheoryMapProgress,
  resolveTheoryStatus,
  setTheoryNodeStatus,
  type TheoryNodeStatus,
} from "./theory-map-progress";
import { initDb } from "./database";

vi.mock("./database", () => ({
  initDb: vi.fn(),
}));

const mockDb = {
  select: vi.fn(),
  execute: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  _resetTheoryMapFallback();
  vi.mocked(initDb).mockResolvedValue(mockDb as never);
  mockDb.execute.mockResolvedValue(undefined);
  mockDb.select.mockResolvedValue([]);
});

describe("resolveTheoryStatus (regra pura)", () => {
  const ORDER: TheoryNodeStatus[] = ["nao_iniciado", "estudando", "praticado", "dominado"];

  it("auto SÓ promove — nunca rebaixa, em todas as 4×4 combinações", () => {
    for (const current of ORDER) {
      for (const requested of ORDER) {
        const resolved = resolveTheoryStatus(current, requested, "auto");
        const expected =
          ORDER.indexOf(requested) > ORDER.indexOf(current) ? requested : current;
        expect(resolved).toBe(expected);
      }
    }
  });

  it("manual grava exatamente o pedido, inclusive rebaixando", () => {
    expect(resolveTheoryStatus("dominado", "estudando", "manual")).toBe("estudando");
    expect(resolveTheoryStatus("praticado", "nao_iniciado", "manual")).toBe("nao_iniciado");
    expect(resolveTheoryStatus("nao_iniciado", "dominado", "manual")).toBe("dominado");
  });
});

describe("setTheoryNodeStatus", () => {
  it("auto promove nó ausente (nao_iniciado → praticado) com upsert", async () => {
    await setTheoryNodeStatus("escala-maior", "praticado", "auto");

    const [sql, params] = mockDb.execute.mock.calls[0];
    expect(sql).toContain("INSERT OR REPLACE INTO theory_map_progress");
    expect(params[0]).toBe("escala-maior");
    expect(params[1]).toBe("praticado");
  });

  it("auto tentando rebaixar vira NO-OP (nenhum execute)", async () => {
    mockDb.select.mockResolvedValue([
      { node_id: "escala-maior", status: "dominado", updated_at: "x" },
    ]);
    await setTheoryNodeStatus("escala-maior", "estudando", "auto");

    expect(mockDb.execute).not.toHaveBeenCalled();
  });

  it("manual rebaixa de verdade e manual 'nao_iniciado' DELETA a linha", async () => {
    mockDb.select.mockResolvedValue([
      { node_id: "modos", status: "dominado", updated_at: "x" },
    ]);
    await setTheoryNodeStatus("modos", "estudando", "manual");
    expect(mockDb.execute.mock.calls[0][1][1]).toBe("estudando");

    mockDb.execute.mockClear();
    await setTheoryNodeStatus("modos", "nao_iniciado", "manual");
    expect(mockDb.execute.mock.calls[0][0]).toContain("DELETE FROM theory_map_progress");
  });

  it("status igual ao atual é no-op (não regrava updated_at)", async () => {
    mockDb.select.mockResolvedValue([
      { node_id: "modos", status: "praticado", updated_at: "x" },
    ]);
    await setTheoryNodeStatus("modos", "praticado", "manual");
    expect(mockDb.execute).not.toHaveBeenCalled();
  });
});

describe("getTheoryMapProgress", () => {
  it("mapeia linhas pro modelo", async () => {
    mockDb.select.mockResolvedValue([
      { node_id: "a", status: "dominado", updated_at: "2026-07-22T00:00:00.000Z" },
    ]);
    expect(await getTheoryMapProgress()).toEqual([
      { nodeId: "a", status: "dominado", updatedAt: "2026-07-22T00:00:00.000Z" },
    ]);
  });
});

describe("fallback em memória", () => {
  beforeEach(() => {
    vi.mocked(initDb).mockRejectedValue(new Error("no tauri"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("aplica a MESMA regra manual/auto em memória e avisa UMA vez", async () => {
    await setTheoryNodeStatus("a", "dominado", "manual");
    await setTheoryNodeStatus("a", "estudando", "auto"); // auto não rebaixa
    await setTheoryNodeStatus("b", "estudando", "auto");
    await setTheoryNodeStatus("b", "nao_iniciado", "manual"); // manual remove

    const progress = await getTheoryMapProgress();
    expect(progress).toHaveLength(1);
    expect(progress[0]).toMatchObject({ nodeId: "a", status: "dominado" });
    expect(console.warn).toHaveBeenCalledTimes(1);
  });
});
