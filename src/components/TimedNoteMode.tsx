import { useEffect, useRef, useState } from "react";
import { Notation } from "./Notation";
import { playNoteByName } from "../engine/audio-engine";
import { pitchClassName } from "../engine/note-utils";
import {
  applyOutcome,
  createTimedRound,
  isCorrectAnswer,
  noteToBassTex,
  pickRandomNote,
  roundAccuracy,
  soundingOctave,
  timeLimitForDifficulty,
  type AnswerOutcome,
  type Difficulty,
  type RoundFormat,
  type TimedRoundState,
} from "../engine/reading-engine";

const ANSWER_LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
const FIXED_ROUND_SIZE = 10;
const FEEDBACK_MS = 1200; // pausa de feedback antes do auto-avanço
const TIMER_TICK_MS = 100;

const DIFFICULTIES: { id: Difficulty; label: string }[] = [
  { id: "facil", label: "Fácil" },
  { id: "medio", label: "Médio" },
  { id: "dificil", label: "Difícil" },
];

type UiPhase = "config" | "playing" | "done";
type NoteStatus = "waiting" | "correct" | "wrong" | "timeout";

/**
 * Modo Cronometrado (1.6a): identificação de notas do modo Livre + tempo limite por nota.
 * TODA resposta (certa, errada ou timeout) auto-avança após FEEDBACK_MS — sem botão
 * "Próxima": a cadência uniforme é a alma do modo. Timeout conta separado de erro no
 * resumo (velocidade vs leitura). Sem persistência: resultado dura a sessão (Módulo 3).
 */
