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

beforeEach(() => {
  vi.clearAllMocks();
  useAppStore.setState({ clef: "F" });
});

describe("TheoryAndScales — explorador de escalas (2.2)", () => {
  it("renderiza Dó maior por padrão com campo harmônico", () => {
    render(<TheoryAndScales />);
    expect(screen.getByTestId("notation").textContent).toContain(":4 c2");
    expect(screen.getByText(/^C\s+D\s+E\s+F\s+G\s+A\s+B$/)).toBeInTheDocument();
    expect(screen.getByText("Campo harmônico")).toBeInTheDocument();
    expect(within(screen.getByRole("list")).getByText("vii°")).toBeInTheDocument();
  });

  it("Fá maior: pauta com bb2 (nunca a#) e IV = Bb no campo harmônico", () => {
    render(<TheoryAndScales />);
    fireEvent.change(screen.getByLabelText(/Tônica/), { target: { value: "F" } });

    const tex = screen.getByTestId("notation").textContent ?? "";
    expect(tex).toContain(":4 bb2");
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
    expect(tex).toContain(":4 c3");
  });

  it("modo gregoriano esconde o campo harmônico (escopo 2.1b: só maior/menor natural)", () => {
    render(<TheoryAndScales />);
    fireEvent.change(screen.getByLabelText(/Tipo/), { target: { value: "dorian" } });

    expect(screen.getByTestId("notation").textContent).toContain(":4 d2");
    expect(screen.queryByText("Campo harmônico")).not.toBeInTheDocument();
  });

  it("Blues de C: blue note f#2 na pauta (nunca gb) e campo harmônico oculto", () => {
    render(<TheoryAndScales />);
    fireEvent.change(screen.getByLabelText(/Tipo/), { target: { value: "blues" } });

    const tex = screen.getByTestId("notation").textContent ?? "";
    expect(tex).toContain(":4 f#2");
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
