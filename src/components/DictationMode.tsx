import { useEffect, useMemo, useRef, useState } from "react";
import { Notation } from "./Notation";
import {
  audioContextTime,
  noteToFrequency,
  playClick,
  playTone,
} from "../engine/audio-engine";
import {
  beatsPerBar,
  dictationSchedule,
  expectedTapTimes,
  msPerBeat,
  patternDurationMs,
  totalBeats,
} from "../engine/rhythm-engine";
import { generateLevelPass } from "../engine/rhythm-generator";
import { computeSummary, levelToPattern, levelToTex, type TapLevel } from "../engine/levels";
import { useTapRun } from "../hooks/useTapRun";
import { useAppStore } from "../store/useAppStore";

const LEAD_SEC = 0.15; // offset pra não agendar sons no passado

// Onset de NOTA do ritmo: senoide grave (~C3) e mais longa — contraste em timbre, altura e
// duração com o pulso (playClick: square 1500Hz, 50ms). "Nota" soa instrumento; "pulso" relógio.
const NOTE_FREQ_HZ = noteToFrequency("C", 3);
const NOTE_DURATION_SEC = 0.3;

// No Ditado o padrão é propositalmente CURTO e repetido: memorizar 4 compassos corridos
// mede memória, não leitura de ouvido. Estrutura própria do modo (ignora a do Tap):
// 1 compasso gerado com o vocabulário do nível, tocado/reproduzido 2×.
const DICTATION_BARS = 1;
const DICTATION_REPEATS = 2;

function toDictationLevel(level: TapLevel): TapLevel {
  return {
    ...level,
    structure: { type: "loop", bars: DICTATION_BARS, repeats: DICTATION_REPEATS },
  };
}

type Stage = "listen" | "run" | "done";

interface DictationModeProps {
  level: TapLevel;
}

/**
 * Modo Ditado Rítmico (1.6b): ouvir o ritmo gerado (sem partitura) → reproduzir de memória
 * via ESPAÇO (mecânica do useTapRun, a mesma do Tap) → revelar a partitura + resumo.
 * Sem persistência: resultado dura a sessão (decisão igual à do Cronometrado, Módulo 3).
 */
