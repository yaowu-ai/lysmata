import { create } from 'zustand';

interface ChatStore {
  activeConversationId: string | null;
  setActiveConversationId: (id: string | null) => void;
}

export const useChatStore = create<ChatStore>((set) => ({
  activeConversationId: null,
  setActiveConversationId: (id) => set({ activeConversationId: id }),
}));
