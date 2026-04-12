import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "../../shared/api-client";
import { useOnboardingInstall } from "../../shared/hooks/useOnboardingInstall";
import {
  getOnboardingRuntimeState,
  setOnboardingRuntimeState,
} from "../../shared/store/onboarding-runtime-store";
import { OnboardingPageShell } from "./OnboardingPageShell";

interface EnvCheckResult {
  canInstall: boolean;
  message: string;
  hasOpenClaw: boolean;
  openclawVersion?: string;
  openclawPath?: string;
  hasNode: boolean;
  nodeVersion?: string;
  nodeMajor?: number;
  nodePath?: string;
  hasNpm?: boolean;
  npmPath?: string;
  hasCurl: boolean;
  networkReachable?: boolean;
  platform: string;
}

function TerminalLine({ line }: { line: string }) {
  const color =
    line.startsWith("$") || line.startsWith("#")
      ? "text-[#E2E8F0]"
      : line.includes("error") || line.includes("失败") || line.includes("错误")
        ? "text-[#FCA5A5]"
        : line.includes("完成") || line.includes("成功") || line.includes("verified")
          ? "text-[#86EFAC]"
          : line.includes("sudo") || line.includes("权限") || line.includes("管理员")
            ? "text-[#FDE68A]"
            : "text-[#94A3B8]";

  return <div className={color}>{line}</div>;
}

