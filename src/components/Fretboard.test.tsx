import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Fretboard } from "./Fretboard";
import { playNoteByName } from "../engine/audio-engine";

// A engine de áudio depende de Web Audio (ausente no jsdom) — stub.
vi.mock("../engine/audio-engine", () => ({
  playNoteByName: vi.fn(),
}));

const BASS_4 = ["E1", "A1", "D2", "G2"];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Fretboard", () => {
  it("clicar numa posição dispara onNotePlayed e toca o som com a nota correta", () => {
    const onNotePlayed = vi.fn();
    render(<Fretboard tuning={BASS_4} onNotePlayed={onNotePlayed} />);

    // 5ª casa da corda E = A1.
    fireEvent.click(screen.getByRole("button", { name: "E1 traste 5 — A1" }));

    expect(onNotePlayed).toHaveBeenCalledWith("A1");
    expect(playNoteByName).toHaveBeenCalledWith("A", 1);
  });

  it("corda solta (traste 0) toca a própria nota da corda", () => {
    render(<Fretboard tuning={BASS_4} />);
    fireEvent.click(screen.getByRole("button", { name: "G2 traste 0 — G2" }));
    expect(playNoteByName).toHaveBeenCalledWith("G", 2);
  });

  it("deriva o nº de cordas da afinação (suporta 5 cordas sem reescrever)", () => {
    const bass5 = ["B0", "E1", "A1", "D2", "G2"];
    const fretCount = 12;
    render(<Fretboard tuning={bass5} fretCount={fretCount} />);

    // Uma posição por (corda × traste), incluindo a corda solta.
    expect(screen.getAllByRole("button")).toHaveLength(bass5.length * (fretCount + 1));
    // E a corda grave extra (B0) só existe porque veio do array.
    expect(screen.getByRole("button", { name: /^B0 traste 0/ })).toBeInTheDocument();
  });
});