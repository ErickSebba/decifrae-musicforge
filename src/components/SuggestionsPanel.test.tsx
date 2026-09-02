import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SuggestionsPanel } from "./SuggestionsPanel";
import { getExerciseProgress } from "../db/exercise-progress";
import { getExercises, getSessions } from "../db/practice-diary";
import { useAppStore } from "../store/useAppStore";
import type { ExerciseProgressRecord } from "../db/exercise-progress";
import type { Exercise } from "../db/practice-diary";

// Módulos de acesso mockados (padrão do marco). Store e engine (levels/practice-suggestion)
// são REAIS — o teste verifica a integração de ponta (nome resolvido, roteamento, dispensa).
vi.mock("../db/exercise-progress", () => ({ getExerciseProgress: vi.fn() }));
vi.mock("../db/practice-diary", () => ({ getExercises: vi.fn(), getSessions: vi.fn() }));

function appRecord(overrides: Partial<ExerciseProgressRecord> = {}): ExerciseProgressRecord {
  return {
    kind: "tap",
    exerciseId: "l1-seminimas",
    bestRatio: 0.4, // fraco → pontua
    ratioSum: 0.4,
    ratioCount: 1,
    passed: false,
    attemptsCount: 3,
    lastAttemptedAt: "2026-06-01T00:00:00.000Z",
    ...overrides,
  };
}

function diaryExercise(overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: "ex-uuid-1",
    name: "Walking bass",
    category: "groove",
    complexity: 3,
    targetBpm: 120,
    archived: false,
    createdAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

async function renderAndWait(opts?: {
  progress?: ExerciseProgressRecord[];
  exercises?: Exercise[];
  sessions?: never[];
}) {
  vi.mocked(getExerciseProgress).mockResolvedValue(opts?.progress ?? []);
  vi.mocked(getExercises).mockResolvedValue(opts?.exercises ?? []);
  vi.mocked(getSessions).mockResolvedValue(opts?.sessions ?? []);
  render(<SuggestionsPanel />);
  await screen.findByText("Sugestão de prática");
}

beforeEach(() => {
  vi.clearAllMocks();
  // Reset do estado de sessão da store entre testes.
  useAppStore.setState({
    activeModule: "reading",
    readingTarget: null,
    diaryPrefillExerciseId: null,
    dismissedSuggestions: new Set<string>(),
  });
});

// Não deixar intenções de navegação setadas pra um vizinho (store é singleton do módulo).
afterEach(() => {
  useAppStore.setState({ readingTarget: null, diaryPrefillExerciseId: null });
});

describe("listagem", () => {
  it("resolve o nome (app → nível do CURATED_LEVELS; diary → nome) e mostra reasons", async () => {
    await renderAndWait({ progress: [appRecord()], exercises: [diaryExercise()] });

    // app: l1-seminimas → "Semínimas" (nome real do catálogo)
    expect(await screen.findByText("Semínimas")).toBeInTheDocument();
    // diary: nome do exercício + reason "nunca praticado" (sem sessões)
    expect(screen.getByText("Walking bass")).toBeInTheDocument();
    expect(screen.getByText(/nunca praticado/)).toBeInTheDocument();
  });

  it("estado vazio (sem candidatos) é apresentável", async () => {
    await renderAndWait();
    expect(screen.getByText(/Nada a sugerir agora/)).toBeInTheDocument();
  });
});

describe("roteamento do clique", () => {
  it("sugestão diary → setActiveModule('practice') + diaryPrefillExerciseId", async () => {
    await renderAndWait({ exercises: [diaryExercise()] });

    fireEvent.click(screen.getByRole("button", { name: "Registrar sessão" }));

    const state = useAppStore.getState();
    expect(state.activeModule).toBe("practice");
    expect(state.diaryPrefillExerciseId).toBe("ex-uuid-1");
  });

  it("sugestão app/tap → setActiveModule('reading') + readingTarget tap+levelId", async () => {
    await renderAndWait({ progress: [appRecord({ exerciseId: "l3-semibreves" })] });

    fireEvent.click(screen.getByRole("button", { name: "Praticar" }));

    const state = useAppStore.getState();
    expect(state.activeModule).toBe("reading");
    expect(state.readingTarget).toEqual({ mode: "tap", levelId: "l3-semibreves" });
  });
});

describe("dispensar", () => {
  it("remove da lista e não volta (memória de sessão na store)", async () => {
    await renderAndWait({ exercises: [diaryExercise()] });
    expect(screen.getByText("Walking bass")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Dispensar Walking bass/ }));

    expect(screen.queryByText("Walking bass")).not.toBeInTheDocument();
    // a chave ficou registrada como dispensada na store
    expect(useAppStore.getState().dismissedSuggestions.has("diary:ex-uuid-1")).toBe(true);
  });
});
