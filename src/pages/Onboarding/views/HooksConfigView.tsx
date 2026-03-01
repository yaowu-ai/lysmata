export function HooksConfigView() {
  return (
    <div>
      <div className="inline-flex text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#F1F5F9] text-[#64748B] border border-[#E5E7EB] mb-2.5">
        step 5 / 6 · 可跳过
      </div>
      <h2 className="text-[20px] font-bold mb-1.5">Hooks 配置</h2>
      <p className="text-sm text-[#64748B] mb-5">设置请求的预处理或后处理钩子逻辑，默认关闭。</p>
      <div className="text-sm text-[#94A3B8] py-12 text-center border border-dashed border-[#E5E7EB] rounded-[10px]">
        Hooks 支持热重载，可在安装后随时配置，此步可跳过。
      </div>
    </div>
  );
}
