import { Button, Result } from "antd";
import { useState } from "react";
import { useResolveApproval } from "../../shared/hooks/useMessages";
import { cn } from "../../shared/lib/utils";
import type { Message } from "../../shared/types";

interface Props {
  message: Message;
  metadata: Record<string, unknown>;
}

type Resolved = "pending" | "approved" | "rejected";

export function ApprovalBubble({ message, metadata }: Props) {
  const resolveMut = useResolveApproval(message.conversation_id);
  const [resolved, setResolved] = useState<Resolved>("pending");
  const bot = message.bot;

  const command =
    (metadata.call as Record<string, unknown> | undefined)?.command ??
    (metadata.command as string | undefined) ??
    "未知";
  const args = (metadata.call as Record<string, unknown> | undefined)?.args ?? metadata.args ?? {};

  function handle(approved: boolean) {
    if (!bot || !metadata.id) return;
    resolveMut.mutate(
      { approvalId: metadata.id as string, botId: bot.id, approved },
      {
        onSuccess: () => setResolved(approved ? "approved" : "rejected"),
      },
    );
  }

  return (
    <div className="border border-[#E2E8F0] bg-white rounded-lg shadow-sm overflow-hidden text-[13px] max-w-[75%]">
      <div className="bg-[#F8FAFC] border-b border-[#E2E8F0] px-3 py-2 font-semibold flex items-center gap-2">
        <span className="text-[#F59E0B]">⚠️</span>
        执行审批请求
      </div>
      <div className="p-3">
        <div className="mb-2">
          <span className="text-[#64748B] mr-2">命令:</span>
          <code className="bg-[#F1F5F9] px-1.5 py-0.5 rounded text-[#0F172A]">
            {String(command)}
          </code>
        </div>
        <div className="mb-3">
          <span className="text-[#64748B] block mb-1">参数:</span>
          <pre className="bg-[#1E293B] text-[#E2E8F0] p-2 rounded-md overflow-x-auto text-[12px]">
            {JSON.stringify(args, null, 2)}
          </pre>
        </div>

        {resolved === "pending" ? (
          <div className="flex items-center gap-2 mt-3">
            <Button
              type="primary"
              block
              loading={resolveMut.isPending}
              onClick={() => handle(true)}
              style={{ backgroundColor: "#10B981", borderColor: "#10B981" }}
            >
              允许
            </Button>
            <Button danger block loading={resolveMut.isPending} onClick={() => handle(false)}>
              拒绝
            </Button>
          </div>
        ) : (
          <Result
            status={resolved === "approved" ? "success" : "error"}
            title={resolved === "approved" ? "已允许" : "已拒绝"}
            style={{ padding: 8 }}
            className={cn(
              "rounded mt-3",
              resolved === "approved" ? "bg-[#D1FAE5]" : "bg-[#FEE2E2]",
            )}
          />
        )}
      </div>
    </div>
  );
}
