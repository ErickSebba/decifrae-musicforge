import { useEffect, useRef, useState } from "react";
import { audioContextTime, noteToFrequency, playTone } from "../engine/audio-engine";
import { soundingOctave } from "../engine/reading-engine";
import type { ScalePlaybackSchedule } from "../engine/theory-tex";

/**
 * Playback automático de escala (2.3): agenda o som de cada nota no clock do
 * AudioContext e expõe, pelo MESMO clock, o frame (pro cursor da pauta via
 * updatePosition) e a nota ativa (pro highlight do braço).
 *
 * Padrão de clock copiado do useTapRun (mecânica validada do Módulo 1): t0 no
 * AudioContext + LEAD, RAF só pro visual, osciladores agendados guardados pra
 * osc.stop() no cancelamento, auto-stop com folga, cleanup no unmount. Caso mais
 * simples de propósito — sem input, count-in, metrônomo ou classificação.
 *
 * IMPORTANTE (sincronia): NUNCA chama api.play() do AlphaTab — o cursor é 100% do
 * chamador via onFrame → updatePosition (mecânica validada nº 2).
 */

const LEAD_SEC = 0.15; // não agendar notas no passado
const STOP_TAIL_MS = 300; // folga do auto-stop, mesmo valor do useTapRun

export interface ScalePlaybackCallbacks {
  /** A cada frame: ms desde o início do playback (clampado em 0 durante o lead). */
  onFrame?: (elapsedMs: number) => void;
  /** Chamado em TODO término (auto-stop, stop manual ou restart). */
  onStop?: () => void;
}

export function useScalePlayback(callbacks: ScalePlaybackCallbacks = {}) {
  const cbRef = useRef(callbacks);
  cbRef.current = callbacks;

  const [playing, setPlaying] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const playingRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const t0Ref = useRef(0);
  const scheduleRef = useRef<ScalePlaybackSchedule | null>(null);
  const oscsRef = useRef<OscillatorNode[]>([]);
  const activeIdxRef = useRef<number | null>(null);

  const setActive = (idx: number | null) => {
    if (activeIdxRef.current !== idx) {
      activeIdxRef.current = idx;
      setActiveIndex(idx);
    }
  };

  const stop = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    // Cancela TODAS as notas agendadas: nada fica tocando preso após o stop.
    for (const osc of oscsRef.current) {
      try {
        osc.stop();
      } catch {
        /* já parado */
      }
    }
    oscsRef.current = [];
    playingRef.current = false;
    setPlaying(false);
    setActive(null);
    cbRef.current.onStop?.();
  };

  const start = (schedule: ScalePlaybackSchedule) => {
    if (playingRef.current) stop(); // nunca dois playbacks sobrepostos

    scheduleRef.current = schedule;
    const t0 = audioContextTime() + LEAD_SEC;
    t0Ref.current = t0;

    // Áudio: uma senoide agendada por nota, na oitava SOANTE (baixo soa 8ª abaixo
    // do escrito — mesma convenção do Módulo 1 via soundingOctave).
    oscsRef.current = schedule.notes.map((n) =>
      playTone(
        noteToFrequency(n.name, soundingOctave(`${n.name}${n.writtenOctave}`)),
        n.durationMs / 1000,
        t0 + n.timeMs / 1000
      )
    );

    playingRef.current = true;
    setPlaying(true);

    const loop = () => {
      const elapsed = (audioContextTime() - t0Ref.current) * 1000;
      cbRef.current.onFrame?.(Math.max(0, elapsed));

      const sched = scheduleRef.current;
      if (sched) {
        const idx = sched.notes.findIndex(
          (n) => elapsed >= n.timeMs && elapsed < n.timeMs + n.durationMs
        );
        setActive(idx >= 0 ? idx : null);
        if (elapsed >= sched.totalMs + STOP_TAIL_MS) {
          stop();
          return;
        }
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  };

  // Limpa RAF/osciladores ao desmontar (mesmo padrão do useTapRun).
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      for (const osc of oscsRef.current) {
        try {
          osc.stop();
        } catch {
          /* noop */
        }
      }
    };
  }, []);

  return { playing, activeIndex, start, stop };
}
