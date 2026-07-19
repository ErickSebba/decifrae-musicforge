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
  useAppStore.setState({ clef: "F", staveDisplay: "score" });
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

  it("pausa limpa a nota do passo; clique no braço não grava em passo-pausa", () => {
    render(<PhraseEditor />);
    addStep();
    clickFret("E1 traste 5 — A1"); // grava A1 e avança
    fireEvent.click(screen.getByRole("button", { name: "Passo 1" })); // volta pro passo com nota
    fireEvent.click(screen.getByRole("button", { name: "pausa de semínima" })); // limpa e avança

    const chip = screen.getByRole("button", { name: "Passo 1" });
    expect(within(chip).getByText("pausa")).toBeInTheDocument();

    fireEvent.click(chip); // re-seleciona o passo-pausa
    clickFret("E1 traste 5 — A1"); // toca o som, mas não vira nota do passo-pausa
    expect(within(chip).getByText("pausa")).toBeInTheDocument();
    expect(screen.getByTestId("staff").textContent).toContain(":4 r");
  });

  it("remover passo do meio mantém o estado dos demais consistente", () => {
    render(<PhraseEditor />);
    addStep();
    clickFret("E1 traste 5 — A1"); // passo 1 = A1, cria passo 2
    clickFret("A1 traste 3 — C2"); // passo 2 = C2, cria passo 3
    clickFret("D2 traste 2 — E2"); // passo 3 = E2, cria passo 4 pendente

    fireEvent.click(screen.getByRole("button", { name: "Remover passo 2" }));

    expect(screen.getAllByRole("button", { name: /^Passo \d+$/ })).toHaveLength(3); // A1, E2, ?
    expect(within(screen.getByRole("button", { name: "Passo 1" })).getByText("A1")).toBeInTheDocument();
    expect(within(screen.getByRole("button", { name: "Passo 2" })).getByText("E2")).toBeInTheDocument();
    expect(screen.getByTestId("staff").textContent).not.toContain("c3"); // C2 escrita saiu
  });
});

