import { describe, expect, it } from "vitest";
import {
  STAGNANT_MIN_ATTEMPTS,
  STALE_BADGE_DAYS,
  buildHeatmapWeeks,
  classifyExercise,
  mergePracticeDayCounts,
} from "./progress-stats";
import { STALE_CAP_DAYS } from "./practice-suggestion";

describe("mergePracticeDayCounts", () => {
  it("soma kinds do mesmo dia e agrupa sessões por practiced_on, sem duplicar", () => {
    const merged = mergePracticeDayCounts(
      [
        { day: "2026-07-20", count: 3 }, // tap
        { day: "2026-07-20", count: 2 }, // timed (mesmo dia, outro kind)
        { day: "2026-07-21", count: 1 },
      ],
      [
        { practicedOn: "2026-07-20" }, // sessão do diário no mesmo dia: SOMA (fontes disjuntas)
        { practicedOn: "2026-07-22" },
        { practicedOn: "2026-07-22" },
      ]
    );

    expect(merged.get("2026-07-20")).toBe(6); // 3 + 2 + 1 sessão
    expect(merged.get("2026-07-21")).toBe(1);
    expect(merged.get("2026-07-22")).toBe(2); // só sessões
    expect(merged.size).toBe(3);
  });

  it("entradas vazias produzem mapa vazio", () => {
    expect(mergePracticeDayCounts([], []).size).toBe(0);
  });
});

describe("buildHeatmapWeeks", () => {
  // Quarta-feira, 2026-07-22 (dia da semana = 3).
  const TODAY = new Date(2026, 6, 22);

  it("gera 12 colunas de 7 dias, terminando na semana de hoje", () => {
    const grid = buildHeatmapWeeks(TODAY);
    expect(grid).toHaveLength(12);
    for (const column of grid) expect(column).toHaveLength(7);

    const lastWeek = grid[11];
    expect(lastWeek[0].getDay()).toBe(0); // domingo
    expect(lastWeek[3].getDate()).toBe(22); // hoje na posição do dia da semana
    expect(lastWeek[6].getDay()).toBe(6); // sábado (futuro incluído; chamador apaga)
  });

  it("dias são consecutivos entre colunas (sem furo nem sobreposição)", () => {
    const grid = buildHeatmapWeeks(TODAY, 4);
    const all = grid.flat();
    for (let i = 1; i < all.length; i++) {
      const diff = all[i].getTime() - all[i - 1].getTime();
      expect(diff).toBe(86_400_000);
    }
    expect(all).toHaveLength(28);
  });

  it("primeira coluna começa (weeks-1) semanas antes do domingo corrente", () => {
    const grid = buildHeatmapWeeks(TODAY, 12);
    const firstCell = grid[0][0];
    const currentSunday = new Date(2026, 6, 19); // domingo da semana de 22/07/2026
    expect(currentSunday.getTime() - firstCell.getTime()).toBe(11 * 7 * 86_400_000);
  });
});

describe("classifyExercise", () => {
  const TODAY = new Date(2026, 6, 22);
  const base = {
    passed: false,
    attemptsCount: 0,
    lastAttemptedAt: "2026-07-22T00:00:00.000Z",
  };

  it("estagnado: muitas tentativas sem aprovação (limiar STAGNANT_MIN_ATTEMPTS)", () => {
    expect(
      classifyExercise({ ...base, attemptsCount: STAGNANT_MIN_ATTEMPTS }, TODAY).stagnant
    ).toBe(true);
    expect(
      classifyExercise({ ...base, attemptsCount: STAGNANT_MIN_ATTEMPTS - 1 }, TODAY).stagnant
    ).toBe(false);
  });

  it("aprovado NUNCA é estagnado, mesmo com muitas tentativas", () => {
    expect(classifyExercise({ ...base, passed: true, attemptsCount: 50 }, TODAY).stagnant).toBe(
      false
    );
  });

  it("órfão nunca é estagnado (nível não existe mais), mas pode estar parado", () => {
    const badges = classifyExercise(
      { ...base, orphan: true, attemptsCount: 10, lastAttemptedAt: "2026-01-01T00:00:00.000Z" },
      TODAY
    );
    expect(badges.stagnant).toBe(false);
    expect(badges.stale).toBe(true);
  });

  it("parado: limiar é a MESMA constante do practice-suggestion (fonte única)", () => {
    expect(STALE_BADGE_DAYS).toBe(STALE_CAP_DAYS);

    const staleDate = new Date(TODAY.getTime() - STALE_BADGE_DAYS * 86_400_000).toISOString();
    const freshDate = new Date(TODAY.getTime() - (STALE_BADGE_DAYS - 1) * 86_400_000).toISOString();
    expect(classifyExercise({ ...base, lastAttemptedAt: staleDate }, TODAY).stale).toBe(true);
    expect(classifyExercise({ ...base, lastAttemptedAt: freshDate }, TODAY).stale).toBe(false);
  });
});
