// src/pages/Onboarding/WizardStepper.tsx
import { WIZARD_FLOW } from "../../shared/store/wizard-store";
import type { WizardStep } from "../../shared/store/wizard-store";

interface Props {
  currentStep: WizardStep;
}

const NAV_STEPS = WIZARD_FLOW.filter((s) => s.navIndex);

function currentNavIndex(step: WizardStep): number {
  if (step.id === "welcome") return 0;
  if (step.id === "install-success") return 2;
  if (step.id === "ready") return 4;
  return step.navIndex ?? 0;
}

export function WizardStepper({ currentStep }: Props) {
  const activeIndex = currentNavIndex(currentStep);
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto">
      {NAV_STEPS.map((s, idx) => {
        const stepIndex = s.navIndex ?? 0;
        const isActive = stepIndex === activeIndex;
        const isCompleted = stepIndex < activeIndex;

        return (
          <div key={s.id} className="flex items-center gap-1.5 flex-shrink-0">
            <div
              className={[
                "flex items-center gap-1.5 text-[12px] font-medium whitespace-nowrap",
                isActive ? "text-[#2563EB]" : "",
                isCompleted ? "text-[#0F172A]" : "",
                !isActive && !isCompleted ? "text-[#64748B]" : "",
              ].join(" ")}
            >
              <div
                className={[
                  "w-[22px] h-[22px] rounded-full border-[1.5px] flex items-center justify-center text-[10px] font-semibold flex-shrink-0",
                  isActive ? "border-[#2563EB] bg-[#EFF6FF] text-[#2563EB]" : "",
                  isCompleted ? "border-[#2563EB] bg-[#2563EB] text-white" : "",
                  !isActive && !isCompleted ? "border-[#E5E7EB] bg-white text-[#64748B]" : "",
                ].join(" ")}
              >
                {isCompleted ? "✓" : stepIndex}
              </div>
              {isActive && <span>{s.title}</span>}
            </div>
            {idx < NAV_STEPS.length - 1 && (
              <div
                className="w-6 h-[1.5px] flex-shrink-0"
                style={{
                  background: isCompleted ? "#2563EB" : "#E5E7EB",
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
