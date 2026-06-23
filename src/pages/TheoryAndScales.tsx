import { useState } from "react";
import { Fretboard } from "../components/Fretboard";

// Afinação padrão do baixo 4 cordas (grave→agudo).
// TODO: extrair para config de instrumento (4/5/6 cordas) quando houver seleção de instrumento.
const BASS_4_STRING = ["E1", "A1", "D2", "G2"];

/** Módulo 2 — Teoria e Escalas. Conteúdo temporário: teste visual do braço (Fretboard). */
export function TheoryAndScales() {
  const [lastNote, setLastNote] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-semibold" style={{ color: "var(--color-text-primary)" }}>
          Teoria e Escalas
        </h2>
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          Teste visual do braço do baixo — clique numa posição para ouvir e ver a nota. O
          destaque em "E" é só um exemplo da infraestrutura de escalas.
        </p>
      </div>

      <Fretboard tuning={BASS_4_STRING} highlightedNotes={["E"]} onNotePlayed={setLastNote} />

      <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
        Última nota tocada:{" "}
        <span style={{ color: "var(--color-accent-teal)" }}>{lastNote ?? "—"}</span>
      </p>
    </div>
  );
}