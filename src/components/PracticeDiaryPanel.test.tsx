import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PracticeDiaryPanel } from "./PracticeDiaryPanel";
import {
  addSession,
  archiveExercise,
  createExercise,
  deleteSession,
  getExercises,
  getSessions,
} from "../db/practice-diary";
import type { Exercise, PracticeSession } from "../db/practice-diary";

// localDayString é PURO — reaproveitado; só o I/O do módulo é mockado.
// SuggestionsPanel (5b) é montado no topo — testado à parte; stub mantém o foco.
vi.mock("./SuggestionsPanel", () => ({ SuggestionsPanel: () => null }));

vi.mock("../db/practice-diary", async (importOriginal) => {
  const original = await importOriginal<typeof import("../db/practice-diary")>();
  return {
    ...original,
    getExercises: vi.fn(),
    getSessions: vi.fn(),
    createExercise: vi.fn(),
    updateExercise: vi.fn(),
    archiveExercise: vi.fn(),
    addSession: vi.fn(),
    deleteSession: vi.fn(),
  };
});

function exercise(overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: "ex-1",
    name: "Walking bass",
    category: "groove",
    complexity: 3,
    targetBpm: 120,
    archived: false,
    createdAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

function session(overrides: Partial<PracticeSession> = {}): PracticeSession {
  return {
    id: "s-1",
    exerciseId: "ex-1",
    practicedOn: "2026-07-22",
    bpm: 100,
    durationMin: 15,
    rating: 4,
    note: "",
    createdAt: "2026-07-22T10:00:00.000Z",
    ...overrides,
  };
}

async function renderAndWait(opts?: { exercises?: Exercise[]; sessions?: PracticeSession[] }) {
  vi.mocked(getExercises).mockResolvedValue(opts?.exercises ?? []);
  vi.mocked(getSessions).mockResolvedValue(opts?.sessions ?? []);
  render(<PracticeDiaryPanel />);
  await screen.findByText("Registrar sessão");
}

beforeEach(() => {
  // resetAllMocks (não clearAllMocks) esvazia a fila de mockResolvedValueOnce — sem isso,
  // um Once não consumido por teste que falhou cedo vazaria pro teste seguinte.
  vi.resetAllMocks();
  vi.mocked(createExercise).mockResolvedValue(exercise());
  vi.mocked(archiveExercise).mockResolvedValue(undefined);
  vi.mocked(addSession).mockResolvedValue(session());
  vi.mocked(deleteSession).mockResolvedValue(undefined);
});

describe("estado vazio", () => {
  it("sem exercícios, convida a cadastrar e não quebra a seção de sessão", async () => {
    await renderAndWait();
    expect(screen.getByText(/Cadastre seu primeiro exercício/)).toBeInTheDocument();
    expect(screen.getByText(/Cadastre um exercício acima/)).toBeInTheDocument();
  });
});

describe("cadastro de exercício", () => {
  it("cadastra com nome/categoria/complexity/targetBpm corretos", async () => {
    await renderAndWait();
    fireEvent.click(screen.getByRole("button", { name: "Novo exercício" }));

    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Escala maior" } });
    fireEvent.change(screen.getByLabelText("Categoria"), { target: { value: "escalas" } });
    fireEvent.change(screen.getByLabelText(/Complexidade/), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText(/BPM-alvo/), { target: { value: "90" } });
    fireEvent.click(screen.getByRole("button", { name: "Cadastrar" }));

    await waitFor(() =>
      expect(createExercise).toHaveBeenCalledWith({
        name: "Escala maior",
        category: "escalas",
        complexity: 4,
        targetBpm: 90,
      })
    );
  });

  it("BPM-alvo vazio vira null, não 0", async () => {
    await renderAndWait();
    fireEvent.click(screen.getByRole("button", { name: "Novo exercício" }));
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Groove" } });
    fireEvent.click(screen.getByRole("button", { name: "Cadastrar" }));

    await waitFor(() => expect(createExercise).toHaveBeenCalled());
    expect(vi.mocked(createExercise).mock.calls[0][0].targetBpm).toBeNull();
  });
});

describe("arquivar", () => {
  it("arquiva o exercício e a lista recarrega sem ele", async () => {
    vi.mocked(getExercises)
      .mockResolvedValueOnce([exercise()]) // carga inicial
      .mockResolvedValueOnce([exercise({ archived: true })]); // após reload
    vi.mocked(getSessions).mockResolvedValue([]);
    render(<PracticeDiaryPanel />);
    // "Walking bass" aparece no card E na <option> do seletor de sessão — o botão
    // Arquivar é o alvo único do card não-arquivado.
    await screen.findByRole("button", { name: "Arquivar" });

    fireEvent.click(screen.getByRole("button", { name: "Arquivar" }));

    expect(archiveExercise).toHaveBeenCalledWith("ex-1");
    // Arquivado + showArchived=false: o card (e seu botão) somem.
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Arquivar" })).not.toBeInTheDocument()
    );
    // toggle "mostrar arquivados" traz o card de volta (agora sem seletor de sessão,
    // pois não há exercício ativo → nome aparece só no card).
    fireEvent.click(screen.getByLabelText(/Mostrar arquivados/));
    expect(screen.getByText("Walking bass")).toBeInTheDocument();
  });
});

