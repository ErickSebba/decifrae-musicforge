import type { ComponentType } from "react";
import { useAppStore, type ModuleId } from "./store/useAppStore";
import { ReadingAndRhythm } from "./pages/ReadingAndRhythm";
import { TheoryAndScales } from "./pages/TheoryAndScales";
import { Progress } from "./pages/Progress";
import { Scores } from "./pages/Scores";
import { PracticeDiary } from "./pages/PracticeDiary";

const MODULES: { id: ModuleId; label: string; icon: string }[] = [
  { id: "reading", label: "Leitura e Ritmo", icon: "♩" },
  { id: "theory", label: "Teoria e Escalas", icon: "𝄞" },
  { id: "progress", label: "Progresso", icon: "📈" },
  { id: "library", label: "Partituras", icon: "📂" },
  { id: "practice", label: "Diário de Prática", icon: "📝" },
];

const PAGES: Record<ModuleId, ComponentType> = {
  reading: ReadingAndRhythm,
  theory: TheoryAndScales,
  progress: Progress,
  library: Scores,
  practice: PracticeDiary,
};

export default function App() {
  const { activeModule, setActiveModule } = useAppStore();
  const Page = PAGES[activeModule];

  return (
    <div className="flex h-full" style={{ background: "var(--color-bg-primary)" }}>
      {/* Sidebar */}
      <aside
        className="flex flex-col w-56 shrink-0 py-6 px-3 gap-1"
        style={{ background: "var(--color-bg-sidebar)", borderRight: "1px solid var(--color-border)" }}
      >
        <div className="px-3 mb-6">
          <h1 className="text-sm font-bold tracking-widest uppercase" style={{ color: "var(--color-accent-purple-light)" }}>
            MusicForge
          </h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--color-text-dim)" }}>
            Estudo de Baixo
          </p>
        </div>

        {MODULES.map((mod) => {
          const isActive = activeModule === mod.id;
          return (
            <button
              key={mod.id}
              onClick={() => setActiveModule(mod.id)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-left transition-colors"
              style={{
                background: isActive ? "var(--color-accent-purple)" : "transparent",
                color: isActive ? "#fff" : "var(--color-text-muted)",
              }}
            >
              <span className="text-base">{mod.icon}</span>
              <span>{mod.label}</span>
            </button>
          );
        })}
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto p-8">
        <Page />
      </main>
    </div>
  );
}
