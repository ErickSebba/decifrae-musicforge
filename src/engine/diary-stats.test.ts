import { describe, expect, it } from "vitest";
import { groupSessionsByExercise, summarizeSessions } from "./diary-stats";
import { RECENT_SESSIONS } from "./practice-suggestion";

function session(overrides: Partial<{
  exerciseId: string;
  practicedOn: string;
  bpm: number | null;
  rating: number | null;
}> = {}) {
  return {
    exerciseId: "ex-1",
    practicedOn: "2026-07-20",
    bpm: null,
    rating: null,
    ...overrides,
  };
}

describe("summarizeSessions", () => {
  it("conjunto vazio → zeros/null", () => {
    expect(summarizeSessions([])).toEqual({
      count: 0,
      maxBpm: null,
      avgRatingRecent: null,
      lastPracticedOn: null,
    });
  });

  it("maxBpm ignora sessões sem BPM; null se nenhuma tem", () => {
    expect(summarizeSessions([session({ bpm: 90 }), session({ bpm: null }), session({ bpm: 110 })]).maxBpm).toBe(110);
    expect(summarizeSessions([session({ bpm: null }), session({ bpm: null })]).maxBpm).toBeNull();
  });

  it("avgRatingRecent = média só das últimas RECENT_SESSIONS com nota", () => {
    // RECENT_SESSIONS+1 sessões: a mais antiga (nota 1) fica de fora da janela.
    const many = Array.from({ length: RECENT_SESSIONS + 1 }, (_, i) =>
      session({ practicedOn: `2026-07-${String(10 + i).padStart(2, "0")}`, rating: i === 0 ? 1 : 5 })
    );
    expect(summarizeSessions(many).avgRatingRecent).toBe(5); // a nota 1 (fora da janela) não entra
  });

  it("média recente ignora sessões sem nota; null quando nenhuma recente tem", () => {
    expect(
      summarizeSessions([session({ rating: 4 }), session({ rating: null }), session({ rating: 2 })])
        .avgRatingRecent
    ).toBe(3);
    expect(summarizeSessions([session({ rating: null })]).avgRatingRecent).toBeNull();
  });

  it("lastPracticedOn é o dia mais recente e count é o total", () => {
    const summary = summarizeSessions([
      session({ practicedOn: "2026-07-01" }),
      session({ practicedOn: "2026-07-22" }),
      session({ practicedOn: "2026-07-15" }),
    ]);
    expect(summary.lastPracticedOn).toBe("2026-07-22");
    expect(summary.count).toBe(3);
  });
});

describe("groupSessionsByExercise", () => {
  it("agrupa por exerciseId preservando as sessões", () => {
    const grouped = groupSessionsByExercise([
      session({ exerciseId: "a" }),
      session({ exerciseId: "b" }),
      session({ exerciseId: "a" }),
    ]);
    expect(grouped.get("a")).toHaveLength(2);
    expect(grouped.get("b")).toHaveLength(1);
    expect(grouped.has("c")).toBe(false);
  });
});
