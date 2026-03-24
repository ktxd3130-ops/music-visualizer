import { create } from "zustand";

export type VisualizationMode = "nebula" | "terrain" | "ribbon" | "face";

interface VisualState {
  mode: VisualizationMode;
  setMode: (mode: VisualizationMode) => void;
}

export const useVisualStore = create<VisualState>((set) => ({
  mode: "nebula",
  setMode: (mode) => set({ mode }),
}));
