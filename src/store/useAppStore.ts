import { create } from "zustand";
import type { Clef } from "../engine/rhythm-engine";
import type { StaveDisplayMode } from "../components/RhythmStaff";

export type ModuleId = "reading" | "theory" | "progress" | "library" | "practice";

/** Intenção one-shot de abrir o Módulo 1 num modo/nível (deep-link da sugestão, 5b). */
export interface ReadingTarget {
  mode: string;
  levelId?: string;
}

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

  /**
   * Deep-links da sugestão adaptativa (5b), TODOS em memória de sessão (store Zustand
   * puro, sem persist — some ao fechar o app). São intenções ONE-SHOT: o consumidor lê
   * e limpa (setar null) ao aplicar.
   */
  readingTarget: ReadingTarget | null;
  setReadingTarget: (target: ReadingTarget | null) => void;
  diaryPrefillExerciseId: string | null;
  setDiaryPrefillExerciseId: (id: string | null) => void;
  /** Sugestões dispensadas nesta sessão (chave `source:id`); não persiste — reaparece na próxima abertura. */
  dismissedSuggestions: Set<string>;
  dismissSuggestion: (key: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  activeModule: "reading",
  setActiveModule: (module) => set({ activeModule: module }),
  clef: "F",
  setClef: (clef) => set({ clef }),
  staveDisplay: "score",
  setStaveDisplay: (staveDisplay) => set({ staveDisplay }),

  readingTarget: null,
  setReadingTarget: (readingTarget) => set({ readingTarget }),
  diaryPrefillExerciseId: null,
  setDiaryPrefillExerciseId: (diaryPrefillExerciseId) => set({ diaryPrefillExerciseId }),
  dismissedSuggestions: new Set<string>(),
  dismissSuggestion: (key) =>
    set((state) => ({ dismissedSuggestions: new Set(state.dismissedSuggestions).add(key) })),
}));
