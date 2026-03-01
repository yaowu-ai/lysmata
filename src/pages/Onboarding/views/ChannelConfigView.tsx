export function ChannelConfigView() {
  return (
    <div>
      <div className="inline-flex text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#F1F5F9] text-[#64748B] border border-[#E5E7EB] mb-2.5">
        step 3 / 6 · 可跳过
      </div>
      <h2 className="text-[20px] font-bold mb-1.5">Channel 配置</h2>
      <p className="text-sm text-[#64748B] mb-5">配置可接入 Gateway 的客户端通道白名单与鉴权。</p>
      <div className="text-sm text-[#94A3B8] py-12 text-center border border-dashed border-[#E5E7EB] rounded-[10px]">
        Channel 配置将在安装完成后通过「设置」页管理，此步可跳过。
      </div>
    </div>
  );
}
