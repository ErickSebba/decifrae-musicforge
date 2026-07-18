import { useEffect, useMemo, useRef, useState } from "react";
import { Fretboard } from "../components/Fretboard";
import { PhraseEditor } from "../components/PhraseEditor";
import { RhythmStaff, type RhythmStaffHandle } from "../components/RhythmStaff";
import { useAppStore } from "../store/useAppStore";
import { useScalePlayback } from "../hooks/useScalePlayback";
import { BASS_4_STRING } from "../config/instrument";
import {
  MODES,
  MODE_LABELS,
  majorScale,
  naturalMinorScale,
  modeScale,
  majorPentatonic,
  minorPentatonic,
  bluesScale,
  diatonicTriads,
  TRIAD_QUALITY_LABELS,
  type ContentEntry,
} from "../engine/theory-engine";
import { scalePlaybackSchedule, scaleToHighlight, scaleToTex } from "../engine/theory-tex";
import {
  THEORY_CONTENT,
  THEORY_SECTION_LABELS,
  THEORY_SECTION_ORDER,
  type TheoryTopicId,
} from "../data/theory-content-seed";
import { getContentEntryByTopic } from "../db/content-entries";

/** Tônicas oferecidas: as 12 com armadura padrão (mesmo conjunto validado nos testes do motor). */
const TONICS = ["C", "G", "D", "A", "E", "B", "F#", "F", "Bb", "Eb", "Ab", "Db"];

/** BPM fixo do playback (controle ajustável está fora do escopo da 2.3). */
const PLAYBACK_BPM = 90;

