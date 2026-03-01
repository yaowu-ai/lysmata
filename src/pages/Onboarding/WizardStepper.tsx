// src/pages/Onboarding/WizardStepper.tsx
import { WIZARD_FLOW } from '../../shared/store/wizard-store';
import type { WizardStep } from '../../shared/store/wizard-store';

interface Props {
  currentStep: WizardStep;
  skippedSteps: Record<string, boolean>;
}

const CONFIG_STEPS = WIZARD_FLOW.filter((s) => s.type === 'config');

export function WizardStepper({ currentStep, skippedSteps }: Props) {
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto">
      {CONFIG_STEPS.map((s, idx) => {
        const isActive    = s.id === currentStep.id;
        const isCompleted = (s.configIndex ?? 0) < (currentStep.configIndex ?? 0);
        const isSkipped   = skippedSteps[s.id];

        return (
          <div key={s.id} className="flex items-center gap-1.5 flex-shrink-0">
            <div className={[
              'flex items-center gap-1.5 text-[12px] font-medium whitespace-nowrap',
              isActive     ? 'text-[#2563EB]' : '',
              isCompleted  ? 'text-[#0F172A]' : '',
              !isActive && !isCompleted ? 'text-[#64748B]' : '',
            ].join(' ')}>
              <div className={[
                'w-[22px] h-[22px] rounded-full border-[1.5px] flex items-center justify-center text-[10px] font-semibold flex-shrink-0',
                isActive                  ? 'border-[#2563EB] bg-[#EFF6FF] text-[#2563EB]' : '',
                isCompleted && !isSkipped ? 'border-[#2563EB] bg-[#2563EB] text-white' : '',
                isCompleted && isSkipped  ? 'border-[#D1D5DB] bg-[#F8FAFC] text-[#94A3B8]' : '',
                !isActive && !isCompleted ? 'border-[#E5E7EB] bg-white text-[#64748B]' : '',
              ].join(' ')}>
                {isCompleted ? (isSkipped ? '–' : '✓') : s.configIndex}
              </div>
              {isActive && <span>{s.title}</span>}
            </div>
            {idx < CONFIG_STEPS.length - 1 && (
              <div
                className="w-6 h-[1.5px] flex-shrink-0"
                style={{
                  background: isCompleted
                    ? (isSkipped ? '#D1D5DB' : '#2563EB')
                    : '#E5E7EB',
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