export function DictationMode({ level }: DictationModeProps) {
  const bpm = level.suggestedBpm; // sem controle de BPM no Ditado (por ora)
  const countInBeats = beatsPerBar(level.timeSignature);

  // Perfil do nível com a estrutura curta do Ditado (1 compasso × 2).
  const dictLevel = useMemo(() => toDictationLevel(level), [level]);

  const [stage, setStage] = useState<Stage>("listen");
  const [passEvents, setPassEvents] = useState(() => generateLevelPass(toDictationLevel(level)));
  const [metronome, setMetronome] = useState(true);
  const [listening, setListening] = useState(false);
  const [beat, setBeat] = useState(0);

  const clef = useAppStore((s) => s.clef);
  const pattern = useMemo(
    () => levelToPattern(dictLevel, passEvents, bpm),
    [dictLevel, passEvents, bpm]
  );
  const tex = useMemo(
    () => levelToTex(dictLevel, passEvents, bpm, clef),
    [dictLevel, passEvents, bpm, clef]
  );
  const targets = useMemo(() => expectedTapTimes(pattern), [pattern]);
  const durationMs = useMemo(() => patternDurationMs(pattern), [pattern]);
  const beatsTotal = Math.round(totalBeats(pattern));
  const mpb = msPerBeat(bpm);

  // Playback da fase Ouvir: osciladores agendados + timer do indicador "tocando…".
  const listenOscsRef = useRef<OscillatorNode[]>([]);
  const listenTimerRef = useRef<number | null>(null);
  const lastBeatRef = useRef(0);

  const cancelListen = () => {
    for (const osc of listenOscsRef.current) {
      try {
        osc.stop();
      } catch {
        /* já parado */
      }
    }
    listenOscsRef.current = [];
    if (listenTimerRef.current !== null) window.clearTimeout(listenTimerRef.current);
    listenTimerRef.current = null;
    setListening(false);
  };

  useEffect(() => cancelListen, []);

  /** Toca o MESMO padrão gerado: 1 compasso de pulso puro + pulso de fundo + tom por nota. */
  const playListen = () => {
    cancelListen();
    const schedule = dictationSchedule(pattern, countInBeats);
    const t0 = audioContextTime() + LEAD_SEC;
    listenOscsRef.current = [
      ...schedule.pulseTimesMs.map((ms) => playClick(t0 + ms / 1000)),
      ...schedule.noteTimesMs.map((ms) => playTone(NOTE_FREQ_HZ, NOTE_DURATION_SEC, t0 + ms / 1000)),
    ];
    setListening(true);
    listenTimerRef.current = window.setTimeout(
      () => setListening(false),
      (LEAD_SEC + NOTE_DURATION_SEC) * 1000 + schedule.totalMs
    );
  };

  const run = useTapRun({
    onFrame: (elapsed) => {
      // Indicador neutro de batida (sem notação): atualiza o estado só quando muda.
      const b = elapsed >= 0 ? Math.min(Math.floor(elapsed / mpb) + 1, beatsTotal) : 0;
      if (b !== lastBeatRef.current) {
        lastBeatRef.current = b;
        setBeat(b);
      }
    },
  });

  // Fim da reprodução → revela partitura + resumo.
  useEffect(() => {
    if (run.phase === "done") setStage("done");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.phase]);

  const startReproduce = () => {
    cancelListen();
    lastBeatRef.current = 0;
    setBeat(0);
    setStage("run");
    run.start({ pattern, targets, durationMs, countInBeats, metronome });
  };

  const backToListen = (newPattern: boolean) => {
    run.stop("idle");
    cancelListen();
    if (newPattern) setPassEvents(generateLevelPass(dictLevel));
    setStage("listen");
  };

  const running = run.phase === "countin" || run.phase === "playing";

  return (
    <div className="flex flex-col gap-5">
      <h3 className="text-sm font-medium" style={{ color: "var(--color-text-muted)" }}>
        Ditado Rítmico · {level.name}
        <span className="text-xs ml-2" style={{ color: "var(--color-text-dim)" }}>
          {bpm} BPM · {DICTATION_BARS} compasso × {DICTATION_REPEATS}
        </span>
      </h3>

      {stage === "listen" && (
        <div className="flex flex-col gap-4">
          <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
            Ouça o ritmo (sem partitura): o <strong>clique agudo</strong> é o pulso do tempo;
            o <strong>tom grave</strong> é cada nota do ritmo. Depois reproduza de memória.
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={(e) => {
                e.currentTarget.blur();
                playListen();
              }}
              className="px-4 py-2 text-sm font-medium"
              style={{
                background: "var(--color-accent-purple)",
                color: "#fff",
                borderRadius: "var(--radius-btn)",
              }}
            >
              {listening ? "Tocando…" : "Ouvir"}
            </button>
            <button
              onClick={(e) => {
                e.currentTarget.blur();
                startReproduce();
              }}
              className="px-4 py-2 text-sm font-medium"
              style={{
                background: "var(--color-accent-teal)",
                color: "#fff",
                borderRadius: "var(--radius-btn)",
              }}
            >
              Pronto, vou reproduzir
            </button>
            <label className="flex items-center gap-2 text-sm" style={{ color: "var(--color-text-muted)" }}>
              <input
                type="checkbox"
                checked={metronome}
                onChange={(e) => setMetronome(e.target.checked)}
              />
              Metrônomo na reprodução
            </label>
          </div>
        </div>
      )}

      {stage === "run" && (
        <div
          className="flex flex-col gap-3 p-6 items-center"
          style={{ background: "var(--color-bg-card)", borderRadius: "var(--radius-card)" }}
        >
          {run.phase === "countin" ? (
            <span className="text-base" style={{ color: "var(--color-text-dim)" }}>
              Contagem…
            </span>
          ) : (
            <>
              <span className="text-base font-medium" style={{ color: "var(--color-text-primary)" }}>
                Reproduza o que você ouviu (ESPAÇO)
              </span>
              <span className="text-sm" style={{ color: "var(--color-text-dim)" }}>
                Batida {beat} de {beatsTotal}
              </span>
            </>
          )}
          <div className="min-h-6 text-sm">
            {run.phase === "playing" && run.feedback && (
              <span
                style={{
                  color:
                    run.feedback === "Perfeito!"
                      ? "var(--color-accent-teal)"
                      : run.feedback === "Bom"
                        ? "var(--color-accent-purple-light)"
                        : "var(--color-accent-pink)",
                }}
              >
                {run.feedback}
              </span>
            )}
          </div>
          {running && (
            <button
              onClick={(e) => {
                e.currentTarget.blur();
                backToListen(false);
              }}
              className="px-3 py-1.5 text-sm font-medium"
              style={{
                background: "var(--color-bg-base)",
                color: "var(--color-text-muted)",
                borderRadius: "var(--radius-btn)",
              }}
            >
              Parar
            </button>
          )}
        </div>
      )}

      {stage === "done" &&
        (() => {
          const missedTargets = targets.length - (run.counts.perfect + run.counts.good);
          const summary = computeSummary(run.counts, targets.length, level.passThreshold);
          return (
            <div className="flex flex-col gap-4">
              {/* Revelação: o padrão real que foi tocado/reproduzido. */}
              <Notation tex={tex} />
              <div
                className="flex flex-col gap-3 p-4"
                style={{ background: "var(--color-bg-card)", borderRadius: "var(--radius-card)" }}
              >
                <span
                  className="text-base font-semibold"
                  style={{
                    color: summary.passed ? "var(--color-accent-teal)" : "var(--color-accent-pink)",
                  }}
                >
                  {Math.round(summary.ratio * 100)}% de acerto
                  <span className="text-xs font-normal ml-2" style={{ color: "var(--color-text-dim)" }}>
                    (referência do nível: {Math.round(level.passThreshold * 100)}%)
                  </span>
                </span>
                <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>
                  {summary.hits} de {targets.length} notas ({run.counts.perfect} perfeitas,{" "}
                  {run.counts.good} boas) · {missedTargets} não tocadas · {run.counts.miss} taps
                  fora de hora
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={(e) => {
                      e.currentTarget.blur();
                      backToListen(false);
                    }}
                    className="px-4 py-2 text-sm font-medium"
                    style={{
                      background: "var(--color-accent-purple)",
                      color: "#fff",
                      borderRadius: "var(--radius-btn)",
                    }}
                  >
                    Tentar de novo
                  </button>
                  <button
                    onClick={(e) => {
                      e.currentTarget.blur();
                      backToListen(true);
                    }}
                    className="px-4 py-2 text-sm font-medium"
                    style={{
                      background: "var(--color-accent-teal)",
                      color: "#fff",
                      borderRadius: "var(--radius-btn)",
                    }}
                  >
                    Novo ritmo
                  </button>
                </div>
              </div>
            </div>
          );
        })()}
    </div>
  );
}