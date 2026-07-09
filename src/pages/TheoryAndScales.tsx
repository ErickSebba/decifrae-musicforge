import { useMemo, useState } from "react";
import { Fretboard } from "../components/Fretboard";
import { Notation } from "../components/Notation";
import { useAppStore } from "../store/useAppStore";
import {
  MODES,
  MODE_LABELS,
  type ModeId,
  majorScale,
  naturalMinorScale,
  modeScale,
  majorPentatonic,
  minorPentatonic,
  bluesScale,
  diatonicTriads,
  TRIAD_QUALITY_LABELS,
} from "../engine/theory-engine";
import { scaleToHighlight, scaleToTex } from "../engine/theory-tex";

// Afinação padrão do baixo 4 cordas (grave→agudo).
// TODO: extrair para config de instrumento (4/5/6 cordas) quando houver seleção de instrumento.
const BASS_4_STRING = ["E1", "A1", "D2", "G2"];

/** Tônicas oferecidas: as 12 com armadura padrão (mesmo conjunto validado nos testes do motor). */
const TONICS = ["C", "G", "D", "A", "E", "B", "F#", "F", "Bb", "Eb", "Ab", "Db"];

type ScaleKind =
  | "major"
  | "naturalMinor"
  | "majorPentatonic"
  | "minorPentatonic"
  | "blues"
  | ModeId;

const KIND_OPTIONS: { id: ScaleKind; label: string }[] = [
  { id: "major", label: "Maior" },
  { id: "naturalMinor", label: "Menor natural" },
  { id: "majorPentatonic", label: "Pentatônica maior" },
  { id: "minorPentatonic", label: "Pentatônica menor" },
  { id: "blues", label: "Blues" },
  ...MODES.map((m) => ({ id: m as ScaleKind, label: `Modo ${MODE_LABELS[m]}` })),
];

function scaleNotes(tonic: string, kind: ScaleKind): string[] {
  if (kind === "major") return majorScale(tonic);
  if (kind === "naturalMinor") return naturalMinorScale(tonic);
  if (kind === "majorPentatonic") return majorPentatonic(tonic);
  if (kind === "minorPentatonic") return minorPentatonic(tonic);
  if (kind === "blues") return bluesScale(tonic);
  return modeScale(tonic, kind);
}

const selectStyle = {
  background: "var(--color-bg-card)",
  color: "var(--color-text-primary)",
  border: "1px solid var(--color-border)",
} as const;

/**
 * Módulo 2 — Teoria e Escalas (sub-etapa 2.2): explorador estático de escala/modo.
 * Pauta (clave GLOBAL do store, como no Módulo 1) + braço com highlight + campo
 * harmônico em lista. Sem playback/cursor (2.3), sem editor (2.5), sem persistência (2.4).
 */
export function TheoryAndScales() {
  const clef = useAppStore((s) => s.clef);
  const [tonic, setTonic] = useState("C");
  const [kind, setKind] = useState<ScaleKind>("major");
  const [lastNote, setLastNote] = useState<string | null>(null);

  // Escala + tex + highlight num memo só: modeScale/scaleToTex LANÇAM quando a grafia
  // correta exigiria acidente duplo (ex.: Db frígio → mãe Bbb maior) — nunca regrafamos
  // pra "caber"; a tela avisa e pede outra tônica.
  const view = useMemo(() => {
    try {
      const notes = scaleNotes(tonic, kind);
      return {
        notes,
        tex: scaleToTex(notes, clef),
        highlight: scaleToHighlight(notes),
        unwritable: false,
      };
    } catch {
      return { notes: [] as string[], tex: null, highlight: [] as string[], unwritable: true };
    }
  }, [tonic, kind, clef]);

  const triads = useMemo(
    () => (kind === "major" || kind === "naturalMinor" ? diatonicTriads(tonic, kind) : null),
    [tonic, kind]
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-semibold" style={{ color: "var(--color-text-primary)" }}>
          Teoria e Escalas
        </h2>
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          Escolha tônica e tipo pra ver a escala na pauta (clave global:{" "}
          {clef === "F" ? "Fá" : "Sol"}) e no braço. Clique numa posição do braço para ouvir.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1 text-sm" style={{ color: "var(--color-text-muted)" }}>
          Tônica
          <select
            className="rounded-md px-3 py-2"
            style={selectStyle}
            value={tonic}
            onChange={(e) => setTonic(e.target.value)}
          >
            {TONICS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm" style={{ color: "var(--color-text-muted)" }}>
          Tipo
          <select
            className="rounded-md px-3 py-2"
            style={selectStyle}
            value={kind}
            onChange={(e) => setKind(e.target.value as ScaleKind)}
          >
            {KIND_OPTIONS.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label}
              </option>
            ))}
          </select>
        </label>

        {view.notes.length > 0 && (
          <p className="text-sm pb-2" style={{ color: "var(--color-text-primary)" }}>
            Notas:{" "}
            <span style={{ color: "var(--color-accent-teal)" }}>{view.notes.join("  ")}</span>
          </p>
        )}
      </div>

      {view.unwritable ? (
        <p
          className="rounded-lg p-4 text-sm"
          style={{ background: "var(--color-bg-card)", color: "var(--color-text-muted)" }}
        >
          A grafia correta desta combinação exige acidentes duplos (ex.: B𝄫), que a pauta
          ainda não suporta — escolha outra tônica pra este modo.
        </p>
      ) : (
        <Notation tex={view.tex!} />
      )}

      <Fretboard
        tuning={BASS_4_STRING}
        highlightedNotes={view.highlight}
        onNotePlayed={setLastNote}
      />

      <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
        Última nota tocada:{" "}
        <span style={{ color: "var(--color-accent-teal)" }}>{lastNote ?? "—"}</span>
      </p>

      {triads && (
        <section className="flex flex-col gap-2">
          <h3 className="text-lg font-semibold" style={{ color: "var(--color-text-primary)" }}>
            Campo harmônico
          </h3>
          <ul className="flex flex-col gap-1 text-sm">
            {triads.map((t) => (
              <li key={t.degree} style={{ color: "var(--color-text-muted)" }}>
                <span className="inline-block w-10" style={{ color: "var(--color-accent-purple)" }}>
                  {t.roman}
                </span>
                <span className="inline-block w-14" style={{ color: "var(--color-text-primary)" }}>
                  {t.symbol}
                </span>
                {t.notes.join(" – ")} ({TRIAD_QUALITY_LABELS[t.quality]})
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
