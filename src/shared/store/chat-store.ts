import { create } from "zustand";
import { persist } from "zustand/middleware";

interface ChatStore {
  activeConversationId: string | null;
  setActiveConversationId: (id: string | null) => void;
  botPanelCollapsed: boolean;
  setBotPanelCollapsed: (v: boolean) => void;
}

export const useChatStore = create<ChatStore>()(
  persist(
    (set) => ({
      activeConversationId: null,
      setActiveConversationId: (id) => set({ activeConversationId: id }),
      botPanelCollapsed: false,
      setBotPanelCollapsed: (v) => set({ botPanelCollapsed: v }),
    }),
    {
      name: "chat-store",
      // Only persist the panel collapsed state; activeConversationId resets on each session
      partialize: (state) => ({ botPanelCollapsed: state.botPanelCollapsed }),
    },
  ),
);
