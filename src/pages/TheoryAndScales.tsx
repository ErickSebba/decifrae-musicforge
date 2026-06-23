import { useState } from "react";
import { playNoteByName } from "../engine/audio-engine";

interface Note {
  name: string;
  octave: number;
}

// Controle temporário de sustain para calibrar o som antes dos exercícios reais.
const DURATIONS: { label: string; sec: number }[] = [
  { label: "Curta 0.5s", sec: 0.5 },
  { label: "Média 1.5s", sec: 1.5 },
  { label: "Longa 3s", sec: 3 },
];

// Cordas soltas do baixo 4 cordas (afinação padrão).
// TODO: extrair para config de instrumento (4/5/6 cordas) quando vier o componente real do braço.
const OPEN_STRINGS: Note[] = [
  { name: "E", octave: 1 },
  { name: "A", octave: 1 },
  { name: "D", octave: 2 },
  { name: "G", octave: 2 },
];

// Escala cromática de ~uma oitava a partir de E2 (1ª posição), só para testar o áudio.
const CHROMATIC: Note[] = [
  { name: "E", octave: 2 },
  { name: "F", octave: 2 },
  { name: "F#", octave: 2 },
  { name: "G", octave: 2 },
  { name: "G#", octave: 2 },
  { name: "A", octave: 2 },
  { name: "A#", octave: 2 },
  { name: "B", octave: 2 },
  { name: "C", octave: 3 },
  { name: "C#", octave: 3 },
  { name: "D", octave: 3 },
  { name: "D#", octave: 3 },
  { name: "E", octave: 3 },
];

function NoteButton({ note, accent, durationSec }: { note: Note; accent: string; durationSec: number }) {
  return (
    <button
      onClick={() => playNoteByName(note.name, note.octave, durationSec)}
      className="px-3 py-2 text-sm font-medium rounded-lg transition-colors"
      style={{ background: accent, color: "#fff", borderRadius: "var(--radius-btn)" }}
    >
      {note.name}
      {note.octave}
    </button>
  );
}

/** Módulo 2 — Teoria e Escalas. Conteúdo temporário: grade de teste da engine de áudio. */
export function TheoryAndScales() {
  const [durationSec, setDurationSec] = useState(1.5);

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-semibold" style={{ color: "var(--color-text-primary)" }}>
          Teoria e Escalas
        </h2>
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          Teste temporário da engine de áudio — clique numa nota para ouvir a senoide.
        </p>
      </div>

      <section className="flex flex-col gap-2">
        <h3 className="text-xs uppercase tracking-widest" style={{ color: "var(--color-text-dim)" }}>
          Duração (sustain)
        </h3>
        <div className="flex flex-wrap gap-2">
          {DURATIONS.map((d) => {
            const isActive = d.sec === durationSec;
            return (
              <button
                key={d.sec}
                onClick={() => setDurationSec(d.sec)}
                className="px-3 py-2 text-sm font-medium transition-colors"
                style={{
                  background: isActive ? "var(--color-accent-pink)" : "var(--color-bg-card)",
                  color: isActive ? "#fff" : "var(--color-text-muted)",
                  borderRadius: "var(--radius-btn)",
                }}
              >
                {d.label}
              </button>
            );
          })}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-xs uppercase tracking-widest" style={{ color: "var(--color-text-dim)" }}>
          Cordas soltas
        </h3>
        <div className="flex flex-wrap gap-2">
          {OPEN_STRINGS.map((note) => (
            <NoteButton
              key={`${note.name}${note.octave}`}
              note={note}
              accent="var(--color-accent-purple)"
              durationSec={durationSec}
            />
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-xs uppercase tracking-widest" style={{ color: "var(--color-text-dim)" }}>
          Cromática (1ª posição)
        </h3>
        <div className="flex flex-wrap gap-2">
          {CHROMATIC.map((note) => (
            <NoteButton
              key={`${note.name}${note.octave}`}
              note={note}
              accent="var(--color-accent-teal)"
              durationSec={durationSec}
            />
          ))}
        </div>
      </section>
    </div>
  );
}