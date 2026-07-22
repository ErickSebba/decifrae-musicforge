import { beforeEach, describe, expect, it, vi } from "vitest";
import Database from "@tauri-apps/plugin-sql";
import { _resetDbSingleton, getDb, initDb } from "./database";

/**
 * Smoke tests originais (fase 0) + testes do runner de migração (3+5.0) com o plugin
 * mockado. Foco na v1 (unificação do Tap): cópia idempotente (INSERT OR IGNORE), drop,
 * registro de versão — e o cenário de FALHA NO MEIO (exigência do plano): quebra entre
 * a cópia e o drop não pode duplicar nem perder dados no re-run.
 */

vi.mock("@tauri-apps/plugin-sql", () => ({
  default: { load: vi.fn() },
}));

const mockDb = {
  select: vi.fn(),
  execute: vi.fn(),
};

/** Roteia os selects do initDb/migração por conteúdo do SQL. */
function routeSelects({
  oldTableExists,
  appliedVersions,
}: {
  oldTableExists: boolean;
  appliedVersions: number[];
}) {
  mockDb.select.mockImplementation(async (sql: string) => {
    if (sql.includes("sqlite_master")) {
      return oldTableExists ? [{ name: "tap_level_progress" }] : [];
    }
    if (sql.includes("schema_migrations")) {
      return appliedVersions.map((version) => ({ version }));
    }
    return [];
  });
}

const executedSql = () => mockDb.execute.mock.calls.map((c) => c[0] as string);

beforeEach(() => {
  vi.clearAllMocks();
  _resetDbSingleton();
  vi.mocked(Database.load).mockResolvedValue(mockDb as never);
  mockDb.execute.mockResolvedValue(undefined as never);
});

describe("database module (smoke, fase 0)", () => {
  it("exports initDb as a function", () => {
    expect(typeof initDb).toBe("function");
  });

  it("exports getDb as a function", () => {
    expect(typeof getDb).toBe("function");
  });

  it("getDb throws before initialization", () => {
    expect(() => getDb()).toThrow("Database not initialized");
  });
});

describe("migração v1 — banco velho com dados do Tap", () => {
  it("copia com INSERT OR IGNORE (sum/count zerados), dropa a tabela antiga e registra a versão", async () => {
    routeSelects({ oldTableExists: true, appliedVersions: [] });
    await initDb();

    const sql = executedSql();
    const copy = sql.find((s) => s.includes("INSERT OR IGNORE INTO exercise_progress"))!;
    expect(copy).toBeDefined();
    expect(copy).toContain("SELECT 'tap', level_id, best_ratio, 0, 0"); // média nasce zerada
    expect(copy).toContain("FROM tap_level_progress");

    expect(sql).toContainEqual(expect.stringContaining("DROP TABLE IF EXISTS tap_level_progress"));

    const versionCall = mockDb.execute.mock.calls.find((c) =>
      (c[0] as string).includes("INSERT OR IGNORE INTO schema_migrations")
    )!;
    expect(versionCall[1]).toEqual([1]);

    // Ordem: cópia ANTES do drop, drop ANTES do registro (idempotência por janela).
    const iCopy = sql.findIndex((s) => s.includes("INSERT OR IGNORE INTO exercise_progress"));
    const iDrop = sql.findIndex((s) => s.includes("DROP TABLE IF EXISTS tap_level_progress"));
    const iVersion = sql.findIndex((s) => s.includes("INSERT OR IGNORE INTO schema_migrations"));
    expect(iCopy).toBeLessThan(iDrop);
    expect(iDrop).toBeLessThan(iVersion);
  });
});

describe("migração v1 — banco novo", () => {
  it("sem tabela antiga: nada de copy/drop, só registra a versão (no-op registrado)", async () => {
    routeSelects({ oldTableExists: false, appliedVersions: [] });
    await initDb();

    const sql = executedSql();
    expect(sql.some((s) => s.includes("INSERT OR IGNORE INTO exercise_progress"))).toBe(false);
    expect(sql.some((s) => s.includes("DROP TABLE"))).toBe(false);
    expect(sql.some((s) => s.includes("INSERT OR IGNORE INTO schema_migrations"))).toBe(true);
  });
});

describe("migração v1 — versão já aplicada", () => {
  it("não reaplica nem re-registra", async () => {
    routeSelects({ oldTableExists: true, appliedVersions: [1] });
    await initDb();

    const sql = executedSql();
    expect(sql.some((s) => s.includes("INSERT OR IGNORE INTO exercise_progress"))).toBe(false);
    expect(sql.some((s) => s.includes("DROP TABLE"))).toBe(false);
    expect(sql.some((s) => s.includes("INSERT OR IGNORE INTO schema_migrations"))).toBe(false);
  });
});

describe("migração v1 — falha ENTRE a cópia e o drop (cenário exigido)", () => {
  it("1º run falha no DROP; re-run refaz cópia (OR IGNORE), dropa e registra a versão UMA vez", async () => {
    routeSelects({ oldTableExists: true, appliedVersions: [] });
    // 1º run: o DROP rejeita (simula crash/reboot entre os passos 2 e 3).
    mockDb.execute.mockImplementation(async (sql: string) => {
      if (sql.includes("DROP TABLE")) throw new Error("crash entre copy e drop");
      return undefined as never;
    });

    await expect(initDb()).rejects.toThrow("crash entre copy e drop");

    // A versão NÃO pode ter sido registrada no run que falhou.
    expect(
      executedSql().some((s) => s.includes("INSERT OR IGNORE INTO schema_migrations"))
    ).toBe(false);

    // Reboot: singleton limpo (initDb que falha não cacheia), tabela antiga AINDA existe,
    // versão ainda ausente — o re-run deve convergir.
    _resetDbSingleton();
    mockDb.execute.mockClear();
    mockDb.execute.mockResolvedValue(undefined as never);

    await initDb();

    const sql = executedSql();
    // Re-copia com OR IGNORE (linhas já copiadas/atualizadas são preservadas — sem dupla).
    expect(sql.filter((s) => s.includes("INSERT OR IGNORE INTO exercise_progress"))).toHaveLength(1);
    expect(sql.filter((s) => s.includes("DROP TABLE IF EXISTS tap_level_progress"))).toHaveLength(1);
    expect(sql.filter((s) => s.includes("INSERT OR IGNORE INTO schema_migrations"))).toHaveLength(1);
  });

  it("initDb que falhou não cacheia o singleton (retry possível)", async () => {
    routeSelects({ oldTableExists: true, appliedVersions: [] });
    mockDb.execute.mockRejectedValue(new Error("boom"));

    await expect(initDb()).rejects.toThrow("boom");
    // Sem reset manual: nova chamada tenta de novo (Database.load chamado 2×).
    mockDb.execute.mockResolvedValue(undefined as never);
    await initDb();
    expect(vi.mocked(Database.load)).toHaveBeenCalledTimes(2);
  });
});
