import { useEffect, useMemo, useRef, useState } from "react";
import { RhythmStaff, type RhythmStaffHandle } from "./RhythmStaff";
import { audioContextTime, playClick } from "../engine/audio-engine";
import {
  DEFAULT_WINDOWS,
  classifyTap,
  expectedTapTimes,
  metronomeClickTimes,
  msPerBeat,
  patternDurationMs,
  type TapResult,
} from "../engine/rhythm-engine";
import {
  computeSummary,
  levelToPattern,
  levelToTex,
  type LevelSummary,
  type TapLevel,
} from "../engine/levels";

const COUNT_IN_BEATS = 4; // 1 compasso 4/4 de contagem antes da partitura avançar
const LEAD_SEC = 0.15; // pequeno offset para não agendar cliques no passado

const BPM_MIN = 40;
const BPM_MAX = 200;
const BPM_PRESETS = [60, 80, 100, 120];

type Phase = "idle" | "countin" | "playing" | "done";

// TEMP diag: translateX atual da linha (.at-cursor-beat) e do retângulo (.at-cursor-bar).
function cursorXs(): { line: number | null; bar: number | null } {
  const read = (sel: string) => {
    const el = document.querySelector(sel) as HTMLElement | null;
    const m = el?.style.transform.match(/translate\((-?[\d.]+)px/);
    return m ? Number(m[1]) : null;
  };
  return { line: read(".at-cursor-beat"), bar: read(".at-cursor-bar") };
}

interface TapModeProps {
  level: TapLevel;
  /** Presente só quando o próximo nível existe E está desbloqueado (o pai decide). */
  onNextLevel?: () => void;
  /** Chamado a cada exercício CONCLUÍDO (fase done) — o pai persiste o resultado. */
  onFinished?: (summary: LevelSummary) => void;
}

export function TapMode({ level, onNextLevel, onFinished }: TapModeProps) {
  const staffRef = useRef<RhythmStaffHandle>(null);
  const rafRef = useRef<number | null>(null);
  const t0Ref = useRef(0); // tempo (s) do contexto onde a partitura começa (após count-in)
  const consumedRef = useRef<Set<number>>(new Set());
  const scheduledRef = useRef<OscillatorNode[]>([]);
  const phaseRef = useRef<Phase>("idle");
  const cursorStartLoggedRef = useRef(false); // TEMP: log do início real do cursor
  const countinLineXRef = useRef<number | null>(null); // TEMP diag: x da linha no início do count-in
  const driftLoggedRef = useRef(false); // TEMP diag
  const lastAxisLogRef = useRef(0); // TEMP diag: throttle do log de eixos

  const [ready, setReady] = useState(false);
  const [metronome, setMetronome] = useState(true);
  const [bpm, setBpm] = useState(level.suggestedBpm);
  const [phase, setPhaseState] = useState<Phase>("idle");
  const [counts, setCounts] = useState<Record<TapResult, number>>({ perfect: 0, good: 0, miss: 0 });
  const [feedback, setFeedback] = useState("");

  // Tudo derivado do MESMO nível+bpm, sobre o padrão JÁ EXPANDIDO (loop×repeats/through) —
  // tex, alvos, duração e metrônomo cobrem todas as repetições de forma coerente.
  const pattern = useMemo(() => levelToPattern(level, bpm), [level, bpm]);
  const tex = useMemo(() => levelToTex(level, bpm), [level, bpm]);
  const targets = useMemo(() => expectedTapTimes(pattern), [pattern]);
  const durationMs = useMemo(() => patternDurationMs(pattern), [pattern]);
  const msPerBeatValue = useMemo(() => msPerBeat(bpm), [bpm]);

  // onTap roda num listener ligado uma vez; lê os alvos atuais via ref (evita closure obsoleta).
  const targetsRef = useRef(targets);
  targetsRef.current = targets;

  const setPhase = (p: Phase) => {
    phaseRef.current = p;
    setPhaseState(p);
  };

  const stop = (finalPhase: Phase) => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    staffRef.current?.pause();
    for (const osc of scheduledRef.current) {
      try {
        osc.stop();
      } catch {
        /* já parado */
      }
    }
    scheduledRef.current = [];
    setPhase(finalPhase);
  };

  const start = () => {
    consumedRef.current = new Set();
    setCounts({ perfect: 0, good: 0, miss: 0 });
    setFeedback("");

    const countInStart = audioContextTime() + LEAD_SEC;
    const t0 = countInStart + (COUNT_IN_BEATS * msPerBeatValue) / 1000;
    t0Ref.current = t0;
    cursorStartLoggedRef.current = false;
    countinLineXRef.current = null;
    driftLoggedRef.current = false;
    lastAxisLogRef.current = 0;

    // TEMP: confirma que count-in, t0 e alvos estão no mesmo eixo.
    console.log("[Tap] start", {
      bpm,
      now_s: audioContextTime(),
      countInStart_s: countInStart,
      t0_s: t0,
      countIn_ms: COUNT_IN_BEATS * msPerBeatValue,
      duration_ms: durationMs,
      expectedTapTimes_ms: targets,
    });

    // Count-in: sempre audível (independe do toggle do metrônomo).
    scheduledRef.current = [];
    for (let i = 0; i < COUNT_IN_BEATS; i++) {
      scheduledRef.current.push(playClick(countInStart + (i * msPerBeatValue) / 1000));
    }
    // Pulso do exercício: só se o metrônomo estiver ligado.
    if (metronome) {
      for (const ct of metronomeClickTimes(pattern)) {
        scheduledRef.current.push(playClick(t0 + ct / 1000));
      }
    }

    // NÃO chamamos staff.play(): com o player em Paused, o AlphaTab reposiciona a linha a
    // CADA updatePosition com interpolação por tick (forceUpdate), sem a transição CSS do
    // modo Playing — a linha fica 100% travada no nosso clock (fix dos bugs de sincronia:
    // linha andando sozinha no count-in e adiantada em relação ao retângulo de compasso).
    setPhase("countin");

    const loop = () => {
      const elapsed = (audioContextTime() - t0Ref.current) * 1000;
      if (elapsed < 0) {
        staffRef.current?.updatePosition(0); // cursor parado no início durante o count-in

        // TEMP diag (bug 1/2): durante o count-in a linha NÃO deveria se mover — seguramos a
        // posição em 0. Se ela andar aqui, é a transição CSS do cursor animado correndo sozinha.
        const { line } = cursorXs();
        if (line !== null) {
          if (countinLineXRef.current === null) {
            countinLineXRef.current = line;
          } else if (!driftLoggedRef.current && Math.abs(line - countinLineXRef.current) > 2) {
            driftLoggedRef.current = true;
            console.log("[Tap] DIAG: linha se moveu DURANTE o count-in (não deveria)", {
              xInicial: Math.round(countinLineXRef.current),
              xAtual: Math.round(line),
              elapsed_ms: Math.round(elapsed),
            });
          }
        }
      } else {
        if (!cursorStartLoggedRef.current) {
          cursorStartLoggedRef.current = true;
          // TEMP: o cursor começa a andar aqui — deve coincidir com t0 e com o alvo[0]=0.
          console.log("[Tap] cursor começou a andar", {
            now_s: audioContextTime(),
            t0_s: t0Ref.current,
            elapsed_ms: elapsed,
          });
        }
        staffRef.current?.updatePosition(elapsed);
        if (phaseRef.current !== "playing") setPhase("playing");

        // TEMP diag (bug 2): a cada ~500ms compara o eixo do clock com a posição visual da
        // linha e do retângulo. Se a linha estiver ~1 batida à frente do retângulo, é a
        // transição CSS adiantando a linha (retângulo segue o tick verdadeiro).
        if (elapsed - lastAxisLogRef.current >= 500) {
          lastAxisLogRef.current = elapsed;
          const { line, bar } = cursorXs();
          console.log("[Tap] DIAG eixo", {
            elapsed_ms: Math.round(elapsed),
            batida: Math.round((elapsed / msPerBeatValue) * 10) / 10,
            lineX: line === null ? null : Math.round(line),
            barRectX: bar === null ? null : Math.round(bar),
          });
        }
        if (elapsed >= durationMs + 300) {
          stop("done");
          return;
        }
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  };

  const onTap = () => {
    if (phaseRef.current !== "playing") {
      // TEMP diag (bug 1): tap descartado pelo gate de fase. Se os seus taps do 1º compasso
      // aparecerem aqui como fase=countin, você está seguindo uma linha que anda adiantada.
      const wouldBe = (audioContextTime() - t0Ref.current) * 1000;
      console.log("[Tap] DIAG tap DESCARTADO", {
        fase: phaseRef.current,
        wouldBeTapMs: Math.round(wouldBe),
      });
      return;
    }
    const tapMs = (audioContextTime() - t0Ref.current) * 1000;
    const { result, index } = classifyTap(tapMs, targetsRef.current, DEFAULT_WINDOWS, consumedRef.current);
    console.log("[Tap] tap", { tapMs: Math.round(tapMs), result, index }); // TEMP
    if (index >= 0) consumedRef.current.add(index);
    setCounts((c) => ({ ...c, [result]: c[result] + 1 }));
    setFeedback(result === "perfect" ? "Perfeito!" : result === "good" ? "Bom" : "Errou");
  };

  // Tap por ESPAÇO (listener ligado uma vez; lê phase/t0 via refs).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        onTap();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ao CONCLUIR um exercício (fase done — "Parar" vai pra idle e não passa aqui), entrega o
  // resumo pro pai persistir. "Repetir" + nova conclusão dispara de novo (attempts_count
  // deve contar toda tentativa concluída).
  const onFinishedRef = useRef(onFinished);
  onFinishedRef.current = onFinished;
  useEffect(() => {
    if (phase !== "done") return;
    onFinishedRef.current?.(computeSummary(counts, targets.length, level.passThreshold));
    // counts/targets/level são estáveis enquanto phase === "done" (BPM/nível travados na
    // execução) — o efeito só dispara na transição de fase.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Limpa RAF/cliques ao desmontar.
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      for (const osc of scheduledRef.current) {
        try {
          osc.stop();
        } catch {
          /* noop */
        }
      }
    };
  }, []);

  const running = phase === "countin" || phase === "playing";

  return (
    <div className="flex flex-col gap-5">
      <h3 className="text-sm font-medium" style={{ color: "var(--color-text-muted)" }}>
        Modo Tap · {level.name}
        <span className="text-xs ml-2" style={{ color: "var(--color-text-dim)" }}>
          {level.vocabulary.join(" · ")}
          {level.structure.type === "loop" && ` · ${level.structure.repeats}× repetições`}
        </span>
      </h3>

      <RhythmStaff ref={staffRef} tex={tex} onReady={() => setReady(true)} />

      {/* BPM: presets + ajuste fino. Recalcula tex/alvos/metrônomo do mesmo tempo.
          Travado durante a execução — só muda entre exercícios. */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs uppercase tracking-widest" style={{ color: "var(--color-text-dim)" }}>
          BPM
        </span>
        {BPM_PRESETS.map((preset) => (
          <button
            key={preset}
            disabled={running}
            onClick={(e) => {
              e.currentTarget.blur();
              setBpm(preset);
            }}
            className="px-2.5 py-1 text-sm font-medium"
            style={{
              background: bpm === preset ? "var(--color-accent-purple)" : "var(--color-bg-card)",
              color: running ? "var(--color-text-dim)" : "#fff",
              borderRadius: "var(--radius-btn)",
              cursor: running ? "not-allowed" : "pointer",
            }}
          >
            {preset}
          </button>
        ))}
        <input
          type="number"
          min={BPM_MIN}
          max={BPM_MAX}
          value={bpm}
          disabled={running}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (!Number.isNaN(v)) setBpm(Math.min(BPM_MAX, Math.max(BPM_MIN, v)));
          }}
          className="w-16 px-2 py-1 text-sm"
          style={{
            background: "var(--color-bg-card)",
            color: "var(--color-text-primary)",
            borderRadius: "var(--radius-btn)",
            border: "1px solid var(--color-border)",
          }}
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={(e) => {
            e.currentTarget.blur(); // sem foco → Espaço não reativa este botão (vira só tap)
            if (running) stop("idle");
            else start();
          }}
          disabled={!ready}
          className="px-4 py-2 text-sm font-medium"
          style={{
            background: ready ? "var(--color-accent-purple)" : "var(--color-bg-card)",
            color: "#fff",
            borderRadius: "var(--radius-btn)",
            cursor: ready ? "pointer" : "not-allowed",
          }}
        >
          {running ? "Parar" : "Iniciar"}
        </button>

        <label className="flex items-center gap-2 text-sm" style={{ color: "var(--color-text-muted)" }}>
          <input
            type="checkbox"
            checked={metronome}
            onChange={(e) => setMetronome(e.target.checked)}
            disabled={running}
          />
          Metrônomo
        </label>

        <button
          onClick={(e) => {
            e.currentTarget.blur(); // evita duplo-tap via Espaço no botão focado
            onTap();
          }}
          disabled={phase !== "playing"}
          className="px-4 py-2 text-sm font-medium"
          style={{
            background: phase === "playing" ? "var(--color-accent-teal)" : "var(--color-bg-card)",
            color: "#fff",
            borderRadius: "var(--radius-btn)",
            cursor: phase === "playing" ? "pointer" : "not-allowed",
          }}
        >
          Tocar (Espaço)
        </button>
      </div>

      <div className="min-h-6 text-sm">
        {phase === "countin" && <span style={{ color: "var(--color-text-dim)" }}>Contagem…</span>}
        {phase === "playing" && feedback && (
          <span
            style={{
              color:
                feedback === "Perfeito!"
                  ? "var(--color-accent-teal)"
                  : feedback === "Bom"
                    ? "var(--color-accent-purple-light)"
                    : "var(--color-accent-pink)",
            }}
          >
            {feedback}
          </span>
        )}
      </div>

      {/* Resumo do exercício: % de acerto sobre o total de alvos e aprovação do nível. */}
      {phase === "done" &&
        (() => {
          const missedTargets = targets.length - consumedRef.current.size;
          const summary = computeSummary(counts, targets.length, level.passThreshold);
          return (
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
                {summary.passed ? "Passou!" : "Não passou"} — {Math.round(summary.ratio * 100)}%
                <span className="text-xs font-normal ml-2" style={{ color: "var(--color-text-dim)" }}>
                  (mínimo {Math.round(level.passThreshold * 100)}%)
                </span>
              </span>
              <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>
                {summary.hits} de {targets.length} notas ({counts.perfect} perfeitas, {counts.good}{" "}
                boas) · {missedTargets} não tocadas · {counts.miss} taps fora de hora
              </span>
              <div className="flex gap-2">
                <button
                  onClick={(e) => {
                    e.currentTarget.blur();
                    start();
                  }}
                  className="px-4 py-2 text-sm font-medium"
                  style={{
                    background: "var(--color-accent-purple)",
                    color: "#fff",
                    borderRadius: "var(--radius-btn)",
                  }}
                >
                  Repetir
                </button>
                {onNextLevel && (
                  <button
                    onClick={(e) => {
                      e.currentTarget.blur();
                      onNextLevel();
                    }}
                    className="px-4 py-2 text-sm font-medium"
                    style={{
                      background: "var(--color-accent-teal)",
                      color: "#fff",
                      borderRadius: "var(--radius-btn)",
                    }}
                  >
                    Próximo nível
                  </button>
                )}
              </div>
            </div>
          );
        })()}

      <dl className="flex gap-6 text-sm" style={{ color: "var(--color-text-muted)" }}>
        <div>
          <dt className="text-xs uppercase tracking-widest" style={{ color: "var(--color-text-dim)" }}>
            Perfeito
          </dt>
          <dd style={{ color: "var(--color-accent-teal)" }}>{counts.perfect}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-widest" style={{ color: "var(--color-text-dim)" }}>
            Bom
          </dt>
          <dd style={{ color: "var(--color-accent-purple-light)" }}>{counts.good}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-widest" style={{ color: "var(--color-text-dim)" }}>
            Errou
          </dt>
          <dd style={{ color: "var(--color-accent-pink)" }}>{counts.miss}</dd>
        </div>
      </dl>
    </div>
  );
}