import { create } from 'zustand';

interface AppStore {
  sidecarReady: boolean;
  setSidecarReady: (ready: boolean) => void;
  presence: Record<string, any>;
  setPresence: (presence: Record<string, any>) => void;
}

export const useAppStore = create<AppStore>((set) => ({
  sidecarReady: false,
  setSidecarReady: (ready) => set({ sidecarReady: ready }),
  presence: {},
  setPresence: (presence) => set({ presence }),
}));
