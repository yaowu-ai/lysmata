import { TEMPLATES } from "./template-meta";

interface Props {
  selectedTemplateId: string;
  onSelectTemplate: (id: string) => void;
}

export function TemplateSelectView({ selectedTemplateId, onSelectTemplate }: Props) {
  return (
    <div>
      <div className="inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#EFF6FF] text-[#2563EB] border border-[#BFDBFE] mb-2.5">
        step 4 / 5
      </div>
      <h2 className="text-[20px] font-bold mb-1.5">选择第一个助手模板</h2>
      <p className="text-sm text-[#64748B] mb-5">先选一个最接近当前需求的模板，后续随时可以调整。</p>

      <div className="grid grid-cols-3 gap-3">
        {TEMPLATES.map((template) => {
          const active = selectedTemplateId === template.id;
          return (
            <button
              key={template.id}
              type="button"
              onClick={() => onSelectTemplate(template.id)}
              className={[
                "text-left rounded-xl border p-4 transition-all",
                active
                  ? "border-[#93C5FD] bg-[#F8FBFF] shadow-[0_0_0_3px_rgba(147,197,253,0.2)]"
                  : "border-[#E5E7EB] bg-white hover:border-[#93C5FD]",
              ].join(" ")}
            >
              <div className="w-10 h-10 rounded-lg bg-[#EFF6FF] flex items-center justify-center text-lg mb-3">
                {template.icon}
              </div>
              <div className="font-semibold text-sm text-[#0F172A] mb-1">{template.name}</div>
              <div className="text-xs text-[#64748B] leading-5">{template.description}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
