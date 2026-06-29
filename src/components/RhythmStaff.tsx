import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import * as alphaTab from "@coderline/alphatab";

export interface RhythmStaffHandle {
  /** Coloca o player em estado de reprodução (necessário para o cursor visual). */
  play: () => void;
  pause: () => void;
  /** Dirige a posição do cursor a partir de um relógio externo (ms). */
  updatePosition: (ms: number) => void;
}

interface RhythmStaffProps {
  tex: string;
  onReady?: () => void;
}

/**
 * Partitura cujo cursor é dirigido por um relógio externo (PlayerMode.EnabledExternalMedia).
 * O AlphaTab segue a posição que injetamos via `updatePosition` — sem synth/soundfont. As
 * cores do cursor vêm do CSS (.at-cursor-bar / .at-cursor-beat em index.css).
 */
export const RhythmStaff = forwardRef<RhythmStaffHandle, RhythmStaffProps>(function RhythmStaff(
  { tex, onReady },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<alphaTab.AlphaTabApi | null>(null);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

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
        staveProfile: alphaTab.StaveProfile.Score,
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
    api.playerReady.on(() => onReadyRef.current?.());

    return () => {
      api.destroy();
      apiRef.current = null;
    };
  }, []);

  useEffect(() => {
    apiRef.current?.tex(tex);
  }, [tex]);

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