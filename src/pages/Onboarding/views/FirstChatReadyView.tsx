import { useNavigate } from "react-router-dom";
import { clearOnboardingProgress } from "../../../shared/store/wizard-store";
import { getTemplateMeta } from "./template-meta";

interface Props {
  assistantName: string;
  templateId: string;
  onRestart: () => void;
}

export function FirstChatReadyView({ assistantName, templateId, onRestart }: Props) {
  const navigate = useNavigate();
  const templateMeta = getTemplateMeta(templateId);

  function handleGoChat() {
    clearOnboardingProgress();
    navigate("/chat/private");
  }

  function handleGoWorkshop() {
    clearOnboardingProgress();
    navigate("/bots");
  }

  return (
    <div className="flex flex-col items-center justify-center h-full text-center pb-2">
      <div className="w-[76px] h-[76px] rounded-full border-4 border-[#BBF7D0] flex items-center justify-center mb-6 text-[28px] bg-[#DCFCE7]">
        {templateMeta.icon}
      </div>
      <h1 className="text-[24px] font-bold m-0 mb-3">你的第一个助手已经准备好了</h1>
      <p className="text-sm text-[#64748B] leading-[1.65] max-w-[480px] m-0 mb-7">
        <strong className="text-[#0F172A]">{assistantName || "我的第一个助手"}</strong>
        {" "}已按{templateMeta.name}模板创建完成。现在可以直接开始第一次对话。
      </p>

      <div className="flex flex-col gap-2.5 w-full max-w-[340px]">
        <button
          onClick={handleGoChat}
          className="w-full bg-[#2563EB] text-white border-none px-[18px] py-[11px] rounded-lg text-[15px] font-medium cursor-pointer hover:bg-[#1D4ED8]"
        >
          立即开始对话
        </button>
        <button
          onClick={handleGoWorkshop}
          className="w-full bg-transparent text-[#64748B] border border-[#E5E7EB] px-[18px] py-[9px] rounded-lg text-sm font-medium cursor-pointer hover:bg-[#F8FAFC] hover:text-[#0F172A]"
        >
          先回助手工坊
        </button>
      </div>

      <button
        onClick={onRestart}
        className="bg-transparent border-none text-[#64748B] text-[13px] font-medium cursor-pointer underline underline-offset-[3px] hover:text-[#0F172A] mt-4"
      >
        重新运行首次成功向导
      </button>
    </div>
  );
}