export function TimedNoteMode() {
  const [phase, setPhase] = useState<UiPhase>("config");
  const [difficulty, setDifficulty] = useState<Difficulty>("facil");
  const [formatKind, setFormatKind] = useState<RoundFormat["kind"]>("fixed");
  const [round, setRound] = useState<TimedRoundState | null>(null);
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<NoteStatus>("waiting");
  const [remainingMs, setRemainingMs] = useState(0);
  // Recorde do CONTÍNUO na sessão: sobrevive a várias rodadas enquanto o modo está montado.
  const [sessionRecord, setSessionRecord] = useState(0);

  const timerRef = useRef<number | null>(null); // setInterval do countdown
  const advanceRef = useRef<number | null>(null); // setTimeout do auto-avanço
  const deadlineRef = useRef(0);
  const statusRef = useRef<NoteStatus>("waiting");
  // Espelho síncrono da rodada: resolveNote roda em callbacks de timer/click e precisa do
  // estado ATUAL sem updater com efeito colateral (StrictMode roda updaters 2×).
  const roundRef = useRef<TimedRoundState | null>(null);

  const timeLimitMs = timeLimitForDifficulty(difficulty) * 1000;
  const correctLetter = note ? pitchClassName(note) : "";

  const clearTimers = () => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    if (advanceRef.current !== null) window.clearTimeout(advanceRef.current);
    timerRef.current = null;
    advanceRef.current = null;
  };

  useEffect(() => clearTimers, []);

  const setNoteStatus = (s: NoteStatus) => {
    statusRef.current = s;
    setStatus(s);
  };

  /** Arma o countdown da nota atual; ao estourar, resolve como timeout. */
  const armTimer = () => {
    deadlineRef.current = performance.now() + timeLimitMs;
    setRemainingMs(timeLimitMs);
    timerRef.current = window.setInterval(() => {
      const left = deadlineRef.current - performance.now();
      if (left <= 0) {
        resolveNote("timeout");
      } else {
        setRemainingMs(left);
      }
    }, TIMER_TICK_MS);
  };

  const nextNote = (current: TimedRoundState) => {
    if (current.finished) {
      setPhase("done");
      return;
    }
    setNote(pickRandomNote());
    setNoteStatus("waiting");
    armTimer();
  };

  /** Fecha a nota atual com um resultado e agenda o auto-avanço. */
  const resolveNote = (outcome: AnswerOutcome) => {
    if (statusRef.current !== "waiting") return; // nota já resolvida (guarda de corrida)
    const prev = roundRef.current;
    if (!prev) return;
    clearTimers();
    setNoteStatus(outcome === "correct" ? "correct" : outcome === "wrong" ? "wrong" : "timeout");
    setRemainingMs(0);

    const next = applyOutcome(prev, outcome);
    roundRef.current = next;
    setRound(next);
    if (next.format.kind === "continuous") {
      setSessionRecord((rec) => Math.max(rec, next.bestStreak));
    }
    advanceRef.current = window.setTimeout(() => nextNote(next), FEEDBACK_MS);
  };

  const startRound = () => {
    clearTimers();
    const format: RoundFormat =
      formatKind === "fixed" ? { kind: "fixed", total: FIXED_ROUND_SIZE } : { kind: "continuous" };
    const fresh = createTimedRound(format);
    roundRef.current = fresh;
    setRound(fresh);
    setPhase("playing");
    setNote(pickRandomNote());
    setNoteStatus("waiting");
    armTimer();
  };

  /** Parada manual (contínuo): encerra com o estado atual como resumo. */
  const stopRound = () => {
    clearTimers();
    setPhase("done");
  };

  const answer = (letter: string) => {
    if (statusRef.current !== "waiting") return;
    if (isCorrectAnswer(note, letter)) {
      playNoteByName(correctLetter, soundingOctave(note)); // baixo soa 8ª abaixo do escrito
      resolveNote("correct");
    } else {
      resolveNote("wrong");
    }
  };

  const buttonColor = (letter: string): string => {
    if (status === "waiting") return "var(--color-bg-card)";
    if (letter === correctLetter) return "var(--color-accent-teal)"; // sempre mostra a certa
    return "var(--color-bg-card)";
  };

  // ---- fase CONFIG ----------------------------------------------------------------
  if (phase === "config") {
    return (
      <div className="flex flex-col gap-5">
        <h3 className="text-sm font-medium" style={{ color: "var(--color-text-muted)" }}>
          Modo Cronometrado · Identificação de Notas
        </h3>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs uppercase tracking-widest" style={{ color: "var(--color-text-dim)" }}>
            Dificuldade
          </span>
          {DIFFICULTIES.map((d) => (
            <button
              key={d.id}
              onClick={() => setDifficulty(d.id)}
              className="px-3 py-1.5 text-sm font-medium"
              style={{
                background: difficulty === d.id ? "var(--color-accent-purple)" : "var(--color-bg-card)",
                color: "#fff",
                borderRadius: "var(--radius-btn)",
              }}
            >
              {d.label} · {timeLimitForDifficulty(d.id)}s
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs uppercase tracking-widest" style={{ color: "var(--color-text-dim)" }}>
            Formato
          </span>
          <button
            onClick={() => setFormatKind("fixed")}
            className="px-3 py-1.5 text-sm font-medium"
            style={{
              background: formatKind === "fixed" ? "var(--color-accent-purple)" : "var(--color-bg-card)",
              color: "#fff",
              borderRadius: "var(--radius-btn)",
            }}
          >
            {FIXED_ROUND_SIZE} notas
          </button>
          <button
            onClick={() => setFormatKind("continuous")}
            className="px-3 py-1.5 text-sm font-medium"
            style={{
              background:
                formatKind === "continuous" ? "var(--color-accent-purple)" : "var(--color-bg-card)",
              color: "#fff",
              borderRadius: "var(--radius-btn)",
            }}
          >
            Contínuo (streak)
          </button>
        </div>

        <div>
          <button
            onClick={startRound}
            className="px-4 py-2 text-sm font-medium"
            style={{
              background: "var(--color-accent-purple)",
              color: "#fff",
              borderRadius: "var(--radius-btn)",
            }}
          >
            Iniciar
          </button>
        </div>
      </div>
    );
  }

  // ---- fases PLAYING / DONE ---------------------------------------------------------
  const isContinuous = round?.format.kind === "continuous";

  return (
    <div className="flex flex-col gap-5">
      <h3 className="text-sm font-medium" style={{ color: "var(--color-text-muted)" }}>
        Modo Cronometrado
        <span className="text-xs ml-2" style={{ color: "var(--color-text-dim)" }}>
          {DIFFICULTIES.find((d) => d.id === difficulty)?.label} ·{" "}
          {isContinuous ? "contínuo" : `${FIXED_ROUND_SIZE} notas`}
        </span>
      </h3>

      {phase === "playing" && round && (
        <>
          <div className="flex items-center gap-4 text-sm" style={{ color: "var(--color-text-muted)" }}>
            {isContinuous ? (
              <>
                <span>
                  Streak: <strong style={{ color: "var(--color-accent-teal)" }}>{round.streak}</strong>
                </span>
                <span>
                  Recorde da sessão:{" "}
                  <strong style={{ color: "var(--color-accent-purple-light)" }}>{sessionRecord}</strong>
                </span>
              </>
            ) : (
              <span>
                Nota {Math.min(round.answered + 1, FIXED_ROUND_SIZE)} de {FIXED_ROUND_SIZE}
              </span>
            )}
          </div>

          <Notation tex={noteToBassTex(note)} />

          {/* Barra de tempo restante da nota atual. */}
          <div
            className="h-2 w-full overflow-hidden"
            style={{ background: "var(--color-bg-card)", borderRadius: "var(--radius-btn)" }}
          >
            <div
              className="h-full"
              style={{
                width: `${(remainingMs / timeLimitMs) * 100}%`,
                background:
                  remainingMs / timeLimitMs > 0.35
                    ? "var(--color-accent-teal)"
                    : "var(--color-accent-pink)",
              }}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {ANSWER_LETTERS.map((letter) => (
              <button
                key={letter}
                onClick={() => answer(letter)}
                disabled={status !== "waiting"}
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

          <div className="flex items-center gap-4 min-h-6 text-sm">
            {status === "correct" && (
              <span className="font-medium" style={{ color: "var(--color-accent-teal)" }}>
                Certo!
              </span>
            )}
            {status === "wrong" && (
              <span className="font-medium" style={{ color: "var(--color-accent-pink)" }}>
                Era {correctLetter}.
              </span>
            )}
            {status === "timeout" && (
              <span className="font-medium" style={{ color: "var(--color-accent-pink)" }}>
                Tempo esgotado — era {correctLetter}.
              </span>
            )}
            {isContinuous && (
              <button
                onClick={stopRound}
                className="px-3 py-1.5 font-medium"
                style={{
                  background: "var(--color-bg-card)",
                  color: "var(--color-text-muted)",
                  borderRadius: "var(--radius-btn)",
                }}
              >
                Parar
              </button>
            )}
          </div>
        </>
      )}

      {phase === "done" && round && (
        <div
          className="flex flex-col gap-3 p-4"
          style={{ background: "var(--color-bg-card)", borderRadius: "var(--radius-card)" }}
        >
          {isContinuous ? (
            <>
              <span className="text-base font-semibold" style={{ color: "var(--color-accent-teal)" }}>
                Streak final: {round.bestStreak}
              </span>
              <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>
                Recorde da sessão: {sessionRecord} · {round.correct} acerto(s) em {round.answered}{" "}
                nota(s)
              </span>
            </>
          ) : (
            <>
              <span className="text-base font-semibold" style={{ color: "var(--color-text-primary)" }}>
                {Math.round(roundAccuracy(round) * 100)}% de acerto
              </span>
              <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>
                {round.correct} certas · {round.wrong} erradas · {round.timeouts} por tempo — em{" "}
                {round.answered} notas
              </span>
            </>
          )}
          <div className="flex gap-2">
            <button
              onClick={startRound}
              className="px-4 py-2 text-sm font-medium"
              style={{
                background: "var(--color-accent-purple)",
                color: "#fff",
                borderRadius: "var(--radius-btn)",
              }}
            >
              Jogar de novo
            </button>
            <button
              onClick={() => setPhase("config")}
              className="px-4 py-2 text-sm font-medium"
              style={{
                background: "var(--color-bg-card)",
                color: "var(--color-text-muted)",
                borderRadius: "var(--radius-btn)",
                border: "1px solid var(--color-border)",
              }}
            >
              Configurar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}