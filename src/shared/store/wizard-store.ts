// src/shared/store/wizard-store.ts
import { create } from "zustand";

export type WizardStepId =
  | "intro"
  | "env-check"
  | "install"
  | "install-success"
  | "llm-key"
  | "template-select"
  | "assistant-create"
  | "ready";

export interface WizardStep {
  id: WizardStepId;
  type: "intro" | "install" | "config" | "template" | "create" | "ready";
  title?: string;
  navIndex?: number;
}

export const WIZARD_FLOW: WizardStep[] = [
  { id: "intro", type: "intro" },
  { id: "env-check", type: "install", title: "检查环境", navIndex: 1 },
  { id: "install", type: "install", title: "安装 OpenClaw", navIndex: 2 },
  { id: "install-success", type: "install" },
  { id: "llm-key", type: "config", title: "连接 AI 服务", navIndex: 3 },
  { id: "template-select", type: "template", title: "选择模板", navIndex: 4 },
  { id: "assistant-create", type: "create", title: "开始对话", navIndex: 5 },
  { id: "ready", type: "ready" },
];

interface OnboardingProgress {
  lastStepId: WizardStepId;
  updatedAt: number;
}

const ONBOARDING_PROGRESS_KEY = "onboarding_progress_v2";

function persistProgress(stepId: WizardStepId) {
  const shouldStore = stepId !== "intro" && stepId !== "ready";
  if (!shouldStore) {
    localStorage.removeItem(ONBOARDING_PROGRESS_KEY);
    return;
  }
  const payload: OnboardingProgress = {
    lastStepId: stepId,
    updatedAt: Date.now(),
  };
  localStorage.setItem(ONBOARDING_PROGRESS_KEY, JSON.stringify(payload));
}

function getStepIndex(stepId: WizardStepId): number {
  const idx = WIZARD_FLOW.findIndex((s) => s.id === stepId);
  return idx >= 0 ? idx : 0;
}

function setIndexAndPersist(idx: number) {
  const bounded = Math.max(0, Math.min(idx, WIZARD_FLOW.length - 1));
  persistProgress(WIZARD_FLOW[bounded].id);
  return { currentIdx: bounded };
}

interface WizardStore {
  currentIdx: number;
  goNext: () => void;
  goPrev: () => void;
  goToStep: (id: WizardStepId) => void;
  restoreLastProgress: () => WizardStepId | null;
  clearProgress: () => void;
  currentStep: () => WizardStep;
}

export const useWizardStore = create<WizardStore>((set, get) => ({
  currentIdx: 0,

  currentStep: () => WIZARD_FLOW[get().currentIdx],

  goNext: () =>
    set((s) => setIndexAndPersist(s.currentIdx + 1)),

  goPrev: () => set((s) => setIndexAndPersist(s.currentIdx - 1)),

  goToStep: (id: WizardStepId) => {
    set(setIndexAndPersist(getStepIndex(id)));
  },

  restoreLastProgress: () => {
    const raw = localStorage.getItem(ONBOARDING_PROGRESS_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as OnboardingProgress;
      if (!parsed?.lastStepId) return null;
      const idx = getStepIndex(parsed.lastStepId);
      set({ currentIdx: idx });
      return WIZARD_FLOW[idx].id;
    } catch {
      return null;
    }
  },

  clearProgress: () => {
    localStorage.removeItem(ONBOARDING_PROGRESS_KEY);
    set({ currentIdx: 0 });
  },
}));

// Completion persistence helpers
export const ONBOARDING_KEY = "onboarding_completed";
export const markOnboardingComplete = () => localStorage.setItem(ONBOARDING_KEY, "1");
export const isOnboardingComplete = () => !!localStorage.getItem(ONBOARDING_KEY);
export const clearOnboardingProgress = () => localStorage.removeItem(ONBOARDING_PROGRESS_KEY);
export const getOnboardingProgress = (): { lastStepId: WizardStepId; updatedAt: number } | null => {
  const raw = localStorage.getItem(ONBOARDING_PROGRESS_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as OnboardingProgress;
    if (!parsed?.lastStepId) return null;
    return parsed;
  } catch {
    return null;
  }
};
