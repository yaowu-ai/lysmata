import { useState } from "react";
import { apiClient } from "../../../shared/api-client";
import { useGatewaySettings } from "../../../shared/hooks/useGatewaySettings";
import { useLlmSettings } from "../../../shared/hooks/useLlmSettings";
import { WIZARD_FLOW } from "../../../shared/store/wizard-store";

interface Props {
  skippedSteps: Record<string, boolean>;
  onRegisterSubmit: (fn: () => Promise<void>) => void;
  onDone: () => void;
}

export function ReviewView({ skippedSteps, onRegisterSubmit, onDone }: Props) {
  const { data: gatewaySettings, isLoading: gwLoading } = useGatewaySettings();
  const { data: llmSettings, isLoading: llmLoading } = useLlmSettings();
  const [restartGateway, setRestartGateway] = useState(true);

  const skippedNames = WIZARD_FLOW.filter((s) => s.type === "config" && skippedSteps[s.id]).map(
    (s) => s.title,
  );

  // Register submit handler synchronously so parent always holds the latest closure.
  onRegisterSubmit(async () => {
    if (restartGateway) {
      await apiClient.post("/settings/gateway-restart", {});
    }
    onDone();
  });

  const isLoading = gwLoading || llmLoading;

  // Build diff lines from real backend data
  const diffLines: { key: string; value: string }[] = [];
  if (gatewaySettings) {
    diffLines.push({ key: "gateway.port", value: String(gatewaySettings.port) });
    diffLines.push({ key: "gateway.bind", value: gatewaySettings.bind });
    diffLines.push({ key: "gateway.auth.mode", value: gatewaySettings.authMode });
  }
  if (llmSettings?.defaultModel.primary) {
    diffLines.push({ key: "agents.defaults.model.primary", value: llmSettings.defaultModel.primary });
    const providers = Object.keys(llmSettings.providers);
    if (providers.length > 0) {
      diffLines.push({ key: "models.providers", value: providers.join(", ") });
    }
  }

  return (
    <div>
      <div className="inline-flex text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#EFF6FF] text-[#2563EB] border border-[#BFDBFE] mb-2.5">
        step 6 / 6 · 检查与应用
      </div>
      <h2 className="text-[20px] font-bold mb-1.5">确认配置</h2>
      <p className="text-sm text-[#64748B] mb-4">确认以下变更，应用并重启 Gateway。</p>

      <div className="bg-[#1E293B] rounded-lg p-4 font-mono text-[12px] leading-[1.65] text-[#E2E8F0] mb-4 max-h-[180px] overflow-y-auto">
        <div className="text-[#64748B]">// openclaw.json (当前配置摘要)</div>
        {isLoading ? (
          <div className="text-[#64748B] animate-pulse mt-1">读取配置中...</div>
        ) : diffLines.length > 0 ? (
          diffLines.map(({ key, value }) => (
            <div key={key} className="text-[#10B981]">
              + {key}: {value}
            </div>
          ))
        ) : (
          <div className="text-[#64748B] mt-1">暂无已保存的配置记录</div>
        )}
      </div>

      {skippedNames.length > 0 && (
        <div className="px-3.5 py-2.5 bg-[#FFFBEB] border border-[#FDE68A] rounded-lg text-[13px] text-[#92400E] mb-3">
          <strong>提示：</strong>以下步骤已跳过，可在「设置」中随时配置：{skippedNames.join("、")}
        </div>
      )}

      <div className="flex items-center justify-between px-4 py-3.5 bg-[#FFFBEB] border border-[#FDE68A] rounded-[10px]">
        <div>
          <div className="text-sm font-medium text-[#B45309]">重启 Gateway</div>
          <div className="text-xs text-[#92400E] mt-0.5">核心参数变更需要重启服务以生效。</div>
        </div>
        <div className="cursor-pointer" onClick={() => setRestartGateway((v) => !v)}>
          <div
            className={`relative w-9 h-5 rounded-[10px] transition-colors ${restartGateway ? "bg-[#F59E0B]" : "bg-[#CBD5E1]"}`}
          >
            <div
              className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${restartGateway ? "translate-x-[18px]" : "translate-x-0.5"}`}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
