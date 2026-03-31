import type { ReactNode } from "react";

interface FooterAction {
  label: string;
  onClick: () => void;
  variant?: "primary" | "secondary";
  disabled?: boolean;
}

interface Props {
  hint?: string;
  leftSlot?: ReactNode;
  actions: FooterAction[];
}

function getButtonClass(variant: FooterAction["variant"], disabled?: boolean) {
  if (variant === "secondary") {
    return [
      "rounded-xl border border-[#E2E8F0] bg-white px-[18px] py-[11px] text-sm font-semibold text-[#475569]",
      disabled ? "cursor-not-allowed opacity-60" : "hover:bg-[#F8FAFC]",
    ].join(" ");
  }

  return [
    "rounded-xl px-[18px] py-[11px] text-sm font-semibold text-white",
    disabled ? "cursor-not-allowed bg-[#94A3B8]" : "bg-[#2563EB] hover:bg-[#1D4ED8]",
  ].join(" ");
}

export function StandardFooter({ hint, leftSlot, actions }: Props) {
  return (
    <footer className="flex items-center justify-between gap-4 border-t border-[#E2E8F0] bg-[#FAFCFF] px-7 py-[18px]">
      <div className="min-h-[24px] text-xs leading-6 text-[#64748B]">{leftSlot ?? hint ?? ""}</div>
      <div className="flex items-center gap-2.5">
        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            onClick={action.onClick}
            disabled={action.disabled}
            className={getButtonClass(action.variant, action.disabled)}
          >
            {action.label}
          </button>
        ))}
      </div>
    </footer>
  );
}
