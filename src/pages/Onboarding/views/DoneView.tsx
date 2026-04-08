import { useNavigate } from "react-router-dom";
import { clearOnboardingProgress, useWizardStore } from "../../../shared/store/wizard-store";

export function DoneView() {
  const navigate = useNavigate();
  const { goToStep } = useWizardStore();

  function handleDashboard() {
    clearOnboardingProgress();
    navigate("/bots");
  }

  function handleReenter() {
    goToStep("welcome");
  }

  return (
    <div className="flex flex-col items-center justify-center h-full text-center pb-2">
      <div
        className="w-[72px] h-[72px] rounded-full border-4 border-[#BBF7D0] flex items-center justify-center mb-6 text-[#16A34A]"
        style={{ background: "linear-gradient(135deg, #DCFCE7, #BBF7D0)" }}
      >
        <svg
          width="34"
          height="34"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
      </div>
      <h1 className="text-[24px] font-bold m-0 mb-3">已就绪 🎉</h1>
      <p className="text-sm text-[#64748B] leading-[1.65] max-w-[380px] m-0 mb-7">
        Gateway 配置已应用并成功重启。
        <br />
        你现在可以开始创建 Bot 并开始对话了。
      </p>
      <button
        onClick={handleDashboard}
        className="bg-[#2563EB] text-white border-none px-7 py-[11px] rounded-lg text-[15px] font-medium cursor-pointer hover:bg-[#1D4ED8]"
      >
        进入主界面
      </button>
      <button
        onClick={handleReenter}
        className="bg-transparent border-none text-[#64748B] text-[13px] font-medium cursor-pointer underline underline-offset-[3px] hover:text-[#0F172A] mt-4 flex items-center gap-1"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="1 4 1 10 7 10" />
          <path d="M3.51 15a9 9 0 1 0 .49-3.57" />
        </svg>
        重新运行配置向导
      </button>
    </div>
  );
}
