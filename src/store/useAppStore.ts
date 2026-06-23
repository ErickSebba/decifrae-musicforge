import { create } from "zustand";

export type ModuleId = "reading" | "theory" | "progress" | "library" | "practice";

interface AppState {
  activeModule: ModuleId;
  setActiveModule: (module: ModuleId) => void;
}

export const useAppStore = create<AppState>((set) => ({
  activeModule: "reading",
  setActiveModule: (module) => set({ activeModule: module }),
}));
