import { useEffect, useState } from "react";
import { getTemplateMeta } from "./template-meta";

interface Props {
  selectedTemplateId: string;
  assistantName: string;
  onAssistantNameChange: (name: string) => void;
  onRegisterSubmit: (fn: () => Promise<void>) => void;
  onDone: () => void;
}

export function AssistantCreateView({
  selectedTemplateId,
  assistantName,
  onAssistantNameChange,
  onRegisterSubmit,
  onDone,
}: Props) {
  const [nameError, setNameError] = useState<string>("");
  const templateMeta = getTemplateMeta(selectedTemplateId);

  useEffect(() => {
    const submit = async () => {
      const value = assistantName.trim();
      if (!value) {
        setNameError("请先填写助手名称");
        throw new Error("assistant name required");
      }
      setNameError("");
      onDone();
    };
    onRegisterSubmit(submit);
  }, [assistantName, onDone, onRegisterSubmit]);

  return (
    <div>
      <div className="inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#EFF6FF] text-[#2563EB] border border-[#BFDBFE] mb-2.5">
        step 5 / 5
      </div>
      <h2 className="text-[20px] font-bold mb-1.5">创建你的第一个助手</h2>
      <p className="text-sm text-[#64748B] mb-5">保持推荐项即可，创建成功后会直接进入第一次对话。</p>

      <div className="rounded-xl border border-[#E5E7EB] bg-[#FAFAFA] p-4 mb-4">
        <div className="text-xs text-[#64748B] mb-1">当前模板</div>
        <div className="flex items-center gap-2 text-sm font-semibold text-[#0F172A]">
          <span className="w-8 h-8 rounded-lg bg-[#EFF6FF] flex items-center justify-center text-base">
            {templateMeta.icon}
          </span>
          {templateMeta.name}
        </div>
      </div>

      <div className="mb-3">
        <label className="block text-[13px] font-medium mb-1.5">助手名称</label>
        <input
          type="text"
          value={assistantName}
          onChange={(e) => {
            onAssistantNameChange(e.target.value);
            if (nameError) setNameError("");
          }}
          placeholder="例如：我的第一个助手"
          className={[
            "w-full px-3 py-[9px] text-sm border rounded-lg outline-none",
            nameError
              ? "border-[#FCA5A5] focus:border-[#F87171]"
              : "border-[#E5E7EB] focus:border-[#93C5FD]",
          ].join(" ")}
        />
        {nameError && <p className="text-xs text-[#DC2626] mt-1">{nameError}</p>}
      </div>

      <div className="text-xs text-[#64748B] leading-5 rounded-lg border border-[#E5E7EB] bg-white p-3">
        系统会自动复用当前 OpenClaw 与 LLM 设置，不需要你额外配置 Gateway / Agent / Hooks。
      </div>
    </div>
  );
}