/** O "tipo" do seletor É o topic da Central de Conteúdo — definição única no seed. */
type ScaleKind = TheoryTopicId;

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
  // Abas locais (2.5): "Explorar escalas" (Teoria + Prática) e "Editor de frases".
  // Aba desmonta a outra — evita 2 instâncias AlphaTab + 2 braços SVG simultâneos, e o
  // cleanup dos hooks já cancela qualquer playback ao trocar.
  const [tab, setTab] = useState<"scales" | "phrase">("scales");
  const [tonic, setTonic] = useState("C");
  const [kind, setKind] = useState<ScaleKind>("major");
  const [lastNote, setLastNote] = useState<string | null>(null);

  // Cursor da pauta dirigido pelo clock do playback (updatePosition; nunca api.play()).
  const staffRef = useRef<RhythmStaffHandle>(null);
  const playback = useScalePlayback({
    onFrame: (elapsedMs) => staffRef.current?.updatePosition(elapsedMs),
    onStop: () => staffRef.current?.updatePosition(0), // cursor volta ao início, nunca fica preso
  });

  // Escala + tex + highlight + agenda num memo só: modeScale/scaleToTex LANÇAM quando a
  // grafia correta exigiria acidente duplo (ex.: Db frígio → mãe Bbb maior) — nunca
  // regrafamos pra "caber"; a tela avisa e pede outra tônica. O tex leva \tempo igual ao
  // BPM da agenda (eixo MIDI do AlphaTab = clock — mecânica validada nº 3).
  const view = useMemo(() => {
    try {
      const notes = scaleNotes(tonic, kind);
      return {
        notes,
        tex: scaleToTex(notes, clef, { tempo: PLAYBACK_BPM }),
        highlight: scaleToHighlight(notes),
        schedule: scalePlaybackSchedule(notes, PLAYBACK_BPM),
        unwritable: false,
      };
    } catch {
      return {
        notes: [] as string[],
        tex: null,
        highlight: [] as string[],
        schedule: null,
        unwritable: true,
      };
    }
  }, [tonic, kind, clef]);

  // Trocar tônica/tipo/clave NUNCA sobrepõe playbacks: para o atual antes da nova escala.
  const stopRef = useRef(playback.stop);
  stopRef.current = playback.stop;
  useEffect(() => {
    stopRef.current();
  }, [tonic, kind, clef]);

  // Seção Teoria: entrada da Central de Conteúdo do topic selecionado (mesmo seletor da
  // Prática — trocar o tipo troca o texto). Guard de corrida: resposta de topic antigo
  // não sobrescreve a atual.
  const [entry, setEntry] = useState<ContentEntry | null>(null);
  useEffect(() => {
    let cancelled = false;
    setEntry(null);
    void getContentEntryByTopic(kind).then((result) => {
      if (!cancelled) setEntry(result);
    });
    return () => {
      cancelled = true;
    };
  }, [kind]);

  // Durante o playback o braço destaca SÓ a nota soando; parado, a escala inteira (2.2).
  const activeNote =
    playback.playing && playback.activeIndex !== null && view.schedule
      ? view.schedule.notes[playback.activeIndex]?.name
      : null;
  const fretboardHighlight = playback.playing ? (activeNote ? [activeNote] : []) : view.highlight;

  const triads = useMemo(
    () => (kind === "major" || kind === "naturalMinor" ? diatonicTriads(tonic, kind) : null),
    [tonic, kind]
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h2 className="text-2xl font-semibold" style={{ color: "var(--color-text-primary)" }}>
          Teoria e Escalas
        </h2>
        <div className="flex gap-2">
          {(
            [
              { id: "scales", label: "Explorar escalas" },
              { id: "phrase", label: "Editor de frases" },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              className="rounded-md px-3 py-1.5 text-sm font-medium"
              style={{
                background: tab === t.id ? "var(--color-accent-purple)" : "var(--color-bg-card)",
                color: tab === t.id ? "#fff" : "var(--color-text-muted)",
                border: "1px solid var(--color-border)",
              }}
              onClick={(e) => {
                e.currentTarget.blur();
                setTab(t.id);
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "phrase" ? (
        <PhraseEditor />
      ) : (
        <>
      <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
        Escolha tônica e tipo pra ver a escala na pauta (clave global:{" "}
        {clef === "F" ? "Fá" : "Sol"}) e no braço. Clique numa posição do braço para ouvir.
      </p>

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

      </div>

      <section className="flex flex-col gap-3">
        <h3 className="text-lg font-semibold" style={{ color: "var(--color-text-primary)" }}>
          Teoria
        </h3>
        {entry ? (
          <div
            className="rounded-lg p-4 flex flex-col gap-3"
            style={{ background: "var(--color-bg-card)" }}
          >
            <h4 className="text-base font-semibold" style={{ color: "var(--color-text-primary)" }}>
              {entry.title}
            </h4>
            {THEORY_SECTION_ORDER.map((key) => {
              const text = THEORY_CONTENT[kind].sections[key];
              if (!text) return null;
              return (
                <p
                  key={key}
                  className="text-sm whitespace-pre-line"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  <span className="font-semibold" style={{ color: "var(--color-text-primary)" }}>
                    {THEORY_SECTION_LABELS[key]}:
                  </span>{" "}
                  {text}
                </p>
              );
            })}
          </div>
        ) : (
          <p className="text-sm" style={{ color: "var(--color-text-dim)" }}>
            Carregando conteúdo…
          </p>
        )}
      </section>

      <section className="flex flex-col gap-6">
        <h3 className="text-lg font-semibold" style={{ color: "var(--color-text-primary)" }}>
          Prática
        </h3>

        <div className="flex flex-wrap items-center gap-4">
          <button
            className="rounded-md px-4 py-2 text-sm font-medium"
            style={{
              background: playback.playing ? "var(--color-bg-card)" : "var(--color-accent-purple)",
              color: playback.playing ? "var(--color-text-primary)" : "#fff",
              border: "1px solid var(--color-border)",
              opacity: view.unwritable ? 0.5 : 1,
            }}
            disabled={view.unwritable}
            onClick={(e) => {
              e.currentTarget.blur();
              if (playback.playing) {
                playback.stop();
              } else if (view.schedule) {
                playback.start(view.schedule);
              }
            }}
          >
            {playback.playing ? "Parar" : "Tocar"}
          </button>

          {view.notes.length > 0 && (
            <p className="text-sm" style={{ color: "var(--color-text-primary)" }}>
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
          <RhythmStaff ref={staffRef} tex={view.tex!} />
        )}

        <Fretboard
          tuning={BASS_4_STRING}
          highlightedNotes={fretboardHighlight}
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
                  <span
                    className="inline-block w-10"
                    style={{ color: "var(--color-accent-purple)" }}
                  >
                    {t.roman}
                  </span>
                  <span
                    className="inline-block w-14"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    {t.symbol}
                  </span>
                  {t.notes.join(" – ")} ({TRIAD_QUALITY_LABELS[t.quality]})
                </li>
              ))}
            </ul>
          </section>
        )}
      </section>
        </>
      )}
    </div>
  );
}
