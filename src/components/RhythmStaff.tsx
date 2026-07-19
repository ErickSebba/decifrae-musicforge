import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import * as alphaTab from "@coderline/alphatab";

export interface RhythmStaffHandle {
  /** Coloca o player em estado de reprodução (necessário para o cursor visual). */
  play: () => void;
  pause: () => void;
  /** Dirige a posição do cursor a partir de um relógio externo (ms). */
  updatePosition: (ms: number) => void;
}

/** Modos de exibição da pauta (2.6). "score" é o comportamento original. */
export type StaveDisplayMode = "score" | "tab" | "both";

const STAVE_PROFILE: Record<StaveDisplayMode, alphaTab.StaveProfile> = {
  score: alphaTab.StaveProfile.Score,
  tab: alphaTab.StaveProfile.Tab,
  both: alphaTab.StaveProfile.ScoreTab,
};

interface RhythmStaffProps {
  tex: string;
  onReady?: () => void;
  /**
   * Exibição (2.6): partitura (default — comportamento EXATO de antes; Tap/Ditado não
   * passam a prop), tablatura ou ambas. Tab exige tex com notas fretted (casa.corda)
   * e \tuning — responsabilidade do chamador (theory-tex *ToFrettedTex).
   */
  displayMode?: StaveDisplayMode;
}

/**
 * Partitura cujo cursor é dirigido por um relógio externo (PlayerMode.EnabledExternalMedia).
 * O AlphaTab segue a posição que injetamos via `updatePosition` — sem synth/soundfont. As
 * cores do cursor vêm do CSS (.at-cursor-bar / .at-cursor-beat em index.css).
 */
export const RhythmStaff = forwardRef<RhythmStaffHandle, RhythmStaffProps>(function RhythmStaff(
  { tex, onReady, displayMode = "score" },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<alphaTab.AlphaTabApi | null>(null);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  // Modo inicial (usado só na criação da API); mudanças posteriores vão pelo effect abaixo.
  const initialDisplayModeRef = useRef(displayMode);
  const appliedDisplayModeRef = useRef(displayMode);

  // Duração total (ms) da "mídia externa" — readonly na interface, então getter sobre o ref.
  const durationRef = useRef(60000);
  const handlerRef = useRef<alphaTab.synth.IExternalMediaHandler>({
    get backingTrackDuration() {
      return durationRef.current;
    },
    playbackRate: 1,
    masterVolume: 1,
    seekTo: () => {},
    play: () => {},
    pause: () => {},
  });

  useEffect(() => {
    if (!containerRef.current) return;

    const api = new alphaTab.AlphaTabApi(containerRef.current, {
      core: {
        fontDirectory: "/font/",
        scriptFile: "/alphatab/alphaTab.worker.mjs",
        logLevel: alphaTab.LogLevel.Warning,
      },
      display: {
        layoutMode: alphaTab.LayoutMode.Page,
        staveProfile: STAVE_PROFILE[initialDisplayModeRef.current],
      },
      player: {
        playerMode: alphaTab.PlayerMode.EnabledExternalMedia,
        enableCursor: true,
        scrollMode: alphaTab.ScrollMode.Off,
      },
    });
    apiRef.current = api;

    api.midiLoaded.on((e) => {
      durationRef.current = e.endTime;
    });
    api.playerReady.on(() => {
      // Anexa o handler de mídia externa já aqui: updatePosition funciona sem api.play().
      const output = api.player?.output as unknown as alphaTab.synth.IExternalMediaSynthOutput;
      if (output) output.handler = handlerRef.current;
      onReadyRef.current?.();
    });

    return () => {
      api.destroy();
      apiRef.current = null;
    };
  }, []);

  useEffect(() => {
    apiRef.current?.tex(tex);
  }, [tex]);

  // Troca do modo de exibição em runtime (2.6) — caminho oficial do AlphaTab:
  // ajustar settings + updateSettings + render. NADA de cursor/clock muda aqui.
  useEffect(() => {
    const api = apiRef.current;
    if (!api || appliedDisplayModeRef.current === displayMode) return;
    appliedDisplayModeRef.current = displayMode;
    api.settings.display.staveProfile = STAVE_PROFILE[displayMode];
    api.updateSettings();
    api.render();
  }, [displayMode]);

  useImperativeHandle(
    ref,
    () => ({
      play() {
        const api = apiRef.current;
        if (!api?.player) return;
        const output = api.player.output as unknown as alphaTab.synth.IExternalMediaSynthOutput;
        output.handler = handlerRef.current;
        api.play();
      },
      pause() {
        apiRef.current?.pause();
      },
      updatePosition(ms: number) {
        const api = apiRef.current;
        if (!api?.player) return;
        const output = api.player.output as unknown as alphaTab.synth.IExternalMediaSynthOutput;
        output.updatePosition(ms);
      },
    }),
    []
  );

  return (
    <div
      ref={containerRef}
      className="rounded-lg overflow-hidden"
      style={{ background: "var(--color-bg-card)" }}
    />
  );
});