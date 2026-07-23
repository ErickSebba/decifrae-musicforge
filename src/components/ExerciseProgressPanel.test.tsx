import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { ExerciseProgressPanel } from "./ExerciseProgressPanel";
import { getExerciseProgress, getPracticeDays, localDayString } from "../db/exercise-progress";
import { getSessions } from "../db/practice-diary";
import type { ExerciseProgressRecord } from "../db/exercise-progress";

// Recharts real precisa medir DOM (ResponsiveContainer) — jsdom não mede. Stub expõe
// os DADOS passados pro gráfico, que é o que interessa afirmar.
vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  BarChart: ({ data, children }: { data: unknown; children: ReactNode }) => (
    <div data-testid="barchart" data-chart={JSON.stringify(data)}>
      {children}
    </div>
  ),
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  Legend: () => null,
  CartesianGrid: () => null,
  ReferenceLine: () => null,
}));

// Módulos de acesso mockados (padrão dos testes de tela do marco).
vi.mock("../db/exercise-progress", async (importOriginal) => {
  // localDayString e averageRatio são PUROS — usa os reais; só o I/O é mockado.
  const original = await importOriginal<typeof import("../db/exercise-progress")>();
  return {
    ...original,
    getExerciseProgress: vi.fn(),
    getPracticeDays: vi.fn(),
  };
});
vi.mock("../db/practice-diary", () => ({
  getSessions: vi.fn(),
}));

function record(overrides: Partial<ExerciseProgressRecord> = {}): ExerciseProgressRecord {
  return {
    kind: "tap",
    exerciseId: "l1-seminimas",
    bestRatio: 0.9,
    ratioSum: 1.7,
    ratioCount: 2,
    passed: true,
    attemptsCount: 4,
    lastAttemptedAt: new Date().toISOString(),
    ...overrides,
  };
}

async function renderAndWait(opts?: {
  records?: ExerciseProgressRecord[];
  days?: { day: string; kind: "tap"; count: number }[];
  sessions?: { practicedOn: string }[];
}) {
  vi.mocked(getExerciseProgress).mockResolvedValue(opts?.records ?? []);
  vi.mocked(getPracticeDays).mockResolvedValue(opts?.days ?? []);
  vi.mocked(getSessions).mockResolvedValue((opts?.sessions ?? []) as never);
  render(<ExerciseProgressPanel />);
  await screen.findByText("Frequência de prática"); // carga assíncrona resolveu
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("tabela por exercício", () => {
  it("mostra nome legível do CURATED_LEVELS, na ordem dos níveis", async () => {
    await renderAndWait({
      records: [
        record({ exerciseId: "l4-pausas", bestRatio: 0.7, passed: false }),
        record({ exerciseId: "l1-seminimas" }),
      ],
    });

    const rows = screen.getAllByRole("row").slice(1); // pula o header
    expect(within(rows[0]).getByText("Semínimas")).toBeInTheDocument(); // l1 antes de l4
    expect(within(rows[1]).getByText("Com pausas")).toBeInTheDocument();
  });

  it("média de linha migrada (ratioCount=0) exibe '—', nunca 0%", async () => {
    await renderAndWait({
      records: [record({ ratioSum: 0, ratioCount: 0, bestRatio: 0.85 })],
    });

    const row = screen.getAllByRole("row")[1];
    expect(within(row).getByText("—")).toBeInTheDocument();
    expect(within(row).getByText("85%")).toBeInTheDocument();
    expect(within(row).queryByText("0%")).not.toBeInTheDocument();
  });

  it("id órfão (sem nível no catálogo) renderiza o id cru sem quebrar e sem badge de estagnado", async () => {
    await renderAndWait({
      records: [
        record({
          exerciseId: "l6-colcheias-pausas", // órfão pré-3c-1 registrado no CONTEXTO
          passed: false,
          attemptsCount: 10,
        }),
      ],
    });

    expect(screen.getByText("l6-colcheias-pausas")).toBeInTheDocument();
    expect(screen.queryByText("estagnado")).not.toBeInTheDocument();
  });

  it("badges: estagnado (5+ tentativas sem aprovar) e parado (14+ dias)", async () => {
    const oldDate = new Date(Date.now() - 30 * 86_400_000).toISOString();
    await renderAndWait({
      records: [
        record({ exerciseId: "l2-minimas", passed: false, attemptsCount: 6 }),
        record({ exerciseId: "l3-semibreves", lastAttemptedAt: oldDate }),
      ],
    });

    expect(screen.getByText("estagnado")).toBeInTheDocument();
    expect(screen.getByText("parado")).toBeInTheDocument();
  });
});

describe("gráfico (Recharts mockado)", () => {
  it("recebe melhor/média em %; média null preservada como null", async () => {
    await renderAndWait({
      records: [
        record({ bestRatio: 0.9, ratioSum: 1.6, ratioCount: 2 }),
        record({ exerciseId: "l2-minimas", ratioSum: 0, ratioCount: 0, bestRatio: 0.5 }),
      ],
    });

    const chart = JSON.parse(screen.getByTestId("barchart").dataset.chart!);
    expect(chart).toEqual([
      { name: "Semínimas", melhor: 90, media: 80 },
      { name: "Semínimas e mínimas", melhor: 50, media: null },
    ]);
  });

  it("sem exercícios, o gráfico não renderiza", async () => {
    await renderAndWait();
    expect(screen.queryByTestId("barchart")).not.toBeInTheDocument();
  });
});

describe("heatmap", () => {
  it("faz o merge das duas fontes sem duplicar o dia", async () => {
    const today = localDayString(new Date());
    await renderAndWait({
      records: [record()],
      days: [{ day: today, kind: "tap", count: 3 }],
      sessions: [{ practicedOn: today }, { practicedOn: today }],
    });

    const cell = screen
      .getByTestId("heatmap")
      .querySelector(`[data-day="${today}"]`) as HTMLElement;
    expect(cell.dataset.count).toBe("5"); // 3 do app + 2 sessões do diário
  });

  it("estado 100% vazio: grade completa renderizada + mensagens, nada quebra", async () => {
    await renderAndWait();

    expect(screen.getByText(/Nenhum exercício praticado ainda/)).toBeInTheDocument();
    expect(screen.getByText(/Nenhuma prática registrada ainda/)).toBeInTheDocument();
    // Grade presente mesmo sem dado (células com contagem 0).
    const cells = screen.getByTestId("heatmap").querySelectorAll("[data-day]");
    expect(cells.length).toBeGreaterThan(70); // ~12 semanas × 7 menos dias futuros
  });
});

describe("stats compactos", () => {
  it("conta exercícios, tentativas e dias com prática", async () => {
    await renderAndWait({
      records: [record({ attemptsCount: 4 }), record({ exerciseId: "l2-minimas", attemptsCount: 3 })],
      days: [
        { day: "2026-07-20", kind: "tap", count: 5 },
        { day: "2026-07-21", kind: "tap", count: 2 },
      ],
    });

    expect(screen.getByText("Tentativas totais").nextElementSibling?.textContent).toBe("7");
    expect(screen.getByText("Dias com prática").nextElementSibling?.textContent).toBe("2");
    expect(screen.getByText("Exercícios praticados").nextElementSibling?.textContent).toBe("2");
  });
});
