// src/pages/Onboarding/views/InstallSuccessView.tsx
interface Props {
  onConfigNow: () => void;
  onDefer: () => void;
}

export function InstallSuccessView({ onConfigNow, onDefer }: Props) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center pb-2">
      <div className="w-[72px] h-[72px] rounded-full bg-[#DCFCE7] border-4 border-[#BBF7D0] flex items-center justify-center mb-6 text-[#16A34A]">
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
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
      <h1 className="text-[24px] font-bold m-0 mb-3">安装已经完成，离第一次对话只差一步</h1>
      <p className="text-sm text-[#64748B] leading-[1.65] max-w-[420px] m-0 mb-8">
        OpenClaw 核心组件已成功部署至你的系统。
        <br />
        接下来只要连接 1 个 AI 服务，就可以继续选择模板并创建第一个助手。
      </p>
      <div className="flex flex-col gap-2.5 w-full max-w-[340px]">
        <button
          onClick={onConfigNow}
          className="w-full bg-[#2563EB] text-white border-none px-[18px] py-[11px] rounded-lg text-[15px] font-medium cursor-pointer hover:bg-[#1D4ED8] flex items-center justify-center"
        >
          继续连接 AI 服务 →
        </button>
        <button
          onClick={onDefer}
          className="w-full bg-transparent text-[#64748B] border border-[#E5E7EB] px-[18px] py-[9px] rounded-lg text-sm font-medium cursor-pointer hover:bg-[#F8FAFC] hover:text-[#0F172A]"
        >
          稍后继续
        </button>
      </div>
    </div>
  );
}
