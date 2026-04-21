import { Tag } from "antd";
import type { Message } from "../../shared/types";

interface Props {
  message: Message;
  metadata: Record<string, unknown>;
}

export function SystemEventBubble({ message, metadata }: Props) {
  const hasResult = "result" in metadata;
  const hasReason = "reason" in metadata && !hasResult;
  const hasSummary = "summary" in metadata;

  if (hasResult) {
    const result = metadata.result as { command?: string; output?: string } | undefined;
    return (
      <div className="border border-[#D1FAE5] bg-[#F0FDF4] rounded-lg overflow-hidden text-[13px] max-w-[75%]">
        <div className="px-3 py-2 font-semibold flex items-center gap-2 border-b border-[#D1FAE5]">
          <Tag color="success">完成</Tag> 命令执行完成
        </div>
        {result && (
          <div className="p-3">
            {result.command != null && (
              <div className="mb-1">
                <code className="bg-[#DCFCE7] px-1.5 py-0.5 rounded text-[#166534] text-[12px]">
                  {result.command}
                </code>
              </div>
            )}
            {result.output != null && (
              <pre className="bg-[#1E293B] text-[#E2E8F0] p-2 rounded-md overflow-x-auto text-[12px] max-h-[120px] overflow-y-auto mt-2">
                {result.output}
              </pre>
            )}
          </div>
        )}
      </div>
    );
  }

  if (hasReason) {
    return (
      <div className="border border-[#FEE2E2] bg-[#FFF5F5] rounded-lg overflow-hidden text-[13px] max-w-[75%]">
        <div className="px-3 py-2 font-semibold flex items-center gap-2 border-b border-[#FEE2E2]">
          <Tag color="error">拒绝</Tag> 命令执行被拒绝
        </div>
        <div className="p-3 text-[#991B1B]">{String(metadata.reason || "未提供原因")}</div>
      </div>
    );
  }

  if (hasSummary) {
    return (
      <div className="border border-[#E2E8F0] bg-[#F8FAFC] rounded-lg overflow-hidden text-[13px] max-w-[75%]">
        <div className="px-3 py-2 font-semibold flex items-center gap-2 border-b border-[#E2E8F0] text-[#475569]">
          <Tag>定时</Tag> 定时任务完成
        </div>
        <div className="p-3 text-[#334155] whitespace-pre-wrap">{String(metadata.summary)}</div>
      </div>
    );
  }

  return (
    <div className="border border-[#E2E8F0] bg-[#F8FAFC] rounded-lg px-3 py-2 text-[13px] text-[#64748B] max-w-[75%]">
      <Tag>系统</Tag>
      {message.content}
    </div>
  );
}
