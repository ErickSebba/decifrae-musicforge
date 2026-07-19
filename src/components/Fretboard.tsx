import { useMemo } from "react";
import { playNoteByName } from "../engine/audio-engine";
import { noteAtFret, parseNote, pitchClassName, pitchClassOf } from "../engine/note-utils";
import type { FretPosition } from "../engine/theory-tex";

export interface FretboardProps {
  /** Afinação grave→agudo (ex.: ['E1','A1','D2','G2']). O nº de cordas vem do tamanho do array. */
  tuning: string[];
  /** Quantos trastes exibir (além da corda solta). */
  fretCount?: number;
  /** Mostrar o nome da nota em cada posição. */
  showNoteNames?: boolean;
  /** Nomes de nota a destacar (octave-agnostic), ex.: ['E','G']. Usado depois para escalas. */
  highlightedNotes?: string[];
  /**
   * Disparado ao clicar numa posição, com o nome completo da nota (ex.: 'A1') e a
   * posição exata (corda/casa — 2.6, usada pela tablatura do editor de frases).
   */
  onNotePlayed?: (note: string, position: FretPosition) => void;
}

// Geometria (px no espaço do viewBox). Cores ficam nos tokens de index.css.
const FRET_SPACING = 54;
const STRING_SPACING = 44;
const PAD_TOP = 32;
const PAD_BOTTOM = 32;
const NUT_X = 56; // espaço à esquerda para as notas das cordas soltas
const PAD_RIGHT = 28;
const OPEN_OFFSET = 28; // quão à esquerda do nut fica a nota da corda solta
const NOTE_RADIUS = 13;

// Trastes com marcador de posição; 12 leva marcador duplo.
const SINGLE_INLAYS = [3, 5, 7, 9];
const DOUBLE_INLAY = 12;

export function Fretboard({
  tuning,
  fretCount = 12,
  showNoteNames = true,
  highlightedNotes = [],
  onNotePlayed,
}: FretboardProps) {
  const stringCount = tuning.length;

  // Conjunto de classes de altura destacadas (enarmônico-aware: 'F#' ≡ 'Gb').
  const highlightSet = useMemo(
    () => new Set(highlightedNotes.map((n) => pitchClassOf(n))),
    [highlightedNotes]
  );

  const width = NUT_X + fretCount * FRET_SPACING + PAD_RIGHT;
  const height = PAD_TOP + (stringCount - 1) * STRING_SPACING + PAD_BOTTOM;

  // y da corda i (0 = mais grave) — grave embaixo (convenção de tablatura).
  const stringY = (i: number) => PAD_TOP + (stringCount - 1 - i) * STRING_SPACING;
  // x da linha do traste n (0 = pestana).
  const fretWireX = (n: number) => NUT_X + n * FRET_SPACING;
  // x da nota: corda solta à esquerda do nut; trastada no meio do espaço do traste.
  const noteX = (fret: number) => (fret === 0 ? NUT_X - OPEN_OFFSET : NUT_X + (fret - 0.5) * FRET_SPACING);

  const topY = stringY(stringCount - 1);
  const bottomY = stringY(0);
  const centerY = (topY + bottomY) / 2;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      role="img"
      aria-label="Braço do baixo"
      style={{ background: "var(--color-bg-card)", borderRadius: "var(--radius-card)" }}
    >
      {/* Marcadores de posição (inlays) */}
      {SINGLE_INLAYS.filter((n) => n <= fretCount).map((n) => (
        <circle key={`inlay-${n}`} cx={noteX(n)} cy={centerY} r={4} fill="var(--color-text-dim)" />
      ))}
      {DOUBLE_INLAY <= fretCount && (
        <>
          <circle cx={noteX(DOUBLE_INLAY)} cy={topY + STRING_SPACING * 0.5} r={4} fill="var(--color-text-dim)" />
          <circle cx={noteX(DOUBLE_INLAY)} cy={bottomY - STRING_SPACING * 0.5} r={4} fill="var(--color-text-dim)" />
        </>
      )}

      {/* Trastes verticais (0 = pestana, mais grossa) */}
      {Array.from({ length: fretCount + 1 }, (_, n) => (
        <line
          key={`fret-${n}`}
          x1={fretWireX(n)}
          y1={topY}
          x2={fretWireX(n)}
          y2={bottomY}
          stroke="var(--color-border)"
          strokeWidth={n === 0 ? 4 : 2}
        />
      ))}

      {/* Cordas horizontais (mais graves levemente mais grossas) */}
      {tuning.map((_, i) => (
        <line
          key={`string-${i}`}
          x1={NUT_X}
          y1={stringY(i)}
          x2={fretWireX(fretCount)}
          y2={stringY(i)}
          stroke="var(--color-text-dim)"
          strokeWidth={1 + (stringCount - 1 - i) * 0.4}
        />
      ))}

      {/* Posições clicáveis (corda × traste) */}
      {tuning.map((openNote, i) =>
        Array.from({ length: fretCount + 1 }, (_, fret) => {
          const note = noteAtFret(openNote, fret);
          const name = pitchClassName(note);
          const highlighted = highlightSet.has(pitchClassOf(name));
          const cx = noteX(fret);
          const cy = stringY(i);

          const handlePlay = () => {
            const { octave } = parseNote(note);
            playNoteByName(name, octave);
            onNotePlayed?.(note, { stringIndex: i, fret });
          };

          return (
            <g
              key={`${i}-${fret}`}
              role="button"
              aria-label={`${openNote} traste ${fret} — ${note}`}
              tabIndex={0}
              onClick={handlePlay}
              style={{ cursor: "pointer" }}
            >
              <circle
                cx={cx}
                cy={cy}
                r={NOTE_RADIUS}
                fill={highlighted ? "var(--color-accent-teal)" : "var(--color-bg-secondary)"}
                stroke="var(--color-border)"
                strokeWidth={1}
              />
              {showNoteNames && (
                <text
                  x={cx}
                  y={cy}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={12}
                  fill={highlighted ? "#fff" : "var(--color-text-muted)"}
                  style={{ pointerEvents: "none", userSelect: "none" }}
                >
                  {name}
                </text>
              )}
            </g>
          );
        })
      )}
    </svg>
  );
}