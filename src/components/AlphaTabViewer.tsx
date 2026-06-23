import { useEffect, useRef } from "react";
import * as alphaTab from "@coderline/alphatab";

const EXAMPLE_TEX = `
\\title "Decifrae MusicForge"
\\tempo 80
\\clef F4
.
:4 e2 f2 g2 a2 |
b2 a2 g2 f2 |
e2 g2 b2 e3 |
b2.2 r.4 |
`;

export function AlphaTabViewer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<alphaTab.AlphaTabApi | null>(null);

  useEffect(() => {
    if (!containerRef.current || apiRef.current) return;

    const api = new alphaTab.AlphaTabApi(containerRef.current, {
      core: {
        fontDirectory: "/font/",
        scriptFile: "/alphatab/alphaTab.worker.mjs",
        logLevel: alphaTab.LogLevel.Warning,
      },
      display: {
        layoutMode: alphaTab.LayoutMode.Page,
        scale: 0.9,
        staveProfile: alphaTab.StaveProfile.ScoreTab,
      },
      player: {
        enablePlayer: false,
      },
    });

    api.tex(EXAMPLE_TEX);
    apiRef.current = api;

    return () => {
      api.destroy();
      apiRef.current = null;
    };
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold" style={{ color: "var(--color-text-primary)" }}>
        Partitura de Exemplo
      </h2>
      <div
        ref={containerRef}
        className="rounded-lg overflow-hidden"
        style={{ background: "var(--color-bg-card)" }}
      />
    </div>
  );
}
