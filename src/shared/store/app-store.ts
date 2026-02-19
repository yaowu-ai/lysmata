import { create } from 'zustand';

interface AppStore {
  sidecarReady: boolean;
  setSidecarReady: (ready: boolean) => void;
}

export const useAppStore = create<AppStore>((set) => ({
  sidecarReady: false,
  setSidecarReady: (ready) => set({ sidecarReady: ready }),
}));
