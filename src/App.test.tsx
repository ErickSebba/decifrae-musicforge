import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import App from "./App";
import { useAppStore } from "./store/useAppStore";

// O AlphaTabViewer real instancia AlphaTabApi num useEffect (worker + DOM de render),
// que não roda no jsdom. Stub mantém o teste focado em navegação.
vi.mock("./components/AlphaTabViewer", () => ({
  AlphaTabViewer: () => <div>AlphaTab stub</div>,
}));

// Sidebar label -> conteúdo esperado dentro do <main> da página correspondente.
// Os labels da sidebar coincidem com os títulos das páginas, então todas as queries de
// conteúdo são escopadas ao landmark <main> (a sidebar fica no <aside>, fora dele).
const NAV = [
  { sidebar: "Leitura e Ritmo", content: "AlphaTab stub" },
  { sidebar: "Teoria e Escalas", content: "Teoria e Escalas" },
  { sidebar: "Progresso", content: "Progresso" },
  { sidebar: "Partituras", content: "Partituras" },
  { sidebar: "Diário de Prática", content: "Diário de Prática" },
];

describe("App — navegação entre módulos", () => {
  beforeEach(() => {
    useAppStore.setState({ activeModule: "reading" });
  });

  it("renderiza o Módulo 1 (Leitura e Ritmo) por padrão", () => {
    render(<App />);
    const main = within(screen.getByRole("main"));
    expect(main.getByText("AlphaTab stub")).toBeInTheDocument();
  });

  it.each(NAV)(
    "clicar em '$sidebar' renderiza a página correspondente no <main>",
    ({ sidebar, content }) => {
      render(<App />);
      // Clica no botão da sidebar (estado via Zustand); fireEvent envolve em act e
      // faz flush do re-render.
      fireEvent.click(screen.getByRole("button", { name: new RegExp(sidebar) }));

      const main = within(screen.getByRole("main"));
      // O conteúdo correto aparece no <main>...
      expect(main.getByText(content)).toBeInTheDocument();

      // ...e o conteúdo dos outros módulos não está no <main>.
      for (const other of NAV) {
        if (other.content === content) continue;
        expect(main.queryByText(other.content)).not.toBeInTheDocument();
      }
    }
  );
});
