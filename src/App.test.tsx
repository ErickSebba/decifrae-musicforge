import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import App from "./App";
import { useAppStore } from "./store/useAppStore";

// O Notation real instancia AlphaTabApi num useEffect (worker + DOM de render), que não roda
// no jsdom. Stub mantém o teste focado em navegação.
vi.mock("./components/Notation", () => ({
  Notation: () => <div>Notação</div>,
}));

// Sidebar label -> conteúdo esperado dentro do <main> da página correspondente.
// Os labels da sidebar coincidem com os títulos das páginas, então todas as queries de
// conteúdo são escopadas ao landmark <main> (a sidebar fica no <aside>, fora dele).
const NAV = [
  { sidebar: "Leitura e Ritmo", content: "Identificação de Notas" },
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
    expect(main.getByText(/Identificação de Notas/)).toBeInTheDocument();
  });

  it.each(NAV)(
    "clicar em '$sidebar' renderiza a página correspondente no <main>",
    ({ sidebar, content }) => {
      render(<App />);
      // Clica no botão da sidebar (estado via Zustand); fireEvent envolve em act e
      // faz flush do re-render.
      fireEvent.click(screen.getByRole("button", { name: new RegExp(sidebar) }));

      const main = within(screen.getByRole("main"));
      // O conteúdo correto aparece no <main>... (regex p/ casar substring de headings)
      expect(main.getByText(new RegExp(content))).toBeInTheDocument();

      // ...e o conteúdo dos outros módulos não está no <main>.
      for (const other of NAV) {
        if (other.content === content) continue;
        expect(main.queryByText(new RegExp(other.content))).not.toBeInTheDocument();
      }
    }
  );
});
