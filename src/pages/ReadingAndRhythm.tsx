import { useEffect, useMemo, useState } from "react";
import { Notation } from "../components/Notation";
import { TapMode } from "../components/TapMode";
import { TimedNoteMode } from "../components/TimedNoteMode";
import {
  CURATED_LEVELS,
  deriveUnlockedLevels,
  type LevelSummary,
  type ProgressRecord,
} from "../engine/levels";
import { getLevelProgress, saveLevelResult } from "../db/level-progress";
import { playNoteByName } from "../engine/audio-engine";
import { pitchClassName } from "../engine/note-utils";
import {
  isCorrectAnswer,
  noteToBassTex,
  pickRandomNote,
  soundingOctave,
} from "../engine/reading-engine";

const MODES: { id: string; label: string; enabled: boolean }[] = [
  { id: "free", label: "Livre", enabled: true },
  { id: "tap", label: "Tap", enabled: true },
  { id: "timed", label: "Cronometrado", enabled: true },
  { id: "dictation", label: "Ditado", enabled: false },
];

const ANSWER_LETTERS = ["C", "D", "E", "F", "G", "A", "B"];

const LEVEL_ORDER = CURATED_LEVELS.map((lv) => lv.id);

/** Seleção de nível do Tap com desbloqueio linear persistido (3b). */
function TapSection() {
  const [levelIndex, setLevelIndex] = useState(0);
  const [progress, setProgress] = useState<ProgressRecord[]>([]);

  // Desbloqueio derivado em runtime do `passed` dos anteriores — nada de estado próprio.
  const unlocked = useMemo(() => deriveUnlockedLevels(LEVEL_ORDER, progress), [progress]);
  const byLevel = useMemo(
    () => new Map(progress.map((p) => [p.levelId, p])),
    [progress]
  );

  // Carga inicial: lê o progresso e posiciona a seleção no "nível atual" (primeiro
  // desbloqueado ainda não passado; se todos passados, o último).
  useEffect(() => {
    let cancelled = false;
    getLevelProgress().then((records) => {
      if (cancelled) return;
      setProgress(records);
      const open = deriveUnlockedLevels(LEVEL_ORDER, records);
      const passed = new Set(records.filter((p) => p.passed).map((p) => p.levelId));
      const current = CURATED_LEVELS.findIndex((lv) => open.has(lv.id) && !passed.has(lv.id));
      setLevelIndex(current >= 0 ? current : CURATED_LEVELS.length - 1);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const level = CURATED_LEVELS[levelIndex];
  const nextLevel = CURATED_LEVELS[levelIndex + 1];
  const nextUnlocked = nextLevel !== undefined && unlocked.has(nextLevel.id);

  // Persiste a tentativa concluída e relê o progresso — check/%, cadeados e o botão
  // "Próximo nível" do resumo atualizam na hora se o nível acabou de ser passado.
  const onFinished = (summary: LevelSummary) => {
    saveLevelResult(level.id, summary.ratio, summary.passed)
      .then(getLevelProgress)
      .then(setProgress);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {CURATED_LEVELS.map((lv, i) => {
          const isActive = i === levelIndex;
          const isUnlocked = unlocked.has(lv.id);
          const record = byLevel.get(lv.id);
          const showBest = record?.passed ? ` ✓ ${Math.round(record.bestRatio * 100)}%` : "";
          return (
            <button
              key={lv.id}
              disabled={!isUnlocked}
              onClick={(e) => {
                e.currentTarget.blur();
                setLevelIndex(i);
              }}
              className="px-3 py-1.5 text-sm font-medium"
              style={{
                background: isActive ? "var(--color-accent-purple)" : "var(--color-bg-card)",
                color: isActive ? "#fff" : "var(--color-text-muted)",
                borderRadius: "var(--radius-btn)",
                opacity: isUnlocked ? 1 : 0.45,
                cursor: isUnlocked ? "pointer" : "not-allowed",
              }}
              aria-label={isUnlocked ? lv.name : `${lv.name} (bloqueado)`}
            >
              {isUnlocked ? `${i + 1}. ${lv.name}${showBest}` : `🔒 ${i + 1}. ${lv.name}`}
            </button>
          );
        })}
      </div>

      {/* key={level.id} remonta o TapMode ao trocar de nível (reseta BPM, fase, contagens). */}
      <TapMode
        key={level.id}
        level={level}
        onFinished={onFinished}
        onNextLevel={nextUnlocked ? () => setLevelIndex(levelIndex + 1) : undefined}
      />
    </div>
  );
}

type Status = "idle" | "correct" | "wrong";

function FreeNoteMode() {
  const [note, setNote] = useState(() => pickRandomNote());
  const [status, setStatus] = useState<Status>("idle");
  const [selected, setSelected] = useState<string | null>(null);

  const correctLetter = pitchClassName(note);

  const answer = (letter: string) => {
    if (status !== "idle") return; // trava após responder até "Próxima"
    setSelected(letter);
    if (isCorrectAnswer(note, letter)) {
      setStatus("correct");
      // O baixo soa uma 8ª abaixo do escrito.
      playNoteByName(correctLetter, soundingOctave(note));
    } else {
      setStatus("wrong");
    }
  };

  const next = () => {
    setNote(pickRandomNote());
    setStatus("idle");
    setSelected(null);
  };

  const buttonColor = (letter: string): string => {
    if (status === "idle") return "var(--color-bg-card)";
    if (letter === correctLetter) return "var(--color-accent-teal)"; // sempre mostra a certa
    if (letter === selected) return "var(--color-accent-pink)"; // a errada escolhida
    return "var(--color-bg-card)";
  };

  return (
    <div className="flex flex-col gap-5">
      <h3 className="text-sm font-medium" style={{ color: "var(--color-text-muted)" }}>
        Modo Livre · Identificação de Notas
      </h3>

      <Notation tex={noteToBassTex(note)} />

      <div className="flex flex-wrap gap-2">
        {ANSWER_LETTERS.map((letter) => (
          <button
            key={letter}
            onClick={() => answer(letter)}
            disabled={status !== "idle"}
            className="w-12 h-12 text-base font-semibold transition-colors"
            style={{
              background: buttonColor(letter),
              color: "#fff",
              borderRadius: "var(--radius-btn)",
            }}
          >
            {letter}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-4 min-h-8">
        {status === "correct" && (
          <span className="text-sm font-medium" style={{ color: "var(--color-accent-teal)" }}>
            Certo!
          </span>
        )}
        {status === "wrong" && (
          <span className="text-sm font-medium" style={{ color: "var(--color-accent-pink)" }}>
            Era {correctLetter}.
          </span>
        )}
        <button
          onClick={next}
          className="px-4 py-2 text-sm font-medium transition-colors"
          style={{
            background: "var(--color-accent-purple)",
            color: "#fff",
            borderRadius: "var(--radius-btn)",
          }}
        >
          Próxima
        </button>
      </div>
    </div>
  );
}

/** Módulo 1 — Leitura e Ritmo. Seletor de modo + modo Livre (sem pressão de tempo). */
export function ReadingAndRhythm() {
  const [activeMode, setActiveMode] = useState("free");

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-semibold" style={{ color: "var(--color-text-primary)" }}>
          Leitura e Ritmo
        </h2>
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          Identifique a nota mostrada na pauta, no seu ritmo.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {MODES.map((mode) => {
          const isActive = mode.id === activeMode;
          return (
            <button
              key={mode.id}
              disabled={!mode.enabled}
              onClick={() => mode.enabled && setActiveMode(mode.id)}
              className="px-3 py-2 text-sm font-medium transition-colors"
              style={{
                background: isActive ? "var(--color-accent-purple)" : "var(--color-bg-card)",
                color: mode.enabled ? "#fff" : "var(--color-text-dim)",
                borderRadius: "var(--radius-btn)",
                cursor: mode.enabled ? "pointer" : "not-allowed",
              }}
            >
              {mode.label}
              {!mode.enabled && " · em breve"}
            </button>
          );
        })}
      </div>

      {activeMode === "free" && <FreeNoteMode />}
      {activeMode === "tap" && <TapSection />}
      {activeMode === "timed" && <TimedNoteMode />}
    </div>
  );
}