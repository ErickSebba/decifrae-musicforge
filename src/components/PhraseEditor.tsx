import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Fretboard } from "./Fretboard";
import { RhythmStaff, type RhythmStaffHandle } from "./RhythmStaff";
import { StaveDisplayToggle } from "./StaveDisplayToggle";
import { useAppStore } from "../store/useAppStore";
import { useScalePlayback } from "../hooks/useScalePlayback";
import { FIGURES, FIGURE_LABELS, type FigureId } from "../engine/rhythm-generator";
import {
  phrasePlaybackSchedule,
  phraseToFrettedTex,
  phraseToTex,
  type FretPosition,
  type PhraseStep,
} from "../engine/theory-tex";
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
  const staveDisplay = useAppStore((s) => s.staveDisplay);
  const setStaveDisplay = useAppStore((s) => s.setStaveDisplay);
  const [steps, setSteps] = useState<PhraseStep[]>([]);
  const [selected, setSelected] = useState<number | null>(null);

  // "Modo de entrada" (2.5b): última duração de NOTA usada — novos passos nascem com
  // ela, pro fluxo contínuo (escolhe colcheia uma vez, escreve nota atrás de nota).
  const lastNoteFigureRef = useRef<FigureId>("seminima");

  const staffRef = useRef<RhythmStaffHandle>(null);
  const playback = useScalePlayback({
    onFrame: (elapsedMs) => staffRef.current?.updatePosition(elapsedMs),
    onStop: () => staffRef.current?.updatePosition(0),
  });

  // Modo "score" mantém o tex pitched original; tab/ambas usam o tex fretted (2.6) —
  // a tab mostra a POSIÇÃO clicada de cada passo.
  const tex = useMemo(
    () =>
      staveDisplay === "score"
        ? phraseToTex(steps, clef, PHRASE_BPM)
        : phraseToFrettedTex(steps, clef, PHRASE_BPM, BASS_4_STRING),
    [steps, clef, staveDisplay]
  );
  const schedule = useMemo(() => phrasePlaybackSchedule(steps, PHRASE_BPM), [steps]);

  // Editar qualquer coisa (passos, clave OU modo de exibição) durante o playback PARA
  // o playback antes — trocar o modo re-renderiza a pauta inteira e o cursor não pode
  // correr sobre um render recriado (mesma classe de bug de sincronia do Módulo 1).
  const stopRef = useRef(playback.stop);
  stopRef.current = playback.stop;
  useEffect(() => {
    stopRef.current();
  }, [steps, clef, staveDisplay]);

  /** Insere um passo semínima pendente na posição exata e o seleciona (2.5b). */
  const insertStepAt = (index: number) => {
    setSteps([...steps.slice(0, index), { duration: "seminima", note: null }, ...steps.slice(index)]);
    setSelected(index);
  };

  const addStep = () => insertStepAt(steps.length);

  const removeStep = (index: number) => {
    setSteps(steps.filter((_, i) => i !== index));
    setSelected((sel) => {
      if (sel === null || sel === index) return null;
      return sel > index ? sel - 1 : sel;
    });
  };

  /**
   * Aplica a duração ao passo selecionado (2.5b, mecânica de editor de notação):
   * duração de NOTA vira o "modo de entrada" e PERMANECE no passo — o avanço acontece
   * ao escolher a nota no braço, que é o que completa o passo. PAUSA já completa o
   * passo sozinha (não há nota a escolher), então avança na hora; se era o último,
   * o novo passo pendente herda a última duração de NOTA usada.
   */
  const setDurationOfSelected = (figure: FigureId) => {
    if (selected === null) return;
    const isRest = Boolean(FIGURES[figure].rest);
    if (!isRest) lastNoteFigureRef.current = figure;

    const updated = steps.map((step, i) =>
      i === selected ? { duration: figure, note: isRest ? null : step.note } : step
    );
    if (!isRest) {
      setSteps(updated);
      return;
    }
    const wasLast = selected === steps.length - 1;
    setSteps(
      wasLast ? [...updated, { duration: lastNoteFigureRef.current, note: null }] : updated
    );
    setSelected(selected + 1);
  };

  /** Troca o passo selecionado com o vizinho; a seleção segue o PASSO, não a posição (2.5b). */
  const moveSelected = (delta: -1 | 1) => {
    if (selected === null) return;
    const target = selected + delta;
    if (target < 0 || target >= steps.length) return;
    const next = [...steps];
    [next[selected], next[target]] = [next[target], next[selected]];
    setSteps(next);
    setSelected(target);
  };

  // Clique no braço define a nota do passo selecionado (braço + nome no chip como
  // confirmação — decisão de UX; o próprio clique já toca o som) e AVANÇA a seleção
  // (2.5b): a nota é o que completa o passo. Se era o último, o novo passo pendente
  // herda a MESMA duração — fluxo contínuo sem re-escolher a figura a cada nota.
  const handleFretboardNote = (note: string, position: FretPosition) => {
    if (selected === null) return;
    const step = steps[selected];
    if (!step || FIGURES[step.duration].rest) return;
    lastNoteFigureRef.current = step.duration;

    // Guarda também a POSIÇÃO clicada (2.6): a tab mostra a casa que o usuário escolheu.
    const updated = steps.map((s, i) => (i === selected ? { ...s, note, position } : s));
    const wasLast = selected === steps.length - 1;
    setSteps(wasLast ? [...updated, { duration: step.duration, note: null }] : updated);
    setSelected(selected + 1);
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
            <Fragment key={i}>
            {/* Inserção entre passos (2.5b): empurra os seguintes, nada é sobrescrito */}
            <button
              aria-label={`Inserir passo na posição ${i + 1}`}
              className="rounded-md px-1.5 py-1 text-xs"
              style={{ color: "var(--color-text-dim)", border: "1px dashed var(--color-border)" }}
              onClick={(e) => {
                e.currentTarget.blur();
                insertStepAt(i);
              }}
            >
              +
            </button>
            <div
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
            </Fragment>
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

          {/* Mover o passo selecionado (2.5b): ↑ = pra trás, ↓ = pra frente */}
          <button
            aria-label="Mover passo pra trás"
            className="rounded-md px-2.5 py-1.5 text-sm"
            style={{ ...chipButtonStyle(false), opacity: selected === 0 ? 0.4 : 1 }}
            disabled={selected === 0}
            onClick={(e) => {
              e.currentTarget.blur();
              moveSelected(-1);
            }}
          >
            ↑
          </button>
          <button
            aria-label="Mover passo pra frente"
            className="rounded-md px-2.5 py-1.5 text-sm"
            style={{
              ...chipButtonStyle(false),
              opacity: selected === steps.length - 1 ? 0.4 : 1,
            }}
            disabled={selected === steps.length - 1}
            onClick={(e) => {
              e.currentTarget.blur();
              moveSelected(1);
            }}
          >
            ↓
          </button>
        </div>
      )}

      {/* Tocar/Parar — frase vazia ou só-pausas é válida (silêncio), nunca trava */}
      <div className="flex flex-wrap items-center gap-4">
        <StaveDisplayToggle value={staveDisplay} onChange={setStaveDisplay} />
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
        <RhythmStaff ref={staffRef} tex={tex} displayMode={staveDisplay} />
      )}

      <Fretboard tuning={BASS_4_STRING} highlightedNotes={highlight} onNotePlayed={handleFretboardNote} />
    </div>
  );
}
