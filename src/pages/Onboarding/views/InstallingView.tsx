// src/pages/Onboarding/views/InstallingView.tsx
import { useEffect } from "react";
import { useOnboardingInstall } from "../../../shared/hooks/useOnboardingInstall";

interface Props {
  onSuccess: () => void;
}

export function InstallingView({ onSuccess }: Props) {
  const { logs, progress, statusLabel, isDone, isError, errorMsg, retry } =
    useOnboardingInstall(true);

  useEffect(() => {
    if (isDone) {
      const t = setTimeout(onSuccess, 800);
      return () => clearTimeout(t);
    }
  }, [isDone, onSuccess]);

  return (
    <div>
      <h2 className="text-[20px] font-bold mb-1.5">正在安装 OpenClaw</h2>
      <p className="text-sm text-[#64748B] mb-5">下载并配置核心组件，此过程通常需要 1-2 分钟。</p>

      <div className="mb-4">
        <div className="flex justify-between text-[13px] font-medium mb-2">
          <span className="text-[#2563EB]">{statusLabel}</span>
          <span>{progress}%</span>
        </div>
        <div className="w-full h-1.5 bg-[#E2E8F0] rounded-full overflow-hidden">
          <div
            className="h-full bg-[#2563EB] rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div
        className="bg-[#1E293B] rounded-lg p-4 overflow-y-auto font-mono text-[12px] leading-[1.65] text-[#94A3B8]"
        style={{ height: 220 }}
      >
        {logs.length === 0 && <div className="text-[#475569]">等待安装开始...</div>}
        {logs.map((line, i) => (
          <div
            key={i}
            className={
              line.includes("失败") || line.includes("错误") || line.includes("error")
                ? "text-[#F87171]"
                : ""
            }
          >
            {line}
          </div>
        ))}
      </div>

      {isError && (
        <div className="mt-4 space-y-2">
          <div className="px-4 py-3 bg-[#FEF2F2] border border-[#FECACA] rounded-lg text-sm text-[#DC2626]">
            安装失败：{errorMsg}
          </div>
          <button
            onClick={retry}
            className="w-full flex items-center justify-center gap-1.5 bg-[#2563EB] text-white px-[18px] py-[9px] rounded-lg text-sm font-medium cursor-pointer hover:bg-[#1D4ED8] transition-colors"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
            重试
          </button>
        </div>
      )}
    </div>
  );
}
