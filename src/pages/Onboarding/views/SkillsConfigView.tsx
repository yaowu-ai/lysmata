export function SkillsConfigView() {
  return (
    <div>
      <div className="inline-flex text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#F1F5F9] text-[#64748B] border border-[#E5E7EB] mb-2.5">
        step 4 / 6 · 可跳过
      </div>
      <h2 className="text-[20px] font-bold mb-1.5">Skills 配置</h2>
      <p className="text-sm text-[#64748B] mb-5">从 ClawHub 安装或配置本地自定义技能。</p>
      <div className="text-sm text-[#94A3B8] py-12 text-center border border-dashed border-[#E5E7EB] rounded-[10px]">
        可在安装完成后通过「设置 → Skills」管理技能，此步可跳过。
      </div>
    </div>
  );
}
