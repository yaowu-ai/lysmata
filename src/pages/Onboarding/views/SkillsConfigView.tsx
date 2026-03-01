interface Skill {
  id: string;
  icon: string;
  name: string;
  description: string;
  installed: boolean;
}

interface Props {
  onRegisterSubmit: (fn: () => Promise<void>) => void;
  onDone: () => void;
}

const RECOMMENDED_SKILLS: Skill[] = [
  {
    id: "system-execution",
    icon: "🖥️",
    name: "System Execution",
    description: "允许大模型在本地执行终端命令和读写文件。",
    installed: true,
  },
  {
    id: "web-search",
    icon: "🌐",
    name: "Web Search",
    description: "允许大模型调用搜索引擎获取实时信息。",
    installed: false,
  },
  {
    id: "file-reader",
    icon: "📄",
    name: "File Reader",
    description: "读取并解析 PDF、Word、Excel 等文档格式。",
    installed: false,
  },
];

export function SkillsConfigView({ onRegisterSubmit, onDone }: Props) {
  // No backend write at onboarding stage — skills are managed post-setup.
  onRegisterSubmit(async () => {
    onDone();
  });

  return (
    <div>
      <div className="inline-flex text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#F1F5F9] text-[#64748B] border border-[#E5E7EB] mb-2.5">
        step 4 / 6 · 可跳过
      </div>
      <h2 className="text-[20px] font-bold mb-1.5">Skills 配置</h2>
      <p className="text-sm text-[#64748B] mb-5">从 ClawHub 安装或配置本地自定义技能。</p>

      <div className="grid grid-cols-2 gap-3">
        {RECOMMENDED_SKILLS.map((skill) => (
          <div
            key={skill.id}
            className={`bg-white border rounded-[10px] p-4 ${skill.installed ? "border-[#BFDBFE]" : "border-[#E5E7EB]"}`}
          >
            <div className="text-[22px] mb-2">{skill.icon}</div>
            <div className="font-semibold text-sm mb-1">{skill.name}</div>
            <div className="text-[12px] text-[#64748B] leading-[1.5] mb-3.5">{skill.description}</div>
            {skill.installed ? (
              <div className="w-full flex items-center justify-center gap-1.5 bg-[#F1F5F9] text-[#475569] border border-[#E2E8F0] px-2.5 py-1 rounded-lg text-[12px] font-medium">
                已安装 ✓
              </div>
            ) : (
              <button className="w-full flex items-center justify-center gap-1.5 bg-transparent text-[#64748B] border border-[#E5E7EB] px-2.5 py-1 rounded-lg text-[12px] font-medium cursor-pointer hover:bg-[#F8FAFC] transition-colors">
                点击安装
              </button>
            )}
          </div>
        ))}

        {/* Browse ClawHub */}
        <div
          className="bg-white border border-dashed border-[#E5E7EB] rounded-[10px] p-4 flex flex-col items-center justify-center text-center gap-2 cursor-pointer text-[#64748B] hover:bg-[#F8FAFC] transition-colors"
        >
          <div className="text-[22px]">🔍</div>
          <div className="text-[13px] font-medium">浏览 ClawHub</div>
          <div className="text-[12px]">探索更多社区技能</div>
        </div>
      </div>
    </div>
  );
}
