// src/shared/store/wizard-store.ts
import { create } from 'zustand';

export type WizardStepId =
  | 'intro' | 'env' | 'installing' | 'install-success'
  | 'step1' | 'step2' | 'step3' | 'step4' | 'step5' | 'step6'
  | 'done';

export interface WizardStep {
  id: WizardStepId;
  type: 'install' | 'config' | 'done';
  title?: string;
  configIndex?: number;
  skippable?: boolean;
}

export const WIZARD_FLOW: WizardStep[] = [
  { id: 'intro',           type: 'install' },
  { id: 'env',             type: 'install' },
  { id: 'installing',      type: 'install' },
  { id: 'install-success', type: 'install' },
  { id: 'step1', type: 'config', title: 'Gateway',  configIndex: 1, skippable: false },
  { id: 'step2', type: 'config', title: 'Provider', configIndex: 2, skippable: false },
  { id: 'step3', type: 'config', title: 'Channel',  configIndex: 3, skippable: true  },
  { id: 'step4', type: 'config', title: 'Skills',   configIndex: 4, skippable: true  },
  { id: 'step5', type: 'config', title: 'Hooks',    configIndex: 5, skippable: true  },
  { id: 'step6', type: 'config', title: 'Review',   configIndex: 6, skippable: false },
  { id: 'done',            type: 'done' },
];

interface WizardStore {
  currentIdx: number;
  skippedSteps: Record<string, boolean>;
  goNext: () => void;
  goPrev: () => void;
  goToStep: (id: WizardStepId) => void;
  skipCurrentStep: () => void;
  resetSkips: () => void;
  currentStep: () => WizardStep;
}

export const useWizardStore = create<WizardStore>((set, get) => ({
  currentIdx: 0,
  skippedSteps: {},

  currentStep: () => WIZARD_FLOW[get().currentIdx],

  goNext: () =>
    set((s) => ({
      currentIdx: Math.min(s.currentIdx + 1, WIZARD_FLOW.length - 1),
    })),

  goPrev: () =>
    set((s) => ({ currentIdx: Math.max(s.currentIdx - 1, 0) })),

  goToStep: (id) => {
    const idx = WIZARD_FLOW.findIndex((s) => s.id === id);
    if (idx >= 0) set({ currentIdx: idx });
  },

  skipCurrentStep: () =>
    set((s) => {
      const step = WIZARD_FLOW[s.currentIdx];
      if (!step.skippable) return s;
      return {
        skippedSteps: { ...s.skippedSteps, [step.id]: true },
        currentIdx: Math.min(s.currentIdx + 1, WIZARD_FLOW.length - 1),
      };
    }),

  resetSkips: () => set({ skippedSteps: {} }),
}));

// Completion persistence helpers
export const ONBOARDING_KEY = 'onboarding_completed';
export const markOnboardingComplete = () => localStorage.setItem(ONBOARDING_KEY, '1');
export const isOnboardingComplete = () => !!localStorage.getItem(ONBOARDING_KEY);
