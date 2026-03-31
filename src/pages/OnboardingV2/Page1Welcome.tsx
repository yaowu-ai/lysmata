import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { getOnboardingRuntimeState } from "../../shared/store/onboarding-runtime-store";
import { OnboardingPageShell } from "./OnboardingPageShell";

export function OnboardingPage() {
  const navigate = useNavigate();
  const runtimeState = useMemo(() => getOnboardingRuntimeState(), []);
  const hasOpenClaw = runtimeState.hasOpenClaw;
  const footer = {
    hint: "你之后仍可从设置重新进入这条向导。",
    actions: [
      ...(hasOpenClaw
        ? [
            {
              label: "退出向导",
              onClick: () => navigate("/bots"),
              variant: "secondary" as const,
            },
          ]
        : []),
      {
        label: "安装",
        onClick: () => navigate("/onboarding/install"),
        variant: "primary" as const,
      },
    ],
  };

  return (
    <OnboardingPageShell
      mainClassName="items-center"
      contentClassName="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-center"
      footer={footer}
    >
      <section className="max-w-[460px]">
        <div className="inline-flex items-center rounded-full bg-[#EFF6FF] px-3 py-1 text-[11px] font-semibold text-[#2563EB]">
          首次使用向导
        </div>
        <h2 className="mt-4 text-[36px] font-semibold leading-[1.12] tracking-[-0.03em] text-[#0F172A]">
          开始搭建你的助手
        </h2>
        <p className="mt-4 text-[15px] leading-7 text-[#64748B]">
          通过安装 OpenClaw 和完成基础配置，你可以很快创建一个能直接开始对话的助手。
        </p>

        <div className="mt-8 space-y-3">
          <div className="flex items-start gap-3 rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-4">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#DBEAFE] text-[12px] font-bold text-[#2563EB]">
              1
            </div>
            <div>
              <div className="text-sm font-semibold text-[#0F172A]">安装或确认 OpenClaw</div>
              <div className="mt-1 text-[13px] leading-6 text-[#64748B]">
                先准备运行助手所需的基础环境。
              </div>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-4">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#DBEAFE] text-[12px] font-bold text-[#2563EB]">
              2
            </div>
            <div>
              <div className="text-sm font-semibold text-[#0F172A]">连接 AI 服务</div>
              <div className="mt-1 text-[13px] leading-6 text-[#64748B]">
                补齐必要配置，让助手真正可用。
              </div>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-4">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#DBEAFE] text-[12px] font-bold text-[#2563EB]">
              3
            </div>
            <div>
              <div className="text-sm font-semibold text-[#0F172A]">开始第一次对话</div>
              <div className="mt-1 text-[13px] leading-6 text-[#64748B]">
                完成后就能继续进入创建和使用流程。
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[24px] border border-[#E2E8F0] bg-[linear-gradient(180deg,#F8FAFC_0%,#FFFFFF_100%)] p-6 shadow-[0_18px_48px_rgba(15,23,42,0.06)]">
        <div className="text-[13px] font-semibold text-[#2563EB]">下一步</div>
        <div className="mt-3 text-[24px] font-semibold leading-[1.3] text-[#0F172A]">
          {hasOpenClaw ? "已检测到 OpenClaw" : "开始安装 OpenClaw"}
        </div>
        <p className="mt-3 text-[14px] leading-7 text-[#64748B]">
          {hasOpenClaw
            ? "你可以直接退出向导，或者重新进入安装流程。"
            : "当前还没有检测到 OpenClaw，建议先完成安装再继续。"}
        </p>

        <div className="mt-6 rounded-2xl border border-[#E2E8F0] bg-white px-4 py-4 text-[13px] leading-6 text-[#64748B]">
          这一步只做一个决定：继续安装，或者在已安装时直接退出向导。
        </div>
      </section>
    </OnboardingPageShell>
  );
}