describe("registrar sessão", () => {
  it("campos opcionais vazios viram NULL (não 0) e practicedOn default = hoje local", async () => {
    await renderAndWait({ exercises: [exercise()] });

    fireEvent.change(screen.getByLabelText("Exercício"), { target: { value: "ex-1" } });
    // BPM, duração, rating, nota deixados vazios
    fireEvent.click(screen.getByRole("button", { name: "Registrar" }));

    await waitFor(() => expect(addSession).toHaveBeenCalled());
    const arg = vi.mocked(addSession).mock.calls[0][0];
    expect(arg.exerciseId).toBe("ex-1");
    expect(arg.bpm).toBeNull();
    expect(arg.durationMin).toBeNull();
    expect(arg.rating).toBeNull();
    expect(arg.practicedOn).toBeUndefined(); // default = hoje, resolvido no módulo
  });

  it("backdating: data explícita é enviada", async () => {
    await renderAndWait({ exercises: [exercise()] });
    fireEvent.change(screen.getByLabelText("Exercício"), { target: { value: "ex-1" } });
    fireEvent.change(screen.getByLabelText("Data"), { target: { value: "2026-07-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Registrar" }));

    await waitFor(() => expect(addSession).toHaveBeenCalled());
    expect(vi.mocked(addSession).mock.calls[0][0].practicedOn).toBe("2026-07-01");
  });

  it("estrelas: clicar 3 envia rating 3", async () => {
    await renderAndWait({ exercises: [exercise()] });
    fireEvent.change(screen.getByLabelText("Exercício"), { target: { value: "ex-1" } });
    fireEvent.click(screen.getByRole("button", { name: "3 estrelas" }));
    fireEvent.click(screen.getByRole("button", { name: "Registrar" }));

    await waitFor(() => expect(addSession).toHaveBeenCalled());
    expect(vi.mocked(addSession).mock.calls[0][0].rating).toBe(3);
  });

  it("erro de negócio (exercício arquivado) mostra mensagem, não estoura", async () => {
    vi.mocked(addSession).mockRejectedValue(new Error("Exercício arquivado não aceita sessão nova: X"));
    await renderAndWait({ exercises: [exercise()] });

    fireEvent.change(screen.getByLabelText("Exercício"), { target: { value: "ex-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Registrar" }));

    expect(await screen.findByText(/arquivado não aceita sessão nova/)).toBeInTheDocument();
  });
});

describe("resumo agregado por card", () => {
  it("mostra recorde de BPM e última prática derivados das sessões", async () => {
    await renderAndWait({
      exercises: [exercise()],
      sessions: [
        session({ id: "s1", bpm: 100, practicedOn: "2026-07-20" }),
        session({ id: "s2", bpm: 130, practicedOn: "2026-07-22" }),
      ],
    });

    expect(screen.getByText(/recorde 130 BPM/)).toBeInTheDocument();
    expect(screen.getByText(/última 2026-07-22/)).toBeInTheDocument();
  });
});

describe("excluir sessão", () => {
  it("confirmação inline → deleteSession + reload some a linha", async () => {
    vi.mocked(getExercises).mockResolvedValue([exercise()]);
    vi.mocked(getSessions)
      .mockResolvedValueOnce([session({ id: "s-1" })]) // carga inicial
      .mockResolvedValueOnce([]); // após deletar
    render(<PracticeDiaryPanel />);
    await screen.findByText("Sessões registradas");

    fireEvent.click(screen.getByRole("button", { name: "Excluir" }));
    fireEvent.click(screen.getByRole("button", { name: "Sim" })); // confirma

    expect(deleteSession).toHaveBeenCalledWith("s-1");
    await waitFor(() =>
      expect(screen.queryByText("Sessões registradas")).not.toBeInTheDocument()
    );
  });
});
