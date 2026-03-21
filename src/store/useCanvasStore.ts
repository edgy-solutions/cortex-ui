import { create } from 'zustand';

interface CanvasState {
  activeComponents: any[]; // Holds the array from DashboardUI
  isRevealing: boolean;
  activeTab: string | null; // "ALL" or persona name
  setCanvasContent: (components: any[]) => void;
  setActiveTab: (tab: string) => void;
  clearCanvas: () => void;
}

export const useCanvasStore = create<CanvasState>((set) => ({
  activeComponents: [],
  isRevealing: false,
  activeTab: "ALL",
  setCanvasContent: (components) => set({ 
    activeComponents: components, 
    isRevealing: true,
    activeTab: "ALL" // Reset to ALL when new content arrives
  }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  clearCanvas: () => set({ activeComponents: [], isRevealing: false, activeTab: "ALL" }),
}));
