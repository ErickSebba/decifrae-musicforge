import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { forwardRef } from "react";
import { TheoryAndScales } from "./TheoryAndScales";
import { useAppStore } from "../store/useAppStore";
import { playTone } from "../engine/audio-engine";

// O RhythmStaff real instancia AlphaTabApi (worker) — não roda no jsdom. O stub expõe o
// tex pra podermos afirmar sobre a notação gerada (updatePosition vem via ref opcional).
vi.mock("../components/RhythmStaff", () => ({
  RhythmStaff: forwardRef<HTMLDivElement, { tex: string }>(function RhythmStaffStub(
    { tex },
    _ref
  ) {
    return <div data-testid="notation">{tex}</div>;
  }),
}));

// Web Audio ausente no jsdom — stub da engine inteira (Fretboard + useScalePlayback).
vi.mock("../engine/audio-engine", () => ({
  playNoteByName: vi.fn(),
  playTone: vi.fn(() => ({ stop: vi.fn() })),
  noteToFrequency: vi.fn(() => 440),
  audioContextTime: vi.fn(() => 0),
}));

// A Central de Conteúdo real passa pelo SQLite (mockado nos testes próprios dela).
// Aqui devolvemos entries derivadas da MESMA fonte (seed) — título real por topic.
vi.mock("../db/content-entries", async () => {
  const { THEORY_CONTENT } = await import("../data/theory-content-seed");
  return {
    getContentEntryByTopic: vi.fn(async (topic: string) => ({
      id: `theory-${topic}`,
      topic,
      title: THEORY_CONTENT[topic as keyof typeof THEORY_CONTENT].title,
      body: "",
      reviewStatus: "confirmado",
      note: "",
      createdAt: "2026-07-09T00:00:00.000Z",
    })),
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  useAppStore.setState({ clef: "F", staveDisplay: "score" });
});

describe("TheoryAndScales — explorador de escalas (2.2)", () => {
  it("renderiza Dó maior por padrão com campo harmônico", () => {
    render(<TheoryAndScales />);
    // Âncora c3 desde a 2.6 (decisão: +1 8ª pra viabilizar tab e registro audível).
    expect(screen.getByTestId("notation").textContent).toContain(":4 c3");
    expect(screen.getByText(/^C\s+D\s+E\s+F\s+G\s+A\s+B$/)).toBeInTheDocument();
    expect(screen.getByText("Campo harmônico")).toBeInTheDocument();
    expect(within(screen.getByRole("list")).getByText("vii°")).toBeInTheDocument();
  });

  it("Fá maior: pauta com bb2 (nunca a#) e IV = Bb no campo harmônico", () => {
    render(<TheoryAndScales />);
    fireEvent.change(screen.getByLabelText(/Tônica/), { target: { value: "F" } });

    const tex = screen.getByTestId("notation").textContent ?? "";
    expect(tex).toContain(":4 bb3");
    expect(tex).not.toContain("a#");
    const triadList = within(screen.getByRole("list"));
    expect(triadList.getByText("IV")).toBeInTheDocument();
    expect(triadList.getByText("Bb")).toBeInTheDocument();
    expect(triadList.getByText(/Bb – D – F/)).toBeInTheDocument();
  });

  it("respeita a clave global do store (Sol escreve uma 8ª acima)", () => {
    useAppStore.setState({ clef: "G" });
    render(<TheoryAndScales />);
    const tex = screen.getByTestId("notation").textContent ?? "";
    expect(tex).toContain("\\clef G2");
    expect(tex).toContain(":4 c4");
  });

  it("modo gregoriano esconde o campo harmônico (escopo 2.1b: só maior/menor natural)", () => {
    render(<TheoryAndScales />);
    fireEvent.change(screen.getByLabelText(/Tipo/), { target: { value: "dorian" } });

    expect(screen.getByTestId("notation").textContent).toContain(":4 d3");
    expect(screen.queryByText("Campo harmônico")).not.toBeInTheDocument();
  });

  it("Blues de C: blue note f#2 na pauta (nunca gb) e campo harmônico oculto", () => {
    render(<TheoryAndScales />);
    fireEvent.change(screen.getByLabelText(/Tipo/), { target: { value: "blues" } });

    const tex = screen.getByTestId("notation").textContent ?? "";
    expect(tex).toContain(":4 f#3");
    expect(tex).not.toContain("gb");
    expect(screen.queryByText("Campo harmônico")).not.toBeInTheDocument();
  });

  it("Pentatônica maior de C: 5 notas, sem 4º e 7º graus", () => {
    render(<TheoryAndScales />);
    fireEvent.change(screen.getByLabelText(/Tipo/), { target: { value: "majorPentatonic" } });

    expect(screen.getByText(/^C\s+D\s+E\s+G\s+A$/)).toBeInTheDocument();
    expect(screen.queryByText("Campo harmônico")).not.toBeInTheDocument();
  });

  it("combinação com grafia impossível (Db frígio) mostra aviso em vez de crashar", () => {
    render(<TheoryAndScales />);
    fireEvent.change(screen.getByLabelText(/Tônica/), { target: { value: "Db" } });
    fireEvent.change(screen.getByLabelText(/Tipo/), { target: { value: "phrygian" } });

    expect(screen.getByText(/acidentes duplos/)).toBeInTheDocument();
    expect(screen.queryByTestId("notation")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tocar" })).toBeDisabled();
  });
});

describe("TheoryAndScales — abas (2.5)", () => {
  it("aba default é Explorar escalas; trocar pra Editor de frases desmonta a Teoria", async () => {
    render(<TheoryAndScales />);
    expect(screen.getByRole("heading", { name: "Teoria" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Editor de frases" }));
    expect(screen.getByRole("button", { name: "+ Passo" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Teoria" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Explorar escalas" }));
    expect(await screen.findByText("Escala maior")).toBeInTheDocument();
  });
});

describe("TheoryAndScales — seção Teoria (2.4)", () => {
  it("tem as duas seções: Teoria (acima) e Prática (abaixo)", async () => {
    render(<TheoryAndScales />);
    expect(screen.getByRole("heading", { name: "Teoria" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Prática" })).toBeInTheDocument();
    await screen.findByText("Escala maior"); // evita update de estado após o teste
  });

  it("default (C maior): título do banco + seções rotuladas do conteúdo", async () => {
    render(<TheoryAndScales />);

    expect(await screen.findByText("Escala maior")).toBeInTheDocument();
    expect(screen.getByText("Fórmula intervalar:")).toBeInTheDocument();
    expect(screen.getByText(/1 - 2 - 3 - 4 - 5 - 6 - 7/)).toBeInTheDocument();
    expect(screen.getByText("Aplicação prática no baixo:")).toBeInTheDocument();
    // major é o único com a curiosidade opcional
    expect(screen.getByText("Nota histórica/curiosidade:")).toBeInTheDocument();
  });

  it("trocar o tipo troca o texto da Teoria (mesmo seletor da Prática)", async () => {
    render(<TheoryAndScales />);
    fireEvent.change(screen.getByLabelText(/Tipo/), { target: { value: "dorian" } });

    expect(await screen.findByText("Modo Dórico")).toBeInTheDocument();
    expect(screen.getByText(/So What/)).toBeInTheDocument();
    // dorian não tem curiosidade — seção opcional some
    expect(screen.queryByText("Nota histórica/curiosidade:")).not.toBeInTheDocument();
  });
});

describe("TheoryAndScales — visualização (2.6)", () => {
  it("modo Tablatura troca pro tex fretted com \\tuning e digitação automática", () => {
    render(<TheoryAndScales />);
    fireEvent.click(screen.getByRole("button", { name: "Tablatura" }));

    const tex = screen.getByTestId("notation").textContent ?? "";
    expect(tex).toContain("\\tuning g2 d2 a1 e1");
    expect(tex).toContain("\\displaytranspose 12");
    expect(tex).toContain(":4 3.3"); // C soante (C2) = corda A casa 3
  });

  it("trocar o modo durante o playback para o playback", () => {
    render(<TheoryAndScales />);
    fireEvent.click(screen.getByRole("button", { name: "Tocar" }));
    expect(screen.getByRole("button", { name: "Parar" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Ambas" }));
    expect(screen.getByRole("button", { name: "Tocar" })).toBeInTheDocument();
  });
});

describe("TheoryAndScales — playback (2.3)", () => {
  it("tex da pauta leva \\tempo (eixo MIDI do cursor = clock)", () => {
    render(<TheoryAndScales />);
    expect(screen.getByTestId("notation").textContent).toContain("\\tempo 90");
  });

  it("Tocar agenda uma nota por grau (7 na maior) e o botão vira Parar", () => {
    render(<TheoryAndScales />);
    fireEvent.click(screen.getByRole("button", { name: "Tocar" }));

    expect(playTone).toHaveBeenCalledTimes(7);
    expect(screen.getByRole("button", { name: "Parar" })).toBeInTheDocument();
  });

  it("Parar volta o botão pra Tocar (estado limpo)", () => {
    render(<TheoryAndScales />);
    fireEvent.click(screen.getByRole("button", { name: "Tocar" }));
    fireEvent.click(screen.getByRole("button", { name: "Parar" }));

    expect(screen.getByRole("button", { name: "Tocar" })).toBeInTheDocument();
  });

  it("trocar a tônica durante o playback para o playback atual", () => {
    render(<TheoryAndScales />);
    fireEvent.click(screen.getByRole("button", { name: "Tocar" }));
    expect(screen.getByRole("button", { name: "Parar" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Tônica/), { target: { value: "F" } });

    expect(screen.getByRole("button", { name: "Tocar" })).toBeInTheDocument();
  });
});
