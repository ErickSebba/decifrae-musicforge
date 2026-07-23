import { useState } from "react";
import { ContentReviewCenter } from "../components/ContentReviewCenter";
import { ExerciseProgressPanel } from "../components/ExerciseProgressPanel";

/**
 * Módulo 3 — Progresso. Estrutura em ABAS locais (decisão da 3.4, mesmo padrão da
 * TheoryAndScales): as 4 partes do módulo viverão aqui; cada sub-etapa futura só troca
 * o `disabled` da sua aba pelo componente, sem reorganizar a página.
 * Aba é estado LOCAL (não vai pro store — igual TheoryAndScales).
 */

type ProgressTab = "exercises" | "studyTrack" | "theoryMap" | "central";

const TABS: { id: ProgressTab; label: string; ready: boolean }[] = [
  { id: "exercises", label: "Exercícios", ready: true }, // 3.1
  { id: "studyTrack", label: "Trilha de estudo", ready: false }, // 3.2
  { id: "theoryMap", label: "Mapa de teoria", ready: false }, // 3.3
  { id: "central", label: "Central de Conteúdo", ready: true }, // 3.4
];

export function Progress() {
  // Default re-decidido na 3.1: visão de progresso é a landing natural do módulo.
  const [tab, setTab] = useState<ProgressTab>("exercises");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h2 className="text-2xl font-semibold" style={{ color: "var(--color-text-primary)" }}>
          Progresso
        </h2>
        <div className="flex gap-2 flex-wrap">
          {TABS.map((t) => (
            <button
              key={t.id}
              disabled={!t.ready}
              className="rounded-md px-3 py-1.5 text-sm font-medium"
              style={{
                background: tab === t.id ? "var(--color-accent-purple)" : "var(--color-bg-card)",
                color: !t.ready
                  ? "var(--color-text-dim)"
                  : tab === t.id
                    ? "#fff"
                    : "var(--color-text-muted)",
                border: "1px solid var(--color-border)",
                cursor: t.ready ? "pointer" : "not-allowed",
              }}
              onClick={(e) => {
                e.currentTarget.blur();
                setTab(t.id);
              }}
            >
              {t.label}
              {!t.ready && " (em breve)"}
            </button>
          ))}
        </div>
      </div>

      {tab === "exercises" && <ExerciseProgressPanel />}
      {tab === "central" && <ContentReviewCenter />}
    </div>
  );
}
