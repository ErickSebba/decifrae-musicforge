import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { TheoryAndScales } from "./TheoryAndScales";
import { useAppStore } from "../store/useAppStore";

// O Notation real instancia AlphaTabApi (worker) — não roda no jsdom. O stub expõe o tex
// pra podermos afirmar sobre a notação gerada.
vi.mock("../components/Notation", () => ({
  Notation: ({ tex }: { tex: string }) => <div data-testid="notation">{tex}</div>,
}));

// Fretboard toca som ao clicar — Web Audio ausente no jsdom.
vi.mock("../engine/audio-engine", () => ({
  playNoteByName: vi.fn(),
}));

beforeEach(() => {
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

  it("combinação com grafia impossível (Db frígio) mostra aviso em vez de crashar", () => {
    render(<TheoryAndScales />);
    fireEvent.change(screen.getByLabelText(/Tônica/), { target: { value: "Db" } });
    fireEvent.change(screen.getByLabelText(/Tipo/), { target: { value: "phrygian" } });

    expect(screen.getByText(/acidentes duplos/)).toBeInTheDocument();
    expect(screen.queryByTestId("notation")).not.toBeInTheDocument();
  });
});
