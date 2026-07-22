import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  _resetStudyTrackFallback,
  getStudyTrackProgress,
  setStudyItemStatus,
} from "./study-track-progress";
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
  _resetStudyTrackFallback();
  vi.mocked(initDb).mockResolvedValue(mockDb as never);
  mockDb.execute.mockResolvedValue(undefined);
  mockDb.select.mockResolvedValue([]);
});

describe("setStudyItemStatus", () => {
  it("upsert de status não-default com updated_at", async () => {
    await setStudyItemStatus("hal-leonard-1:cap3:ex12", "em_andamento");

    const [sql, params] = mockDb.execute.mock.calls[0];
    expect(sql).toContain("INSERT OR REPLACE INTO study_track_progress");
    expect(params[0]).toBe("hal-leonard-1:cap3:ex12");
    expect(params[1]).toBe("em_andamento");
    expect(typeof params[2]).toBe("string"); // ISO
  });

  it("'nao_iniciado' DELETA a linha (default por ausência, nunca armazenado)", async () => {
    await setStudyItemStatus("livro:cap1", "nao_iniciado");

    const [sql, params] = mockDb.execute.mock.calls[0];
    expect(sql).toContain("DELETE FROM study_track_progress");
    expect(params).toEqual(["livro:cap1"]);
  });

  it("transições são livres (concluido → em_andamento regride sem regra)", async () => {
    mockDb.select.mockResolvedValue([
      { item_id: "livro:cap1", status: "concluido", updated_at: "x" },
    ]);
    await setStudyItemStatus("livro:cap1", "em_andamento");

    const [, params] = mockDb.execute.mock.calls[0];
    expect(params[1]).toBe("em_andamento");
  });
});

describe("getStudyTrackProgress", () => {
  it("mapeia linhas pro modelo", async () => {
    mockDb.select.mockResolvedValue([
      { item_id: "a", status: "concluido", updated_at: "2026-07-22T00:00:00.000Z" },
    ]);
    const progress = await getStudyTrackProgress();
    expect(progress).toEqual([
      { itemId: "a", status: "concluido", updatedAt: "2026-07-22T00:00:00.000Z" },
    ]);
  });
});

describe("fallback em memória", () => {
  beforeEach(() => {
    vi.mocked(initDb).mockRejectedValue(new Error("no tauri"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("aplica as mesmas regras (upsert e delete-no-default) e avisa UMA vez", async () => {
    await setStudyItemStatus("a", "em_andamento");
    await setStudyItemStatus("b", "concluido");
    await setStudyItemStatus("a", "nao_iniciado"); // remove

    const progress = await getStudyTrackProgress();
    expect(progress).toHaveLength(1);
    expect(progress[0]).toMatchObject({ itemId: "b", status: "concluido" });
    expect(console.warn).toHaveBeenCalledTimes(1);
  });
});
