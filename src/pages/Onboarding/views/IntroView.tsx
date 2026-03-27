// src/pages/Onboarding/views/IntroView.tsx
interface Props {
  onStartInstall: () => void;
  onSkipToConfig: () => void;
}

export function IntroView({ onStartInstall, onSkipToConfig }: Props) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center pb-2">
      <div
        className="w-[72px] h-[72px] rounded-[18px] flex items-center justify-center mb-6"
        style={{
          background: "linear-gradient(135deg, #3B82F6, #2563EB)",
          boxShadow: "0 4px 20px rgba(37,99,235,0.3)",
        }}
      >
        <svg
          width="36"
          height="36"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#fff"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 2L4 7l8 5 8-5-8-5z" />
          <path d="M4 12l8 5 8-5" />
          <path d="M4 17l8 5 8-5" />
        </svg>
      </div>
      <h1 className="text-[26px] font-bold m-0 mb-3">先安装 OpenClaw，再创建你的第一个助手</h1>
      <p className="text-sm text-[#64748B] leading-[1.65] max-w-[420px] m-0 mb-8">
        跟着这条主路径走，你只需要安装 OpenClaw、连接一个 AI 服务、选择一个模板，马上就能开始第一次对话。
      </p>
      <div className="flex flex-col gap-2.5 w-full max-w-[340px]">
        <button
          onClick={onStartInstall}
          className="w-full bg-[#2563EB] text-white border-none px-[18px] py-[11px] rounded-lg text-[15px] font-medium cursor-pointer hover:bg-[#1D4ED8] flex items-center justify-center gap-1.5"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
          开始安装 OpenClaw
        </button>
        <button
          onClick={onSkipToConfig}
          className="w-full bg-transparent text-[#64748B] border border-[#E5E7EB] px-[18px] py-[9px] rounded-lg text-sm font-medium cursor-pointer hover:bg-[#F8FAFC] hover:text-[#0F172A] flex items-center justify-center"
        >
          已安装，继续连接 AI 服务 →
        </button>
      </div>
      <p className="text-[12px] text-[#94A3B8] mt-5">首次成功主线大约 3 分钟，中途退出也可继续</p>
    </div>
  );
}
