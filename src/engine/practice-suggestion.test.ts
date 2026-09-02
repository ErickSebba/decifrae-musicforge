import { describe, expect, it } from "vitest";
import {
  STALE_CAP_DAYS,
  W_NEVER_PRACTICED,
  filterDismissed,
  resolveSuggestionTarget,
  suggestPractice,
  suggestionKey,
  type AppExerciseInput,
  type DiaryExerciseInput,
  type DiarySessionInput,
  type PracticeSuggestion,
} from "./practice-suggestion";

/** Cenários determinísticos: today fixo, inputs explícitos. */
const TODAY = new Date("2026-07-22T12:00:00.000Z");

function appRecord(overrides: Partial<AppExerciseInput> = {}): AppExerciseInput {
  return {
    kind: "tap",
    exerciseId: "l1",
    bestRatio: 1,
    passed: true,
    lastAttemptedAt: "2026-07-22T10:00:00.000Z", // hoje
    ...overrides,
  };
}

function diaryExercise(overrides: Partial<DiaryExerciseInput> = {}): DiaryExerciseInput {
  return {
    id: "ex-1",
    name: "Walking bass",
    archived: false,
    targetBpm: null,
    ...overrides,
  };
}

function session(overrides: Partial<DiarySessionInput> = {}): DiarySessionInput {
  return {
    exerciseId: "ex-1",
    practicedOn: "2026-07-22",
    bpm: null,
    rating: null,
    ...overrides,
  };
}

describe("exercícios do app", () => {
  it("o mais fraco vence o mais forte", () => {
    const result = suggestPractice(
      {
        appProgress: [
          appRecord({ exerciseId: "forte", bestRatio: 0.95 }),
          appRecord({ exerciseId: "fraco", bestRatio: 0.4 }),
        ],
        exercises: [],
        sessions: [],
      },
      TODAY
    );
    expect(result[0].id).toBe("fraco");
    expect(result[0].reasons).toContain("melhor acerto em 40%");
  });

  it("reprovado pontua acima de aprovado com o mesmo ratio", () => {
    const result = suggestPractice(
      {
        appProgress: [
          appRecord({ exerciseId: "aprovado", bestRatio: 0.8, passed: true }),
          appRecord({ exerciseId: "reprovado", bestRatio: 0.8, passed: false }),
        ],
        exercises: [],
        sessions: [],
      },
      TODAY
    );
    expect(result[0].id).toBe("reprovado");
    expect(result[0].reasons).toContain("ainda não aprovado");
  });

  it("parado há semanas pontua acima de praticado hoje (teto no STALE_CAP_DAYS)", () => {
    const result = suggestPractice(
      {
        appProgress: [
          appRecord({ exerciseId: "hoje" }),
          appRecord({ exerciseId: "parado", lastAttemptedAt: "2026-06-01T00:00:00.000Z" }),
        ],
        exercises: [],
        sessions: [],
      },
      TODAY
    );
    expect(result[0].id).toBe("parado");
    expect(result[0].reasons.some((r) => r.startsWith("sem praticar há"))).toBe(true);
    expect(STALE_CAP_DAYS).toBeGreaterThan(0); // teto documentado no engine
  });
});

describe("exercícios do diário", () => {
  it("nunca praticado aparece com score alto e reason própria", () => {
    const result = suggestPractice(
      {
        appProgress: [],
        exercises: [diaryExercise()],
        sessions: [],
      },
      TODAY
    );
    expect(result[0]).toMatchObject({
      source: "diary",
      id: "ex-1",
      label: "Walking bass",
      score: W_NEVER_PRACTICED,
      reasons: ["nunca praticado"],
    });
  });

  it("avaliação média recente baixa vence avaliação alta", () => {
    const result = suggestPractice(
      {
        appProgress: [],
        exercises: [
          diaryExercise({ id: "bem", name: "Bem avaliado" }),
          diaryExercise({ id: "mal", name: "Mal avaliado" }),
        ],
        sessions: [
          session({ exerciseId: "bem", rating: 5 }),
          session({ exerciseId: "mal", rating: 2 }),
        ],
      },
      TODAY
    );
    expect(result[0].id).toBe("mal");
    expect(result[0].reasons).toContain("avaliação média recente 2.0/5");
  });

  it("BPM estagnado e abaixo do alvo pontua acima de BPM progredindo", () => {
    const sessionsFor = (id: string, bpms: number[]): DiarySessionInput[] =>
      bpms.map((bpm, i) =>
        session({ exerciseId: id, bpm, practicedOn: `2026-07-1${i + 1}` })
      );
    const result = suggestPractice(
      {
        appProgress: [],
        exercises: [
          diaryExercise({ id: "progride", name: "Progredindo", targetBpm: 120 }),
          diaryExercise({ id: "estagnado", name: "Estagnado", targetBpm: 120 }),
        ],
        sessions: [
          ...sessionsFor("progride", [100, 110, 118]),
          ...sessionsFor("estagnado", [100, 98, 100]),
        ],
      },
      TODAY
    );
    expect(result[0].id).toBe("estagnado");
    expect(result[0].reasons).toContain("BPM estagnado nas últimas sessões");
    expect(result[0].reasons).toContain("BPM 100 abaixo do alvo 120");
  });

  it("arquivado NUNCA é sugerido", () => {
    const result = suggestPractice(
      {
        appProgress: [],
        exercises: [diaryExercise({ archived: true })],
        sessions: [],
      },
      TODAY
    );
    expect(result).toHaveLength(0);
  });

  it("sessões sem nota não geram reason de avaliação (média só com dados)", () => {
    const result = suggestPractice(
      {
        appProgress: [],
        exercises: [diaryExercise()],
        sessions: [session({ bpm: 100 })],
      },
      TODAY
    );
    expect(result[0].reasons.some((r) => r.includes("avaliação"))).toBe(false);
  });
});

