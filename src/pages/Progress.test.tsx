import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Progress } from "./Progress";

// A aba Central monta o ContentReviewCenter (testado à parte); stub mantém o foco na
// estrutura de abas da página.
vi.mock("../components/ContentReviewCenter", () => ({
  ContentReviewCenter: () => <div data-testid="central">Central stub</div>,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Progress — estrutura de abas do Módulo 3", () => {
  it("renderiza as 4 abas; as 3 futuras desabilitadas com '(em breve)'", () => {
    render(<Progress />);

    expect(screen.getByRole("button", { name: /Exercícios \(em breve\)/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Trilha de estudo \(em breve\)/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Mapa de teoria \(em breve\)/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Central de Conteúdo" })).toBeEnabled();
  });

  it("aba Central é a default e renderiza o componente de revisão", () => {
    render(<Progress />);
    expect(screen.getByTestId("central")).toBeInTheDocument();
  });
});
