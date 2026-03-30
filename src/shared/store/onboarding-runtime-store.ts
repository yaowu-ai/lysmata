type StartupCheckState = "unknown" | "ready" | "failed";

export interface OnboardingRuntimeState {
  startupCheck: StartupCheckState;
  hasOpenClaw: boolean;
}

const STORAGE_KEY = "onboarding_runtime_state_v1";

const defaultState: OnboardingRuntimeState = {
  startupCheck: "unknown",
  hasOpenClaw: false,
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
