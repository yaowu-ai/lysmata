// src/pages/Onboarding/views/InstallingView.tsx
import { useEffect, useRef } from "react";
import { useOnboardingInstall } from "../../../shared/hooks/useOnboardingInstall";

interface Props {
  onSuccess: () => void;
}

export function InstallingView({ onSuccess }: Props) {
  const { logs, progress, statusLabel, isDone, isError, errorMsg, retry } =
    useOnboardingInstall(true);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isDone) {
      const t = setTimeout(onSuccess, 800);
      return () => clearTimeout(t);
    }
  }, [isDone, onSuccess]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  return (
    <div>
      <h2 className="text-[20px] font-bold mb-1.5">正在安装 OpenClaw</h2>
      <p className="text-sm text-[#64748B] mb-5">
        自动检测环境并安装核心组件，此过程通常需要 1-3 分钟。
      </p>

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
                : line.includes("完成") || line.includes("成功") || line.includes("就绪")
                  ? "text-[#34D399]"
                  : ""
            }
          >
            {line}
          </div>
        ))}
        <div ref={logEndRef} />
      </div>

      {isError && (
        <div className="mt-4 space-y-3">
          <div className="px-4 py-3 bg-[#FEF2F2] border border-[#FECACA] rounded-lg text-sm text-[#DC2626]">
            安装失败：{errorMsg}
          </div>

          <div className="flex gap-2">
            <button
              onClick={retry}
              className="flex-1 flex items-center justify-center gap-1.5 bg-[#2563EB] text-white px-[18px] py-[9px] rounded-lg text-sm font-medium cursor-pointer hover:bg-[#1D4ED8] transition-colors"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </svg>
              重试
            </button>
          </div>

          <details className="text-xs text-[#64748B]">
            <summary className="cursor-pointer hover:text-[#0F172A]">手动安装说明</summary>
            <div className="mt-2 space-y-2 pl-1">
              <p>请打开终端（Terminal.app）运行以下命令：</p>
              <pre className="bg-[#0F172A] text-[#94A3B8] p-3 rounded text-xs font-mono overflow-x-auto whitespace-pre-wrap">
                curl -fsSL https://openclaw.ai/install.sh | bash
              </pre>
              <p>安装完成后返回此页面，点击「重试」即可自动检测。</p>
            </div>
          </details>
        </div>
      )}
    </div>
  );
}
