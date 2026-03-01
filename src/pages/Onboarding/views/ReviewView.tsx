import { WIZARD_FLOW } from '../../../shared/store/wizard-store';

interface Props {
  skippedSteps: Record<string, boolean>;
  onRegisterSubmit: (fn: () => Promise<void>) => void;
  onDone: () => void;
}

export function ReviewView({ skippedSteps, onRegisterSubmit, onDone }: Props) {
  const skippedNames = WIZARD_FLOW
    .filter((s) => s.type === 'config' && skippedSteps[s.id])
    .map((s) => s.title);

  // Register submit handler synchronously so parent always holds the latest closure.
  onRegisterSubmit(async () => { onDone(); });

  return (
    <div>
      <div className="inline-flex text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#EFF6FF] text-[#2563EB] border border-[#BFDBFE] mb-2.5">
        step 6 / 6 · 检查与应用
      </div>
      <h2 className="text-[20px] font-bold mb-1.5">确认配置</h2>
      <p className="text-sm text-[#64748B] mb-4">确认以下变更，应用并重启 Gateway。</p>

      <div className="bg-[#1E293B] rounded-lg p-4 font-mono text-[12px] leading-[1.65] text-[#E2E8F0] mb-4 max-h-[180px] overflow-y-auto">
        <div className="text-[#64748B]">// openclaw.json (配置摘要)</div>
        <div className="text-[#10B981]">+ gateway.port: 18789</div>
        <div className="text-[#10B981]">+ gateway.auth.mode: none</div>
        <div className="text-[#10B981]">+ gateway.autostart: true</div>
        <div className="text-[#10B981]">+ models.providers: configured</div>
      </div>

      {skippedNames.length > 0 && (
        <div className="px-3.5 py-2.5 bg-[#FFFBEB] border border-[#FDE68A] rounded-lg text-[13px] text-[#92400E] mb-3">
          <strong>提示：</strong>以下步骤已跳过，可在「设置」中随时配置：{skippedNames.join('、')}
        </div>
      )}

      <div className="flex items-center justify-between px-4 py-3.5 bg-[#FFFBEB] border border-[#FDE68A] rounded-[10px]">
        <div>
          <div className="text-sm font-medium text-[#B45309]">重启 Gateway</div>
          <div className="text-xs text-[#92400E] mt-0.5">核心参数变更需要重启服务以生效。</div>
        </div>
        <div className="w-9 h-5 rounded-full bg-[#F59E0B] flex-shrink-0" />
      </div>
    </div>
  );
}
