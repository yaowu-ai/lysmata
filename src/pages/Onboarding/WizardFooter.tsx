// src/pages/Onboarding/WizardFooter.tsx
interface Props {
  onPrev?: () => void;
  onNext: () => void;
  onSkip?: () => void;
  onCancel?: () => void;
  nextLabel: string;
  nextDisabled?: boolean;
  showPrev: boolean;
  showSkip: boolean;
  showCancel: boolean;
  submitting?: boolean;
}

export function WizardFooter({
  onPrev,
  onNext,
  onSkip,
  onCancel,
  nextLabel,
  nextDisabled,
  showPrev,
  showSkip,
  showCancel,
  submitting,
}: Props) {
  return (
    <div className="px-8 py-3.5 border-t border-[#E5E7EB] bg-[#FAFAFA] flex items-center justify-between flex-shrink-0">
      <div className="flex items-center gap-2.5">
        {showCancel && (
          <button
            onClick={onCancel}
            disabled={submitting}
            className="bg-transparent text-[#64748B] border border-[#E5E7EB] px-[18px] py-[9px] rounded-lg text-sm font-medium cursor-pointer hover:bg-[#F8FAFC] hover:text-[#0F172A] flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            取消
          </button>
        )}
      </div>
      <div className="flex items-center gap-2.5">
        {showSkip && (
          <button
            onClick={onSkip}
            disabled={submitting}
            className="bg-transparent border-none text-[#64748B] text-[13px] font-medium cursor-pointer underline underline-offset-[3px] hover:text-[#0F172A] disabled:opacity-40 disabled:cursor-not-allowed disabled:no-underline"
          >
            跳过此步
          </button>
        )}
        {showPrev && (
          <button
            onClick={onPrev}
            disabled={submitting}
            className="bg-transparent text-[#64748B] border border-[#E5E7EB] px-[18px] py-[9px] rounded-lg text-sm font-medium cursor-pointer hover:bg-[#F8FAFC] hover:text-[#0F172A] flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
            上一步
          </button>
        )}
        <button
          onClick={onNext}
          disabled={nextDisabled}
          className="bg-[#2563EB] text-white border-none px-[18px] py-[9px] rounded-lg text-sm font-medium cursor-pointer hover:bg-[#1D4ED8] flex items-center gap-1.5 disabled:bg-[#94A3B8] disabled:cursor-not-allowed min-w-[88px] justify-center"
        >
          {submitting && (
            <svg
              className="animate-spin"
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
          )}
          {nextLabel}
        </button>
      </div>
    </div>
  );
}
