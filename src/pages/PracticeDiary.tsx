import { PracticeDiaryPanel } from "../components/PracticeDiaryPanel";

/** Módulo 5 — Diário de Prática (5a): cadastro de exercícios + registro de sessões reais. */
export function PracticeDiary() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-semibold" style={{ color: "var(--color-text-primary)" }}>
          Diário de Prática
        </h2>
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          Registre a prática real no baixo: cadastre seus exercícios e lance cada sessão
          (BPM tocado, duração, autoavaliação, data e observações).
        </p>
      </div>
      <PracticeDiaryPanel />
    </div>
  );
}
