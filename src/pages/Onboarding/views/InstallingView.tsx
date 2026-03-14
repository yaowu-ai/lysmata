// src/pages/Onboarding/views/InstallingView.tsx
import { useEffect, useRef, useState } from "react";
import { useOnboardingInstall } from "../../../shared/hooks/useOnboardingInstall";

interface Props {
  onSuccess: () => void;
  onBackToEnvCheck?: () => void;
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function InstallingView({ onSuccess, onBackToEnvCheck }: Props) {
  const { logs, progress, statusLabel, isDone, isError, errorMsg, errorKind, platform, retryCount, retry, cancel } =
    useOnboardingInstall(true);
  const logEndRef = useRef<HTMLDivElement>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (isDone || isError) return;
    const timer = setInterval(() => setElapsed((prev) => prev + 1), 1000);
    return () => clearInterval(timer);
  }, [isDone, isError]);

  useEffect(() => {
    if (isDone) {
      const t = setTimeout(onSuccess, 800);
      return () => clearTimeout(t);
    }
  }, [isDone, onSuccess]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const handleRetry = () => {
    setElapsed(0);
    retry();
  };

  const handleCancel = async () => {
    await cancel();
    onBackToEnvCheck?.();
  };

  const isWindows = platform === "win32";

  const getErrorHintByKind = () => {
    switch (errorKind) {
      case "network":
        return "建议检查：1) 网络连接是否正常 2) DNS 是否可用 3) 是否需要配置代理";
      case "permission":
        return "建议检查全局 npm 目录的权限，或尝试在终端中使用 sudo 安装";
      case "timeout":
        return "网络可能不稳定，建议切换到更稳定的网络后重试";
      case "server_error":
        return "安装服务器可能暂时不可用，请稍后重试";
      default:
        return null;
    }
  };

  const getEscalatedGuidance = () => {
    if (retryCount >= 5) {
      return (
        <div className="mt-2 px-3 py-2 bg-[#FFF7ED] border border-[#FED7AA] rounded text-[13px] text-[#9A3412]">
          <strong>多次重试仍未成功</strong>，建议：
          <ol className="list-decimal ml-4 mt-1 space-y-0.5">
            <li>检查防火墙或网络代理设置</li>
            <li>尝试手动安装（见下方说明）</li>
            <li>将上方日志复制后到 <a href="https://github.com/nicepkg/openclaw/issues" target="_blank" rel="noopener noreferrer" className="underline">GitHub Issues</a> 反馈</li>
          </ol>
        </div>
      );
    }
    if (retryCount >= 3) {
      return (
        <div className="mt-2 px-3 py-2 bg-[#FFF7ED] border border-[#FED7AA] rounded text-[13px] text-[#9A3412]">
          已重试 {retryCount} 次仍失败，建议检查：网络连接、DNS 设置、代理配置、防火墙规则。
        </div>
      );
    }
    return null;
  };

  const kindHint = getErrorHintByKind();

  return (
    <div>
      <h2 className="text-[20px] font-bold mb-1.5">正在安装 OpenClaw</h2>
      <p className="text-sm text-[#64748B] mb-5">
        自动检测环境并安装核心组件，此过程通常需要 1-3 分钟。
      </p>

      <div className="mb-4">
        <div className="flex justify-between text-[13px] font-medium mb-2">
          <span className="text-[#2563EB]">{statusLabel}</span>
          <span className="flex items-center gap-2">
            <span className="text-[#94A3B8] font-normal">{formatElapsed(elapsed)}</span>
            <span>{progress}%</span>
          </span>
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
                  : line.startsWith("⚠")
                    ? "text-[#FBBF24]"
                    : ""
            }
          >
            {line}
          </div>
        ))}
        <div ref={logEndRef} />
      </div>

      {!isError && !isDone && (
        <div className="mt-3 flex justify-end">
          <button
            onClick={handleCancel}
            className="text-[13px] text-[#64748B] hover:text-[#DC2626] underline underline-offset-2 cursor-pointer"
          >
            取消安装
          </button>
        </div>
      )}

      {isError && (
        <div className="mt-4 space-y-3">
          <div className="px-4 py-3 bg-[#FEF2F2] border border-[#FECACA] rounded-lg text-sm text-[#DC2626]">
            安装失败：{errorMsg}
          </div>

          {kindHint && (
            <div className="px-3 py-2 bg-[#F0F9FF] border border-[#BAE6FD] rounded text-[13px] text-[#0369A1]">
              {kindHint}
            </div>
          )}

          {getEscalatedGuidance()}

          <div className="flex gap-2">
            <button
              onClick={handleRetry}
              className="flex-1 flex items-center justify-center gap-1.5 bg-[#2563EB] text-white px-[18px] py-[9px] rounded-lg text-sm font-medium cursor-pointer hover:bg-[#1D4ED8] transition-colors"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </svg>
              重试{retryCount > 0 ? ` (${retryCount + 1})` : ""}
            </button>
            {onBackToEnvCheck && (
              <button
                onClick={onBackToEnvCheck}
                className="flex items-center justify-center gap-1.5 bg-transparent text-[#64748B] border border-[#E5E7EB] px-[18px] py-[9px] rounded-lg text-sm font-medium cursor-pointer hover:bg-[#F8FAFC] hover:text-[#0F172A] transition-colors"
              >
                返回检测
              </button>
            )}
          </div>

          <details className="text-xs text-[#64748B]">
            <summary className="cursor-pointer hover:text-[#0F172A]">手动安装说明</summary>
            <div className="mt-2 space-y-2 pl-1">
              {isWindows ? (
                <>
                  <p>请确保已安装 Node.js 22+，然后在命令提示符或 PowerShell 中运行：</p>
                  <pre className="bg-[#0F172A] text-[#94A3B8] p-3 rounded text-xs font-mono overflow-x-auto whitespace-pre-wrap">
                    npm install -g openclaw@latest
                  </pre>
                  <p>
                    如尚未安装 Node.js，请前往{" "}
                    <a href="https://nodejs.org/" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">
                      nodejs.org
                    </a>{" "}
                    下载安装。
                  </p>
                </>
              ) : (
                <>
                  <p>请打开终端（Terminal.app）运行以下命令：</p>
                  <pre className="bg-[#0F172A] text-[#94A3B8] p-3 rounded text-xs font-mono overflow-x-auto whitespace-pre-wrap">
                    curl -fsSL https://openclaw.ai/install.sh | bash
                  </pre>
                </>
              )}
              <p>安装完成后返回此页面，点击「重试」即可自动检测。</p>
            </div>
          </details>
        </div>
      )}
    </div>
  );
}
