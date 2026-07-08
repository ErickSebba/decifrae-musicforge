import { create } from "zustand";
import type { Clef } from "../engine/rhythm-engine";

export type ModuleId = "reading" | "theory" | "progress" | "library" | "practice";

interface AppState {
  activeModule: ModuleId;
  setActiveModule: (module: ModuleId) => void;
  /** Clave de escrita do Módulo 1 (global aos 4 modos). Só notação — alturas não mudam. */
  clef: Clef;
  setClef: (clef: Clef) => void;
}

export const useAppStore = create<AppState>((set) => ({
  activeModule: "reading",
  setActiveModule: (module) => set({ activeModule: module }),
  clef: "F",
  setClef: (clef) => set({ clef }),
}));
