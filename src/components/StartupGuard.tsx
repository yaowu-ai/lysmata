import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { apiClient } from "../shared/api-client";
import { getOnboardingProgress, useWizardStore } from "../shared/store/wizard-store";

type CheckState = "loading" | "has-openclaw" | "no-openclaw" | "error";

export function StartupGuard() {
  const [state, setState] = useState<CheckState>("loading");
  const [hasProgress, setHasProgress] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const progress = getOnboardingProgress();
    if (progress) {
      useWizardStore.getState().goToStep(progress.lastStepId);
      setHasProgress(true);
      setState("no-openclaw");
      return () => {
        cancelled = true;
      };
    }

    apiClient
      .get<{ hasOpenClaw: boolean }>("/openclaw/check-environment")
      .then((res) => {
        if (cancelled) return;
        setState(res.hasOpenClaw ? "has-openclaw" : "no-openclaw");
      })
      .catch(() => {
        if (cancelled) return;
        setState("error");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (state === "loading") {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#F7F7F8]">
        <div className="flex flex-col items-center gap-5">
          <div
            className="w-[72px] h-[72px] rounded-[18px] flex items-center justify-center"
            style={{
              background: "linear-gradient(135deg, #3B82F6, #2563EB)",
              boxShadow: "0 4px 20px rgba(37,99,235,0.3)",
            }}
          >
            <svg
              width="36"
              height="36"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#fff"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 2L4 7l8 5 8-5-8-5z" />
              <path d="M4 12l8 5 8-5" />
              <path d="M4 17l8 5 8-5" />
            </svg>
          </div>
          <div className="flex items-center gap-2.5 text-[#64748B] text-sm">
            <svg
              className="animate-spin"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="3"
                strokeDasharray="31.4 31.4"
                strokeLinecap="round"
              />
            </svg>
            正在检测环境...
          </div>
        </div>
      </div>
    );
  }

  if (state === "no-openclaw") {
    if (!hasProgress) {
      useWizardStore.getState().goToStep("intro");
      return <Navigate to="/onboarding" replace />;
    }
    return <Navigate to="/onboarding" replace />;
  }

  // "has-openclaw" or "error" fallback to bots
  return <Navigate to="/bots" replace />;
}
