import type { StaveDisplayMode } from "./RhythmStaff";

const OPTIONS: { id: StaveDisplayMode; label: string }[] = [
  { id: "score", label: "Partitura" },
  { id: "tab", label: "Tablatura" },
  { id: "both", label: "Ambas" },
];

/** Seletor do modo de exibição da pauta (2.6), compartilhado pelas duas telas do Módulo 2. */
export function StaveDisplayToggle({
  value,
  onChange,
}: {
  value: StaveDisplayMode;
  onChange: (mode: StaveDisplayMode) => void;
}) {
  return (
    <div className="flex gap-2" role="group" aria-label="Modo de visualização">
      {OPTIONS.map((option) => (
        <button
          key={option.id}
          className="rounded-md px-3 py-1.5 text-sm"
          style={{
            background: value === option.id ? "var(--color-accent-purple)" : "var(--color-bg-card)",
            color: value === option.id ? "#fff" : "var(--color-text-muted)",
            border: "1px solid var(--color-border)",
          }}
          onClick={(e) => {
            e.currentTarget.blur();
            onChange(option.id);
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
