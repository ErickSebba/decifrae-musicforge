import { useEffect, useRef } from "react";
import * as alphaTab from "@coderline/alphatab";

/**
 * Renderiza notação (clave/notas) a partir de uma string alphaTex, re-renderizando quando o
 * `tex` muda. Player desativado — é só visualização. Generaliza o antigo AlphaTabViewer.
 */
export function Notation({ tex }: { tex: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<alphaTab.AlphaTabApi | null>(null);

  // Inicializa a API uma vez.
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
        scale: 1.0,
        staveProfile: alphaTab.StaveProfile.Score, // só notação (sem tablatura)
      },
      player: {
        enablePlayer: false,
      },
    });
    apiRef.current = api;

    return () => {
      api.destroy();
      apiRef.current = null;
    };
  }, []);

  // Atualiza a partitura quando o tex muda.
  useEffect(() => {
    apiRef.current?.tex(tex);
  }, [tex]);

  return (
    <div
      ref={containerRef}
      className="rounded-lg overflow-hidden"
      style={{ background: "var(--color-bg-card)" }}
    />
  );
}