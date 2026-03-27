import { useMemo } from "react";
import { Navigate } from "react-router-dom";
import { getOnboardingProgress } from "../../shared/store/wizard-store";

const ALLOWED_STEPS = new Set([
  "intro",
  "env-check",
  "install",
  "install-success",
  "llm-key",
  "template-select",
  "assistant-create",
  "ready",
]);

export function OnboardingEntryPage() {
  const targetStep = useMemo(() => {
    const progress = getOnboardingProgress();
    const step = progress?.lastStepId ?? "intro";
    return ALLOWED_STEPS.has(step) ? step : "intro";
  }, []);

  return <Navigate to={`/onboarding/${targetStep}`} replace />;
}
