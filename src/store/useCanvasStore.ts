import { create } from 'zustand';

interface CanvasState {
  activeComponents: any[]; // Holds the array from DashboardUI
  isRevealing: boolean;
  activeTab: string | null; // "ALL" or persona name
  inspectedNodeId: string | null;
  isInspectorOpen: boolean;
  setCanvasContent: (components: any[]) => void;
  setActiveTab: (tab: string) => void;
  openInspector: (nodeId: string) => void;
  closeInspector: () => void;
  clearCanvas: () => void;
}

export const useCanvasStore = create<CanvasState>((set) => ({
  activeComponents: [],
  isRevealing: false,
  activeTab: "ALL",
  inspectedNodeId: null,
  isInspectorOpen: false,
  setCanvasContent: (components) => set({ 
    activeComponents: components, 
    isRevealing: true,
    activeTab: "ALL" // Reset to ALL when new content arrives
  }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  openInspector: (nodeId) => set({ inspectedNodeId: nodeId, isInspectorOpen: true }),
  closeInspector: () => set({ inspectedNodeId: null, isInspectorOpen: false }),
  clearCanvas: () => set({ activeComponents: [], isRevealing: false, activeTab: "ALL", isInspectorOpen: false }),
}));