describe("PhraseEditor — 2.5b: avanço automático, mover e inserir", () => {
  it("duração de nota aplica e PERMANECE no passo (o avanço acontece na escolha da nota)", () => {
    render(<PhraseEditor />);
    addStep();
    fireEvent.click(screen.getByRole("button", { name: "colcheia" }));

    expect(screen.getByText("Duração do passo 1:")).toBeInTheDocument(); // não avançou
    expect(screen.getAllByRole("button", { name: /^Passo \d+$/ })).toHaveLength(1); // não criou passo
  });

  it("escolher a nota avança criando o próximo passo com a MESMA duração (fluxo contínuo)", () => {
    render(<PhraseEditor />);
    addStep();
    fireEvent.click(screen.getByRole("button", { name: "colcheia" }));
    clickFret("E1 traste 5 — A1"); // grava A1 colcheia e avança

    const step2 = screen.getByRole("button", { name: "Passo 2" });
    expect(within(step2).getByText("colcheia")).toBeInTheDocument(); // herdou a duração
    expect(within(step2).getByText("?")).toBeInTheDocument();
    expect(screen.getByText("Duração do passo 2:")).toBeInTheDocument();

    clickFret("A1 traste 3 — C2"); // segue o fluxo sem re-escolher a figura
    expect(screen.getByTestId("staff").textContent).toContain(":8 a2 :8 c3");
  });

  it("pausa completa o passo e avança; o novo passo herda a última duração de NOTA", () => {
    render(<PhraseEditor />);
    addStep();
    fireEvent.click(screen.getByRole("button", { name: "colcheia" }));
    clickFret("E1 traste 5 — A1"); // passo 1 = A1 colcheia; passo 2 colcheia pendente
    fireEvent.click(screen.getByRole("button", { name: "pausa de semínima" })); // passo 2 vira pausa

    const step3 = screen.getByRole("button", { name: "Passo 3" });
    expect(within(step3).getByText("colcheia")).toBeInTheDocument(); // herda a duração de nota
    expect(screen.getByText("Duração do passo 3:")).toBeInTheDocument();
  });

  it("mover com ↓ troca com o vizinho e a seleção segue o passo movido", () => {
    render(<PhraseEditor />);
    addStep();
    clickFret("E1 traste 5 — A1"); // passo 1 = A1, cria passo 2
    clickFret("A1 traste 3 — C2"); // passo 2 = C2, cria passo 3 pendente
    fireEvent.click(screen.getByRole("button", { name: "Passo 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Mover passo pra frente" }));

    expect(within(screen.getByRole("button", { name: "Passo 1" })).getByText("C2")).toBeInTheDocument();
    expect(within(screen.getByRole("button", { name: "Passo 2" })).getByText("A1")).toBeInTheDocument();
    expect(screen.getByText("Duração do passo 2:")).toBeInTheDocument(); // seguiu o A1
  });

  it("setas desabilitam nas pontas", () => {
    render(<PhraseEditor />);
    addStep();
    addStep();
    fireEvent.click(screen.getByRole("button", { name: "Passo 1" }));
    expect(screen.getByRole("button", { name: "Mover passo pra trás" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Mover passo pra frente" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Passo 2" }));
    expect(screen.getByRole("button", { name: "Mover passo pra trás" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Mover passo pra frente" })).toBeDisabled();
  });

  it("inserir entre dois passos empurra os seguintes e seleciona o novo", () => {
    render(<PhraseEditor />);
    addStep();
    clickFret("E1 traste 5 — A1"); // passo 1 = A1, cria passo 2
    clickFret("A1 traste 3 — C2"); // passo 2 = C2, cria passo 3 pendente
    fireEvent.click(screen.getByRole("button", { name: "Inserir passo na posição 2" }));

    expect(within(screen.getByRole("button", { name: "Passo 1" })).getByText("A1")).toBeInTheDocument();
    expect(within(screen.getByRole("button", { name: "Passo 2" })).getByText("?")).toBeInTheDocument();
    expect(within(screen.getByRole("button", { name: "Passo 3" })).getByText("C2")).toBeInTheDocument();
    expect(screen.getByText("Duração do passo 2:")).toBeInTheDocument();
  });

  it("mover durante o playback para o playback", () => {
    render(<PhraseEditor />);
    addStep();
    clickFret("E1 traste 5 — A1");
    clickFret("A1 traste 3 — C2");
    fireEvent.click(screen.getByRole("button", { name: "Passo 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Tocar" }));
    expect(screen.getByRole("button", { name: "Parar" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Mover passo pra frente" }));
    expect(screen.getByRole("button", { name: "Tocar" })).toBeInTheDocument();
  });
});

describe("PhraseEditor — visualização (2.6)", () => {
  it("modo Tablatura usa a posição EXATA clicada e o \\tuning do instrumento", () => {
    useAppStore.setState({ staveDisplay: "tab" });
    render(<PhraseEditor />);
    addStep();
    clickFret("A1 traste 3 — C2");

    const tex = screen.getByTestId("staff").textContent ?? "";
    expect(tex).toContain("\\tuning g2 d2 a1 e1");
    expect(tex).toContain(":4 3.3"); // casa 3 da corda A — exatamente onde clicou
  });

  it("trocar o modo pelo toggle troca o tex e PARA o playback ativo", () => {
    render(<PhraseEditor />);
    addStep();
    clickFret("E1 traste 5 — A1");
    fireEvent.click(screen.getByRole("button", { name: "Tocar" }));
    expect(screen.getByRole("button", { name: "Parar" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Tablatura" }));

    expect(screen.getByRole("button", { name: "Tocar" })).toBeInTheDocument(); // parou
    expect(screen.getByTestId("staff").textContent).toContain(":4 5.4"); // E, casa 5
  });
});

describe("PhraseEditor — playback", () => {
  it("Tocar agenda tom só pros passos com nota (pausa em silêncio) e vira Parar", () => {
    render(<PhraseEditor />);
    addStep();
    clickFret("E1 traste 5 — A1"); // A1 + pendente criado pelo avanço
    fireEvent.click(screen.getByRole("button", { name: "pausa de semínima" })); // pendente vira pausa

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
