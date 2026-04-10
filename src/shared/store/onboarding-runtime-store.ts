type StartupCheckState = "unknown" | "ready" | "failed";

export interface OnboardingRuntimeState {
  startupCheck: StartupCheckState;
  hasOpenClaw: boolean;
  selectedTemplateId: string | null;
  initializedAssistantAt: number | null;
  assistantName: string | null;
  assistantWorkspacePath: string | null;
  createdBotId: string | null;
  createdBotName: string | null;
}

const STORAGE_KEY = "onboarding_runtime_state_v1";

const defaultState: OnboardingRuntimeState = {
  startupCheck: "unknown",
  hasOpenClaw: false,
  selectedTemplateId: null,
  initializedAssistantAt: null,
  assistantName: null,
  assistantWorkspacePath: null,
  createdBotId: null,
  createdBotName: null,
};

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

export function getOnboardingRuntimeState(): OnboardingRuntimeState {
  if (!canUseStorage()) {
    return defaultState;
  }

  const raw = window.sessionStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return defaultState;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<OnboardingRuntimeState>;
    return {
      startupCheck:
        parsed.startupCheck === "ready" || parsed.startupCheck === "failed"
          ? parsed.startupCheck
          : "unknown",
      hasOpenClaw: parsed.hasOpenClaw === true,
      selectedTemplateId: typeof parsed.selectedTemplateId === "string" ? parsed.selectedTemplateId : null,
      initializedAssistantAt:
        typeof parsed.initializedAssistantAt === "number" ? parsed.initializedAssistantAt : null,
      assistantName: typeof parsed.assistantName === "string" ? parsed.assistantName : null,
      assistantWorkspacePath:
        typeof parsed.assistantWorkspacePath === "string" ? parsed.assistantWorkspacePath : null,
      createdBotId: typeof parsed.createdBotId === "string" ? parsed.createdBotId : null,
      createdBotName: typeof parsed.createdBotName === "string" ? parsed.createdBotName : null,
    };
  } catch {
    return defaultState;
  }
}

export function setOnboardingRuntimeState(state: OnboardingRuntimeState) {
  if (!canUseStorage()) {
    return;
  }

  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function clearOnboardingRuntimeState() {
  if (!canUseStorage()) {
    return;
  }

  window.sessionStorage.removeItem(STORAGE_KEY);
}
