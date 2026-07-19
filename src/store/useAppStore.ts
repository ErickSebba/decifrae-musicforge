import { create } from "zustand";
import type { Clef } from "../engine/rhythm-engine";
import type { StaveDisplayMode } from "../components/RhythmStaff";

export type ModuleId = "reading" | "theory" | "progress" | "library" | "practice";

interface AppState {
  activeModule: ModuleId;
  setActiveModule: (module: ModuleId) => void;
  /** Clave de escrita do Módulo 1 (global aos 4 modos). Só notação — alturas não mudam. */
  clef: Clef;
  setClef: (clef: Clef) => void;
  /**
   * Exibição da pauta no Módulo 2 (2.6): partitura, tablatura ou ambas. Compartilhado
   * entre Explorar escalas e Editor de frases; NÃO persiste entre sessões (decisão).
   */
  staveDisplay: StaveDisplayMode;
  setStaveDisplay: (mode: StaveDisplayMode) => void;
}

export const useAppStore = create<AppState>((set) => ({
  activeModule: "reading",
  setActiveModule: (module) => set({ activeModule: module }),
  clef: "F",
  setClef: (clef) => set({ clef }),
  staveDisplay: "score",
  setStaveDisplay: (staveDisplay) => set({ staveDisplay }),
}));