describe("ranking combinado e determinismo", () => {
  it("mistura app e diário num ranking único; empates têm ordem estável (source, id)", () => {
    const zeroApp = (id: string) => appRecord({ exerciseId: id }); // score 0
    const first = suggestPractice(
      { appProgress: [zeroApp("b"), zeroApp("a")], exercises: [], sessions: [] },
      TODAY
    );
    const second = suggestPractice(
      { appProgress: [zeroApp("a"), zeroApp("b")], exercises: [], sessions: [] },
      TODAY
    );
    expect(first.map((s) => s.id)).toEqual(["a", "b"]); // empate → id asc
    expect(second.map((s) => s.id)).toEqual(["a", "b"]); // independe da ordem de entrada
  });

  it("limit corta o ranking depois de ordenar", () => {
    const result = suggestPractice(
      {
        appProgress: [
          appRecord({ exerciseId: "forte", bestRatio: 1 }),
          appRecord({ exerciseId: "fraco", bestRatio: 0.2, passed: false }),
        ],
        exercises: [],
        sessions: [],
      },
      TODAY,
      1
    );
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("fraco");
  });

  it("aceita estruturalmente os registros dos módulos db (sem conversão)", () => {
    // Simula o shape completo devolvido por exercise-progress/practice-diary — campos
    // extras não atrapalham (subconjunto estrutural).
    const fullProgressRecord = {
      kind: "tap" as const,
      exerciseId: "l1",
      bestRatio: 0.5,
      ratioSum: 1.5,
      ratioCount: 3,
      passed: false,
      attemptsCount: 3,
      lastAttemptedAt: "2026-07-01T00:00:00.000Z",
    };
    const fullExercise = {
      id: "ex-1",
      name: "Groove",
      category: "ritmo",
      complexity: 3,
      targetBpm: 100,
      archived: false,
      createdAt: "2026-07-01T00:00:00.000Z",
    };
    const fullSession = {
      id: "s1",
      exerciseId: "ex-1",
      practicedOn: "2026-07-10",
      bpm: 80,
      durationMin: 20,
      rating: 3,
      note: "",
      createdAt: "2026-07-10T00:00:00.000Z",
    };
    const result = suggestPractice(
      { appProgress: [fullProgressRecord], exercises: [fullExercise], sessions: [fullSession] },
      TODAY
    );
    expect(result).toHaveLength(2);
  });
});

describe("helpers de UI (5b)", () => {
  function suggestion(overrides: Partial<PracticeSuggestion> = {}): PracticeSuggestion {
    return { source: "app", id: "l1-seminimas", kind: "tap", label: "x", score: 10, reasons: [], ...overrides };
  }

  it("suggestionKey compõe source:id (namespaces distintos não colidem)", () => {
    expect(suggestionKey({ source: "app", id: "l1-seminimas" })).toBe("app:l1-seminimas");
    expect(suggestionKey({ source: "diary", id: "l1-seminimas" })).toBe("diary:l1-seminimas");
  });

  it("filterDismissed remove só os dispensados, preservando o resto", () => {
    const list = [
      suggestion({ source: "app", id: "a" }),
      suggestion({ source: "diary", id: "a" }),
      suggestion({ source: "app", id: "b" }),
    ];
    const dismissed = new Set(["app:a"]);
    const kept = filterDismissed(list, dismissed);
    expect(kept.map(suggestionKey)).toEqual(["diary:a", "app:b"]);
  });

  it("resolveSuggestionTarget: app/tap → reading com levelId", () => {
    expect(resolveSuggestionTarget({ source: "app", id: "l3-semibreves", kind: "tap" })).toEqual({
      type: "reading",
      mode: "tap",
      levelId: "l3-semibreves",
    });
  });

  it("resolveSuggestionTarget: diary → log-diary com exerciseId", () => {
    expect(resolveSuggestionTarget({ source: "diary", id: "uuid-1", kind: undefined })).toEqual({
      type: "log-diary",
      exerciseId: "uuid-1",
    });
  });

  it("resolveSuggestionTarget: app kind sem níveis (timed futuro) → reading sem levelId", () => {
    expect(resolveSuggestionTarget({ source: "app", id: "t1", kind: "timed" })).toEqual({
      type: "reading",
      mode: "timed",
    });
  });
});
