import { useEffect, useMemo, useRef, useState } from "react";
import { Fretboard } from "./Fretboard";
import { RhythmStaff, type RhythmStaffHandle } from "./RhythmStaff";
import { useAppStore } from "../store/useAppStore";
import { useScalePlayback } from "../hooks/useScalePlayback";
import { FIGURES, FIGURE_LABELS, type FigureId } from "../engine/rhythm-generator";
import { phrasePlaybackSchedule, phraseToTex, type PhraseStep } from "../engine/theory-tex";
import { pitchClassName } from "../engine/note-utils";
import { BASS_4_STRING } from "../config/instrument";

/** BPM fixo do playback da frase (mesma decisão da 2.3 — controle ajustável é backlog). */
const PHRASE_BPM = 90;

/** Durações da v1 (subconjunto do catálogo; semibreve fica pra depois — trivial de incluir). */
const EDITOR_FIGURES: FigureId[] = ["seminima", "colcheia", "minima", "pausa-seminima"];

const chipButtonStyle = (active: boolean) =>
  ({
    background: active ? "var(--color-accent-purple)" : "var(--color-bg-card)",
    color: active ? "#fff" : "var(--color-text-muted)",
    border: "1px solid var(--color-border)",
  }) as const;

/**
 * Editor de frases próprias (2.5, última sub-etapa do Módulo 2; base do editor do
 * Módulo 4): grade de passos (duração + nota via clique no braço) → alphaTex →
 * playback com cursor, tudo no clock único do AudioContext (useScalePlayback).
 * SEM persistência — a frase vive só no estado React (adiamento intencional; o
 * schema de biblioteca é do Módulo 4).
 */
