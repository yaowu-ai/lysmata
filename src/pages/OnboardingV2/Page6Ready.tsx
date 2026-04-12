import { useLocation, useNavigate } from "react-router-dom";
import { getOnboardingRuntimeState } from "../../shared/store/onboarding-runtime-store";
import { clearOnboardingProgress, markOnboardingComplete } from "../../shared/store/wizard-store";
import type { WorkspaceInitResult } from "../../shared/types";

export function OnboardingPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const runtimeState = getOnboardingRuntimeState();
  const result = location.state as WorkspaceInitResult | null;

  function finishAndNavigate(path: string) {
    markOnboardingComplete();
    clearOnboardingProgress();
    navigate(path);
  }

  return (
    <main className="flex flex-1 overflow-y-auto p-7">
      <div className="w-full max-w-190">
        <h2 className="mt-4 text-[28px] font-semibold leading-[1.15] tracking-[-0.03em] text-[#0F172A]">
          第一个助手和默认 Bot 已创建完成
        </h2>
        <p className="mt-3 text-[14px] leading-7 text-[#64748B]">
          <span className="font-semibold text-[#0F172A]">
            {result?.assistantName ?? runtimeState.assistantName ?? "我的助手"}
          </span>
          的专属 workspace 已创建完成，系统也已经自动生成第一个 Bot：
          <span className="font-semibold text-[#0F172A]">
            {" "}
            {result?.botName ?? runtimeState.createdBotName ?? "默认 Bot"}
          </span>
          。现在可以直接进入对话，也可以先查看生成结果。
        </p>

        <div className="mt-6 rounded-3xl border border-[#E2E8F0] bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.05)]">
          <div className="text-[14px] font-semibold text-[#0F172A]">初始化结果</div>

          <div className="mt-4 rounded-2xl border border-[#DBEAFE] bg-[#F8FBFF] px-4 py-4 text-[13px] leading-7 text-[#2563EB]">
            Workspace 路径：
            {result?.workspacePath ?? runtimeState.assistantWorkspacePath ?? "未记录"}
          </div>

          <div className="mt-4 rounded-2xl border border-[#DCFCE7] bg-[#F0FDF4] px-4 py-4 text-[13px] leading-7 text-[#166534]">
            已创建 Bot：{result?.botName ?? runtimeState.createdBotName ?? "默认 Bot"}
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => finishAndNavigate("/chat/private")}
              className="rounded-xl bg-[#2563EB] px-4.5 py-2.75 text-sm font-semibold text-white hover:bg-[#1D4ED8]"
            >
              立即开始对话
            </button>
            <button
              type="button"
              onClick={() => finishAndNavigate("/bots")}
              className="rounded-xl border border-[#E2E8F0] bg-white px-4.5 py-2.75 text-sm font-semibold text-[#475569] hover:bg-[#F8FAFC]"
            >
              先回助手工坊
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
