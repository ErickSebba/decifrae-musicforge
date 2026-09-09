import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Progress } from "./Progress";

// As abas montam componentes testados à parte; stubs mantêm o foco na estrutura.
vi.mock("../components/ContentReviewCenter", () => ({
  ContentReviewCenter: () => <div data-testid="central">Central stub</div>,
}));
vi.mock("../components/ExerciseProgressPanel", () => ({
  ExerciseProgressPanel: () => <div data-testid="exercises">Exercícios stub</div>,
}));
vi.mock("../components/StudyTrackPanel", () => ({
  StudyTrackPanel: () => <div data-testid="studyTrack">Trilha stub</div>,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Progress — estrutura de abas do Módulo 3", () => {
  it("abas: Exercícios, Trilha e Central habilitadas; só Mapa desabilitada '(em breve)'", () => {
    render(<Progress />);

    expect(screen.getByRole("button", { name: "Exercícios" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Trilha de estudo" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Central de Conteúdo" })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Mapa de teoria \(em breve\)/ })).toBeDisabled();
  });

  it("default é a aba Exercícios (re-decisão da 3.1)", () => {
    render(<Progress />);
    expect(screen.getByTestId("exercises")).toBeInTheDocument();
    expect(screen.queryByTestId("studyTrack")).not.toBeInTheDocument();
  });

  it("trocar pra Trilha de estudo desmonta Exercícios e monta a trilha", () => {
    render(<Progress />);
    fireEvent.click(screen.getByRole("button", { name: "Trilha de estudo" }));

    expect(screen.getByTestId("studyTrack")).toBeInTheDocument();
    expect(screen.queryByTestId("exercises")).not.toBeInTheDocument();
  });
});
