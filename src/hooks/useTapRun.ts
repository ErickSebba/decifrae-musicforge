import { useEffect, useRef, useState } from "react";
import { audioContextTime, playClick } from "../engine/audio-engine";
import {
  DEFAULT_WINDOWS,
  classifyTap,
  metronomeClickTimes,
  msPerBeat,
  type RhythmPattern,
  type TapResult,
} from "../engine/rhythm-engine";

/**
 * Mecânica compartilhada de execução rítmica (Tap e Ditado), extraída 1:1 do TapMode:
 * count-in de cliques sempre audível, t0 no clock do AudioContext (fonte de verdade),
 * metrônomo opcional, loop de RAF, tap classificado por classifyTap com alvos consumíveis,
 * auto-stop em durationMs + 300. O chamador pluga o que é dele via callbacks: cursor da
 * partitura e logs de diagnóstico (Tap) entram por onFrame/onDiscardedTap/onTapResult.
 *
 * IMPORTANTE (sincronia do cursor): o hook NÃO chama api.play() em lugar nenhum — o player
 * do AlphaTab fica Paused e a linha segue exclusivamente o updatePosition disparado pelo
 * onFrame do chamador (fix validado dos bugs de drift do count-in / linha adiantada).
 */

export type TapRunPhase = "idle" | "countin" | "playing" | "done";

const LEAD_SEC = 0.15; // pequeno offset para não agendar cliques no passado

export interface TapRunStartArgs {
  pattern: RhythmPattern;
  /** Alvos (ms) já expandidos — expectedTapTimes do padrão. */
  targets: number[];
  durationMs: number;
  /** Cliques de count-in (1 compasso na fórmula do nível). */
  countInBeats: number;
  metronome: boolean;
}

export interface TapRunCallbacks {
  /** A cada frame com clock armado; elapsedMs é NEGATIVO durante o count-in. */
  onFrame?: (elapsedMs: number) => void;
  /** Tap engolido fora da fase playing (diagnóstico do Tap). */
  onDiscardedTap?: (wouldBeTapMs: number) => void;
  /** Resultado de cada tap classificado (log do Tap). */
  onTapResult?: (tapMs: number, result: TapResult, index: number) => void;
  /** Chamado em todo término (auto-stop ou manual) — ex.: pausar o staff. */
  onStop?: (finalPhase: TapRunPhase) => void;
}

export function useTapRun(callbacks: TapRunCallbacks = {}) {
  const cbRef = useRef(callbacks);
  cbRef.current = callbacks;

  const [phase, setPhaseState] = useState<TapRunPhase>("idle");
  const [counts, setCounts] = useState<Record<TapResult, number>>({
    perfect: 0,
    good: 0,
    miss: 0,
  });
  const [feedback, setFeedback] = useState("");

  const phaseRef = useRef<TapRunPhase>("idle");
  const rafRef = useRef<number | null>(null);
  const t0Ref = useRef(0); // tempo (s) do contexto onde o padrão começa (após count-in)
  const consumedRef = useRef<Set<number>>(new Set());
  const scheduledRef = useRef<OscillatorNode[]>([]);
  const targetsRef = useRef<number[]>([]);
  const durationMsRef = useRef(0);

  const setPhase = (p: TapRunPhase) => {
    phaseRef.current = p;
    setPhaseState(p);
  };

  const stop = (finalPhase: TapRunPhase) => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    for (const osc of scheduledRef.current) {
      try {
        osc.stop();
      } catch {
        /* já parado */
      }
    }
    scheduledRef.current = [];
    setPhase(finalPhase);
    cbRef.current.onStop?.(finalPhase);
  };

  /** Arma count-in + clock + loop. Retorna countInStart/t0 (s) pro log do chamador. */
  const start = (args: TapRunStartArgs): { countInStart: number; t0: number } => {
    consumedRef.current = new Set();
    setCounts({ perfect: 0, good: 0, miss: 0 });
    setFeedback("");
    targetsRef.current = args.targets;
    durationMsRef.current = args.durationMs;

    const mpb = msPerBeat(args.pattern.tempo);
    const countInStart = audioContextTime() + LEAD_SEC;
    const t0 = countInStart + (args.countInBeats * mpb) / 1000;
    t0Ref.current = t0;

    // Count-in: sempre audível (independe do toggle do metrônomo).
    scheduledRef.current = [];
    for (let i = 0; i < args.countInBeats; i++) {
      scheduledRef.current.push(playClick(countInStart + (i * mpb) / 1000));
    }
    // Pulso do exercício: só se o metrônomo estiver ligado.
    if (args.metronome) {
      for (const ct of metronomeClickTimes(args.pattern)) {
        scheduledRef.current.push(playClick(t0 + ct / 1000));
      }
    }

    setPhase("countin");

    const loop = () => {
      const elapsed = (audioContextTime() - t0Ref.current) * 1000;
      cbRef.current.onFrame?.(elapsed);
      if (elapsed >= 0) {
        if (phaseRef.current !== "playing") setPhase("playing");
        if (elapsed >= durationMsRef.current + 300) {
          stop("done");
          return;
        }
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return { countInStart, t0 };
  };

  const tap = () => {
    if (phaseRef.current !== "playing") {
      cbRef.current.onDiscardedTap?.((audioContextTime() - t0Ref.current) * 1000);
      return;
    }
    const tapMs = (audioContextTime() - t0Ref.current) * 1000;
    const { result, index } = classifyTap(
      tapMs,
      targetsRef.current,
      DEFAULT_WINDOWS,
      consumedRef.current
    );
    cbRef.current.onTapResult?.(tapMs, result, index);
    if (index >= 0) consumedRef.current.add(index);
    setCounts((c) => ({ ...c, [result]: c[result] + 1 }));
    setFeedback(result === "perfect" ? "Perfeito!" : result === "good" ? "Bom" : "Errou");
  };

  const tapRef = useRef(tap);
  tapRef.current = tap;

  // Tap por ESPAÇO (listener ligado uma vez; estado vem via refs).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        tapRef.current();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

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

  return { phase, counts, feedback, start, stop, tap };
}