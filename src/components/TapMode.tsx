import { useEffect, useMemo, useRef, useState } from "react";
import { RhythmStaff, type RhythmStaffHandle } from "./RhythmStaff";
import {
  beatsPerBar,
  expectedTapTimes,
  patternDurationMs,
} from "../engine/rhythm-engine";
import { FIGURE_LABELS, generateLevelPass } from "../engine/rhythm-generator";
import {
  computeSummary,
  levelToPattern,
  levelToTex,
  type LevelSummary,
  type TapLevel,
} from "../engine/levels";
import { useTapRun } from "../hooks/useTapRun";
import { useAppStore } from "../store/useAppStore";

const BPM_MIN = 40;
const BPM_MAX = 200;
const BPM_PRESETS = [60, 80, 100, 120];

interface TapModeProps {
  level: TapLevel;
  /** Presente só quando o próximo nível existe E está desbloqueado (o pai decide). */
  onNextLevel?: () => void;
  /** Chamado a cada exercício CONCLUÍDO (fase done) — o pai persiste o resultado. */
  onFinished?: (summary: LevelSummary) => void;
}

export function TapMode({ level, onNextLevel, onFinished }: TapModeProps) {
  const staffRef = useRef<RhythmStaffHandle>(null);

  const [ready, setReady] = useState(false);
  const [metronome, setMetronome] = useState(true);
  const [bpm, setBpm] = useState(level.suggestedBpm);

  // Passada do gerador (3c-1): nasce no mount e é re-sorteada a CADA start() — Iniciar e
  // Repetir são tentativas novas, logo padrões novos.
  const [passEvents, setPassEvents] = useState(() => generateLevelPass(level));

  // Count-in de 1 compasso na fórmula do nível (4 cliques em 4/4, 3 em 3/4).
  const countInBeats = beatsPerBar(level.timeSignature);

  // Tudo derivado do MESMO nível+passada+bpm, sobre o padrão JÁ EXPANDIDO (loop×repeats) —
  // tex, alvos, duração e metrônomo cobrem todas as repetições de forma coerente.
  const clef = useAppStore((s) => s.clef);
  const pattern = useMemo(() => levelToPattern(level, passEvents, bpm), [level, passEvents, bpm]);
  const tex = useMemo(
    () => levelToTex(level, passEvents, bpm, clef),
    [level, passEvents, bpm, clef]
  );
  const targets = useMemo(() => expectedTapTimes(pattern), [pattern]);

  // Mecânica (count-in, clock, taps) no hook compartilhado com o Ditado; o que é do Tap —
  // o cursor da partitura — entra pelos callbacks. (Regressão da extração pro useTapRun
  // validada manualmente: count-in sem drift, linha/retângulo sincronizados, 1º compasso conta.)
  const run = useTapRun({
    onFrame: (elapsed) => {
      if (elapsed < 0) {
        staffRef.current?.updatePosition(0); // cursor parado no início durante o count-in
        return;
      }
      staffRef.current?.updatePosition(elapsed);
    },
    onStop: () => {
      staffRef.current?.pause();
    },
  });

  const start = () => {
    // Tentativa nova = padrão novo (3c-1). Tudo desta tentativa deriva da passada gerada
    // AQUI (síncrono): o setPassEvents só re-renderiza a partitura — o clock e os alvos não
    // dependem do render (o desenho pode chegar frames depois, durante o count-in).
    const newPass = generateLevelPass(level);
    const newPattern = levelToPattern(level, newPass, bpm);
    const newTargets = expectedTapTimes(newPattern);
    const newDurationMs = patternDurationMs(newPattern);
    setPassEvents(newPass);

    run.start({
      pattern: newPattern,
      targets: newTargets,
      durationMs: newDurationMs,
      countInBeats,
      metronome,
    });
  };

  // Ao CONCLUIR um exercício (fase done — "Parar" vai pra idle e não passa aqui), entrega o
  // resumo pro pai persistir. "Repetir" + nova conclusão dispara de novo (attempts_count
  // deve contar toda tentativa concluída).
  const onFinishedRef = useRef(onFinished);
  onFinishedRef.current = onFinished;
  useEffect(() => {
    if (run.phase !== "done") return;
    onFinishedRef.current?.(computeSummary(run.counts, targets.length, level.passThreshold));
    // counts/targets/level são estáveis enquanto phase === "done" (BPM/nível travados na
    // execução) — o efeito só dispara na transição de fase.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.phase]);

  const { phase, counts, feedback } = run;
  const running = phase === "countin" || phase === "playing";

  return (
    <div className="flex flex-col gap-5">
      <h3 className="text-sm font-medium" style={{ color: "var(--color-text-muted)" }}>
        Modo Tap · {level.name}
        <span className="text-xs ml-2" style={{ color: "var(--color-text-dim)" }}>
          {level.vocabulary.map((f) => FIGURE_LABELS[f]).join(" · ")}
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
            if (running) run.stop("idle");
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
            run.tap();
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
          // Alvo consumido <=> tap perfect/good, então "não tocadas" deriva das contagens.
          const missedTargets = targets.length - (counts.perfect + counts.good);
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