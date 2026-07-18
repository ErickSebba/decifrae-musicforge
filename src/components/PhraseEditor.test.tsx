import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { forwardRef } from "react";
import { PhraseEditor } from "./PhraseEditor";
import { useAppStore } from "../store/useAppStore";
import { playTone } from "../engine/audio-engine";

// AlphaTab não roda no jsdom — stub expõe o tex (mesmo padrão dos testes da página).
vi.mock("./RhythmStaff", () => ({
  RhythmStaff: forwardRef<HTMLDivElement, { tex: string }>(function RhythmStaffStub(
    { tex },
    _ref
  ) {
    return <div data-testid="staff">{tex}</div>;
  }),
}));

// Web Audio ausente no jsdom (Fretboard + useScalePlayback).
vi.mock("../engine/audio-engine", () => ({
  playNoteByName: vi.fn(),
  playTone: vi.fn(() => ({ stop: vi.fn() })),
  noteToFrequency: vi.fn(() => 440),
  audioContextTime: vi.fn(() => 0),
}));

beforeEach(() => {
  vi.clearAllMocks();
  useAppStore.setState({ clef: "F" });
});

function addStep() {
  fireEvent.click(screen.getByRole("button", { name: "+ Passo" }));
}

function clickFret(label: string) {
  fireEvent.click(screen.getByRole("button", { name: label }));
}

describe("PhraseEditor — grade de passos", () => {
  it("adicionar passos cria chips pendentes (?) já selecionando o novo passo", () => {
    render(<PhraseEditor />);
    addStep();
    addStep();

    expect(screen.getByRole("button", { name: "Passo 1" })).toBeInTheDocument();
    const step2 = screen.getByRole("button", { name: "Passo 2" });
    expect(within(step2).getByText("?")).toBeInTheDocument();
  });

  it("clicar no braço grava a nota do passo selecionado (nome no chip como confirmação)", () => {
    render(<PhraseEditor />);
    addStep();
    clickFret("E1 traste 5 — A1");

    expect(within(screen.getByRole("button", { name: "Passo 1" })).getByText("A1")).toBeInTheDocument();
    expect(screen.getByTestId("staff").textContent).toContain(":4 a2"); // escrita = soante + 1
  });

  it("mudar a duração pra pausa limpa a nota e o clique no braço não grava em pausa", () => {
    render(<PhraseEditor />);
    addStep();
    clickFret("E1 traste 5 — A1");
    fireEvent.click(screen.getByRole("button", { name: "pausa de semínima" }));

    const chip = screen.getByRole("button", { name: "Passo 1" });
    expect(within(chip).getByText("pausa")).toBeInTheDocument();

    clickFret("E1 traste 5 — A1"); // toca o som, mas não vira nota do passo-pausa
    expect(within(chip).getByText("pausa")).toBeInTheDocument();
    expect(screen.getByTestId("staff").textContent).toContain(":4 r");
  });

  it("remover passo do meio mantém o estado dos demais consistente", () => {
    render(<PhraseEditor />);
    addStep();
    clickFret("E1 traste 5 — A1"); // passo 1 = A1
    addStep();
    clickFret("A1 traste 3 — C2"); // passo 2 = C2
    addStep();
    clickFret("D2 traste 2 — E2"); // passo 3 = E2

    fireEvent.click(screen.getByRole("button", { name: "Remover passo 2" }));

    expect(screen.queryByRole("button", { name: "Passo 3" })).not.toBeInTheDocument();
    expect(within(screen.getByRole("button", { name: "Passo 1" })).getByText("A1")).toBeInTheDocument();
    expect(within(screen.getByRole("button", { name: "Passo 2" })).getByText("E2")).toBeInTheDocument();
    expect(screen.getByTestId("staff").textContent).not.toContain("c3"); // C2 escrita saiu
  });
});

describe("PhraseEditor — playback", () => {
  it("Tocar agenda tom só pros passos com nota (pausa em silêncio) e vira Parar", () => {
    render(<PhraseEditor />);
    addStep();
    clickFret("E1 traste 5 — A1");
    addStep();
    fireEvent.click(screen.getByRole("button", { name: "pausa de semínima" }));

    fireEvent.click(screen.getByRole("button", { name: "Tocar" }));

    expect(playTone).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Parar" })).toBeInTheDocument();
  });

  it("frase vazia: Tocar não trava nem crasha (silêncio é resultado válido)", () => {
    render(<PhraseEditor />);
    expect(screen.getByText(/frase está vazia/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Tocar" }));
    expect(playTone).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Parar" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Parar" }));
    expect(screen.getByRole("button", { name: "Tocar" })).toBeInTheDocument();
  });

  it("editar durante o playback para o playback (nunca dois sobrepostos)", () => {
    render(<PhraseEditor />);
    addStep();
    clickFret("E1 traste 5 — A1");
    fireEvent.click(screen.getByRole("button", { name: "Tocar" }));
    expect(screen.getByRole("button", { name: "Parar" })).toBeInTheDocument();

    addStep(); // edição durante playback

    expect(screen.getByRole("button", { name: "Tocar" })).toBeInTheDocument();
  });
});