export function OnboardingPage() {
  const navigate = useNavigate();
  const logEndRef = useRef<HTMLDivElement>(null);
  const runtimeState = useMemo(() => getOnboardingRuntimeState(), []);
  const {
    logs,
    stage,
    statusLabel,
    summary,
    isInstalling,
    isCompleted,
    isError,
    errorMsg,
    waitingForPrivilege,
    canContinue,
    start,
    retry,
    cancel,
  } = useOnboardingInstall();

  const [envResult, setEnvResult] = useState<EnvCheckResult | null>(null);
  const [envLoading, setEnvLoading] = useState(true);
  const [hasAutoStarted, setHasAutoStarted] = useState(false);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  useEffect(() => {
    if (envLoading || hasAutoStarted || isInstalling || isCompleted || isError) return;
    if (envResult?.canInstall && !envResult.hasOpenClaw) {
      setHasAutoStarted(true);
      start();
    }
  }, [envLoading, envResult, hasAutoStarted, isInstalling, isCompleted, isError, start]);

  useEffect(() => {
    let alive = true;
    setEnvLoading(true);
    apiClient
      .get<EnvCheckResult>("/openclaw/check-environment")
      .then((result) => {
        if (!alive) return;
        setEnvResult(result);
        if (result.hasOpenClaw) {
          setOnboardingRuntimeState({
            ...runtimeState,
            hasOpenClaw: true,
            selectedTemplateId: runtimeState.selectedTemplateId,
            initializedAssistantAt: runtimeState.initializedAssistantAt,
            assistantName: runtimeState.assistantName,
            assistantWorkspacePath: runtimeState.assistantWorkspacePath,
          });
        }
      })
      .catch(() => {
        if (!alive) return;
        setEnvResult(null);
      })
      .finally(() => {
        if (alive) setEnvLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [runtimeState]);

  const readyToInstall = envResult?.canInstall === true && !envResult.hasOpenClaw;
  const alreadyInstalled = envResult?.hasOpenClaw === true;
  const pageSummary = isError
    ? errorMsg
    : isCompleted
      ? "OpenClaw 已安装完成。你可以保留此页查看日志，并在确认后继续下一步。"
      : alreadyInstalled
        ? `已检测到 OpenClaw${envResult?.openclawVersion ? ` ${envResult.openclawVersion}` : ""}，无需重复安装。`
        : summary;

  const handleNext = () => {
    navigate("/onboarding/provider");
  };

  const footerActions = [];

  if (isInstalling) {
    footerActions.push({
      label: "取消安装",
      onClick: () => void cancel(),
      variant: "secondary" as const,
    });
  }

  if (isError) {
    footerActions.push({
      label: "重试安装",
      onClick: () => {
        setHasAutoStarted(true);
        retry();
      },
      variant: "secondary" as const,
    });
  }

  footerActions.push({
    label: "下一步",
    onClick: handleNext,
    variant: "primary" as const,
    disabled: !(canContinue || alreadyInstalled),
  });

  const footer = {
    hint:
      isCompleted || alreadyInstalled
        ? "安装已经完成，确认日志无误后即可进入下一步。"
        : isInstalling
          ? "安装正在进行中，保持当前页面即可查看实时输出。"
          : "进入本页后会在环境允许时自动开始安装。",
    actions: footerActions,
  };

  return (
    <OnboardingPageShell
      mainClassName="flex-col"
      contentClassName="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]"
      footer={footer}
    >
      <section className="rounded-[28px] border border-[#D9E2F2] bg-[linear-gradient(180deg,#F9FBFF_0%,#F2F7FF_100%)] p-6 shadow-[0_16px_44px_rgba(37,99,235,0.08)]">
        <div className="inline-flex items-center rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-[#2563EB] shadow-sm">
          Step 2 / 安装 OpenClaw
        </div>
        <h2 className="mt-4 text-[28px] font-semibold leading-[1.2] tracking-[-0.03em] text-[#0F172A]">
          在当前页面完成安装
        </h2>
        <p className="mt-3 text-[14px] leading-7 text-[#5B6B81]">
          安装会尽量保持接近命令行的输出。完成后不会自动跳转，你可以先确认日志，再自行进入下一步。
        </p>

        <div className="mt-6 space-y-3">
          <div className="rounded-2xl border border-white/80 bg-white/85 px-4 py-4">
            <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#64748B]">
              当前状态
            </div>
            <div className="mt-2 text-[20px] font-semibold text-[#0F172A]">{statusLabel}</div>
            <p className="mt-2 text-[13px] leading-6 text-[#64748B]">{pageSummary}</p>
          </div>

          <div className="rounded-2xl border border-white/80 bg-white/85 px-4 py-4">
            <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#64748B]">
              环境摘要
            </div>
            <div className="mt-3 space-y-2 text-[13px] text-[#334155]">
              <div className="flex items-center justify-between gap-4">
                <span>OpenClaw</span>
                <span className="font-medium">
                  {envLoading
                    ? "检测中..."
                    : alreadyInstalled
                      ? (envResult?.openclawVersion ?? "已安装")
                      : "未安装"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span>Node.js</span>
                <span className="font-medium">
                  {envLoading ? "检测中..." : (envResult?.nodeVersion ?? "未检测到")}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span>npm</span>
                <span className="font-medium">
                  {envLoading ? "检测中..." : envResult?.npmPath ? "可用" : "不可用"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span>网络</span>
                <span className="font-medium">
                  {envLoading
                    ? "检测中..."
                    : envResult?.networkReachable === undefined
                      ? "未检测"
                      : envResult.networkReachable
                        ? "可达"
                        : "不可达"}
                </span>
              </div>
            </div>
          </div>

          {waitingForPrivilege && (
            <div className="rounded-2xl border border-[#FDE68A] bg-[#FFFBEB] px-4 py-4 text-[13px] leading-6 text-[#92400E]">
              即将执行需要管理员权限的系统操作。系统可能弹出原生授权窗口，请在窗口中确认后继续。
            </div>
          )}

          {isError && (
            <div className="rounded-2xl border border-[#FECACA] bg-[#FEF2F2] px-4 py-4 text-[13px] leading-6 text-[#B91C1C]">
              {errorMsg}
            </div>
          )}

          {alreadyInstalled && !isInstalling && !isCompleted && !isError && (
            <div className="rounded-2xl border border-[#BBF7D0] bg-[#F0FDF4] px-4 py-4 text-[13px] leading-6 text-[#166534]">
              当前系统已经检测到 OpenClaw。你可以直接查看下方环境信息，然后继续下一步。
            </div>
          )}
        </div>

        {!envLoading &&
          !readyToInstall &&
          !alreadyInstalled &&
          !isInstalling &&
          !isCompleted &&
          !isError && (
            <div className="mt-6 rounded-2xl border border-[#FECACA] bg-[#FEF2F2] px-4 py-4 text-[13px] leading-6 text-[#B91C1C]">
              当前环境不满足自动安装条件，请先根据检测结果补齐依赖后再继续。
            </div>
          )}
      </section>

      <section className="overflow-hidden rounded-[28px] border border-[#0F172A] bg-[#0B1120] shadow-[0_22px_60px_rgba(15,23,42,0.28)]">
        <div className="flex items-center justify-between border-b border-[#1E293B] px-5 py-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#7DD3FC]">
              Install Output
            </div>
            <div className="mt-1 text-sm font-medium text-[#E2E8F0]">命令行输出</div>
          </div>
          <div className="rounded-full border border-[#1E293B] bg-[#111827] px-3 py-1 text-[11px] font-medium text-[#94A3B8]">
            {stage}
          </div>
        </div>

        <div className="h-[440px] overflow-y-auto px-5 py-4 font-mono text-[12px] leading-6">
          {logs.length === 0 ? (
            <div className="text-[#475569]">等待安装命令输出...</div>
          ) : (
            logs.map((line, index) => <TerminalLine key={`${index}-${line}`} line={line} />)
          )}
          <div ref={logEndRef} />
        </div>
      </section>
    </OnboardingPageShell>
  );
}
