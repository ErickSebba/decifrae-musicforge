import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ContentReviewCenter } from "./ContentReviewCenter";
import { getContentEntries, updateContentEntryReview } from "../db/content-entries";
import type { ContentEntry } from "../engine/theory-engine";

// Padrão dos testes de tela: o módulo de acesso (SQLite) é mockado; a tela é UI pura.
vi.mock("../db/content-entries", () => ({
  getContentEntries: vi.fn(),
  updateContentEntryReview: vi.fn(),
}));

function entry(overrides: Partial<ContentEntry> = {}): ContentEntry {
  return {
    id: "theory-major",
    topic: "major",
    title: "Escala Maior",
    body: "**Fórmula intervalar:**\nT - T - st - T - T - T - st",
    reviewStatus: "confirmado",
    note: "",
    createdAt: "2026-07-09T00:00:00.000Z",
    ...overrides,
  };
}

const ENTRIES: ContentEntry[] = [
  entry(),
  entry({ id: "theory-blues", topic: "blues", title: "Escala Blues", reviewStatus: "nao_revisado" }),
];

async function renderAndWait(entries: ContentEntry[] = ENTRIES) {
  vi.mocked(getContentEntries).mockResolvedValue(entries);
  render(<ContentReviewCenter />);
  // Espera a carga assíncrona resolver (guard de corrida no effect).
  if (entries.length > 0) await screen.findByText(entries[0].title);
  else await screen.findByText("Nenhum conteúdo registrado.");
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(updateContentEntryReview).mockResolvedValue(undefined);
});

describe("listagem", () => {
  it("renderiza título e chip de status de cada entrada", async () => {
    await renderAndWait();

    const list = within(screen.getByRole("navigation", { name: /Entradas/ }));
    expect(list.getByText("Escala Maior")).toBeInTheDocument();
    expect(list.getByText("Escala Blues")).toBeInTheDocument();
    expect(list.getByText("Confirmado")).toBeInTheDocument();
    expect(list.getByText("Não revisado")).toBeInTheDocument();
  });

  it("lista vazia mostra mensagem e não quebra", async () => {
    await renderAndWait([]);
    expect(screen.getByText("Nenhum conteúdo registrado.")).toBeInTheDocument();
  });
});

describe("detalhe", () => {
  it("sem seleção mostra a dica; selecionar exibe o BODY persistido cru", async () => {
    await renderAndWait();
    expect(screen.getByText(/Selecione uma entrada/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Escala Maior/ }));
    expect(screen.getByText(/\*\*Fórmula intervalar:\*\*/)).toBeInTheDocument();
    expect(screen.getByText(/topic: major/)).toBeInTheDocument();
  });
});

describe("salvar revisão", () => {
  it("trocar status pra 'Contém erro' + Salvar chama o CRUD com os argumentos certos e atualiza o chip", async () => {
    await renderAndWait();
    fireEvent.click(screen.getByRole("button", { name: /Escala Maior/ }));

    const detail = within(screen.getByRole("article"));
    fireEvent.click(detail.getByRole("button", { name: "Contém erro" }));
    fireEvent.click(detail.getByRole("button", { name: "Salvar" }));

    expect(updateContentEntryReview).toHaveBeenCalledWith("theory-major", "contem_erro", "");

    // Chip da LISTA reflete o novo status (update local, sem re-fetch).
    const list = within(screen.getByRole("navigation", { name: /Entradas/ }));
    expect(await list.findByText("Contém erro")).toBeInTheDocument();
    expect(getContentEntries).toHaveBeenCalledTimes(1);
  });

  it("editar observação + Salvar envia a note", async () => {
    await renderAndWait();
    fireEvent.click(screen.getByRole("button", { name: /Escala Blues/ }));

    fireEvent.change(screen.getByLabelText("Observação"), {
      target: { value: "conferir blue note no Ariane Cap" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));

    expect(updateContentEntryReview).toHaveBeenCalledWith(
      "theory-blues",
      "nao_revisado",
      "conferir blue note no Ariane Cap"
    );
  });

  it("feedback 'Salvo ✓' aparece após salvar e some ao editar de novo", async () => {
    await renderAndWait();
    fireEvent.click(screen.getByRole("button", { name: /Escala Maior/ }));
    fireEvent.change(screen.getByLabelText("Observação"), { target: { value: "ok" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await screen.findByText("Salvo ✓")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Observação"), { target: { value: "ok!" } });
    expect(screen.queryByText("Salvo ✓")).not.toBeInTheDocument();
  });

  it("Salvar fica desabilitado sem edição (não-sujo) e não chama o CRUD", async () => {
    await renderAndWait();
    fireEvent.click(screen.getByRole("button", { name: /Escala Maior/ }));

    const saveButton = screen.getByRole("button", { name: "Salvar" });
    expect(saveButton).toBeDisabled();
    fireEvent.click(saveButton);
    expect(updateContentEntryReview).not.toHaveBeenCalled();
  });

  it("erro no CRUD mostra mensagem de erro em vez do 'Salvo'", async () => {
    vi.mocked(updateContentEntryReview).mockRejectedValue(new Error("boom"));
    await renderAndWait();
    fireEvent.click(screen.getByRole("button", { name: /Escala Maior/ }));
    fireEvent.change(screen.getByLabelText("Observação"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await screen.findByText(/Erro ao salvar/)).toBeInTheDocument();
    expect(screen.queryByText("Salvo ✓")).not.toBeInTheDocument();
  });

  it("trocar de seleção descarta edição não salva (estado reinicia da entrada)", async () => {
    await renderAndWait();
    fireEvent.click(screen.getByRole("button", { name: /Escala Maior/ }));
    fireEvent.change(screen.getByLabelText("Observação"), { target: { value: "rascunho" } });

    fireEvent.click(screen.getByRole("button", { name: /Escala Blues/ }));
    fireEvent.click(screen.getByRole("button", { name: /Escala Maior/ }));

    expect(screen.getByLabelText("Observação")).toHaveValue(""); // note original, não o rascunho
  });
});