export function PhraseEditor() {
  const clef = useAppStore((s) => s.clef);
  const [steps, setSteps] = useState<PhraseStep[]>([]);
  const [selected, setSelected] = useState<number | null>(null);

  const staffRef = useRef<RhythmStaffHandle>(null);
  const playback = useScalePlayback({
    onFrame: (elapsedMs) => staffRef.current?.updatePosition(elapsedMs),
    onStop: () => staffRef.current?.updatePosition(0),
  });

  const tex = useMemo(() => phraseToTex(steps, clef, PHRASE_BPM), [steps, clef]);
  const schedule = useMemo(() => phrasePlaybackSchedule(steps, PHRASE_BPM), [steps]);

  // Editar qualquer coisa (passos ou clave) durante o playback PARA o playback antes —
  // nunca dois playbacks nem cursor correndo sobre um tex que acabou de trocar (2.3).
  const stopRef = useRef(playback.stop);
  stopRef.current = playback.stop;
  useEffect(() => {
    stopRef.current();
  }, [steps, clef]);

  const addStep = () => {
    const nextIndex = steps.length;
    setSteps([...steps, { duration: "seminima", note: null }]);
    setSelected(nextIndex);
  };

  const removeStep = (index: number) => {
    setSteps(steps.filter((_, i) => i !== index));
    setSelected((sel) => {
      if (sel === null || sel === index) return null;
      return sel > index ? sel - 1 : sel;
    });
  };

  const setDurationOfSelected = (figure: FigureId) => {
    if (selected === null) return;
    setSteps(
      steps.map((step, i) =>
        i === selected
          ? { duration: figure, note: FIGURES[figure].rest ? null : step.note }
          : step
      )
    );
  };

  // Clique no braço define a nota do passo selecionado (braço + nome no chip como
  // confirmação — decisão de UX). O próprio clique já toca o som (feedback auditivo).
  const handleFretboardNote = (note: string) => {
    if (selected === null) return;
    const step = steps[selected];
    if (!step || FIGURES[step.duration].rest) return;
    setSteps(steps.map((s, i) => (i === selected ? { ...s, note } : s)));
  };

  // Braço: durante o playback destaca SÓ a nota soando; parado, a nota do passo selecionado.
  const activeName =
    playback.playing && playback.activeIndex !== null
      ? schedule.notes[playback.activeIndex]?.name
      : null;
  const selectedNote = selected !== null ? steps[selected]?.note : null;
  const highlight = playback.playing
    ? activeName
      ? [activeName]
      : []
    : selectedNote
      ? [pitchClassName(selectedNote)]
      : [];

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
        Monte uma frase passo a passo: adicione passos, escolha a duração de cada um e
        clique no braço pra definir a nota do passo selecionado. A frase existe só nesta
        sessão (salvar entra com a biblioteca do Módulo 4).
      </p>

      {/* Grade de passos */}
      <div className="flex flex-wrap items-center gap-2">
        {steps.map((step, i) => {
          const isRest = Boolean(FIGURES[step.duration].rest);
          const noteLabel = isRest ? "pausa" : (step.note ?? "?");
          const isSelected = selected === i;
          return (
            <div
              key={i}
              role="button"
              tabIndex={0}
              aria-label={`Passo ${i + 1}`}
              onClick={() => setSelected(i)}
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm cursor-pointer"
              style={{
                background: isSelected ? "var(--color-accent-purple)" : "var(--color-bg-card)",
                color: isSelected ? "#fff" : "var(--color-text-primary)",
                border: "1px solid var(--color-border)",
              }}
            >
              <span className="text-xs" style={{ opacity: 0.8 }}>
                {FIGURE_LABELS[step.duration]}
              </span>
              <span className="font-semibold">{noteLabel}</span>
              <button
                aria-label={`Remover passo ${i + 1}`}
                className="ml-1"
                style={{ color: "inherit", opacity: 0.7 }}
                onClick={(e) => {
                  e.stopPropagation();
                  e.currentTarget.blur();
                  removeStep(i);
                }}
              >
                ×
              </button>
            </div>
          );
        })}

        <button
          className="rounded-md px-3 py-2 text-sm font-medium"
          style={chipButtonStyle(false)}
          onClick={(e) => {
            e.currentTarget.blur();
            addStep();
          }}
        >
          + Passo
        </button>
      </div>

      {/* Duração do passo selecionado */}
      {selected !== null && steps[selected] && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>
            Duração do passo {selected + 1}:
          </span>
          {EDITOR_FIGURES.map((figure) => (
            <button
              key={figure}
              className="rounded-md px-3 py-1.5 text-sm"
              style={chipButtonStyle(steps[selected].duration === figure)}
              onClick={(e) => {
                e.currentTarget.blur();
                setDurationOfSelected(figure);
              }}
            >
              {FIGURE_LABELS[figure]}
            </button>
          ))}
        </div>
      )}

      {/* Tocar/Parar — frase vazia ou só-pausas é válida (silêncio), nunca trava */}
      <div>
        <button
          className="rounded-md px-4 py-2 text-sm font-medium"
          style={{
            background: playback.playing ? "var(--color-bg-card)" : "var(--color-accent-purple)",
            color: playback.playing ? "var(--color-text-primary)" : "#fff",
            border: "1px solid var(--color-border)",
          }}
          onClick={(e) => {
            e.currentTarget.blur();
            if (playback.playing) {
              playback.stop();
            } else {
              playback.start(schedule);
            }
          }}
        >
          {playback.playing ? "Parar" : "Tocar"}
        </button>
      </div>

      {/* Preview na pauta (clave global, mesma convenção de escrita do resto do app) */}
      {steps.length === 0 ? (
        <p
          className="rounded-lg p-4 text-sm"
          style={{ background: "var(--color-bg-card)", color: "var(--color-text-dim)" }}
        >
          A frase está vazia — adicione passos pra ver a partitura aqui.
        </p>
      ) : (
        <RhythmStaff ref={staffRef} tex={tex} />
      )}

      <Fretboard tuning={BASS_4_STRING} highlightedNotes={highlight} onNotePlayed={handleFretboardNote} />
    </div>
  );
}
