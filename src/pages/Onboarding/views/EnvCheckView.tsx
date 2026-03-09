// src/pages/Onboarding/views/EnvCheckView.tsx
import { useEffect, useState } from "react";
import { apiClient } from "../../../shared/api-client";
import { getSidecarLogs } from "../../../shared/tauri-bridge";

interface EnvCheckResult {
  canInstall: boolean;
  message: string;
  hasOpenClaw: boolean;
  openclawVersion?: string;
  hasNode: boolean;
  nodeVersion?: string;
  nodeMajor?: number;
  hasCurl: boolean;
  platform: string;
}

type ItemStatus = "checking" | "pass" | "warn" | "fail";

interface CheckItem {
  label: string;
  desc: string;
  status: ItemStatus;
  detail: string;
}

interface Props {
  onEnvReady?: (result: { canInstall: boolean; hasOpenClaw: boolean }) => void;
}

export function EnvCheckView({ onEnvReady }: Props) {
  const [items, setItems] = useState<CheckItem[]>([
    { label: "OpenClaw", desc: "检测已安装的 OpenClaw", status: "checking", detail: "检测中..." },
    { label: "Node.js", desc: "版本要求 v22.0 或以上", status: "checking", detail: "检测中..." },
    { label: "网络工具", desc: "curl 用于下载安装包", status: "checking", detail: "检测中..." },
  ]);
  const [envResult, setEnvResult] = useState<EnvCheckResult | null>(null);
  const [showLogs, setShowLogs] = useState(false);
  const [logs, setLogs] = useState<string>("");

  const fetchLogs = async () => {
    if (import.meta.env.PROD) {
      try {
        const logContent = await getSidecarLogs();
        setLogs(logContent);
        setShowLogs(true);
      } catch (e) {
        setLogs(`无法获取日志: ${e}`);
        setShowLogs(true);
      }
    }
  };

  useEffect(() => {
    console.log("[EnvCheck] Starting environment check...");
    console.log("[EnvCheck] API Base URL:", import.meta.env.PROD ? "http://127.0.0.1:2620" : "http://127.0.0.1:2026");
    
    apiClient
      .get<EnvCheckResult>("/openclaw/check-environment")
      .then((res) => {
        console.log("[EnvCheck] API response:", res);
        setEnvResult(res);

        const openclawItem: CheckItem = res.hasOpenClaw
          ? { label: "OpenClaw", desc: "检测已安装的 OpenClaw", status: "pass", detail: `已安装 ${res.openclawVersion ?? ""}` }
          : { label: "OpenClaw", desc: "检测已安装的 OpenClaw", status: "warn", detail: "未安装，将自动安装" };

        let nodeItem: CheckItem;
        if (res.hasNode) {
          nodeItem = { label: "Node.js", desc: "版本要求 v22.0 或以上", status: "pass", detail: `${res.nodeVersion} 就绪` };
        } else if (res.nodeVersion) {
          nodeItem = { label: "Node.js", desc: "版本要求 v22.0 或以上", status: "warn", detail: `当前 ${res.nodeVersion}，版本过低` };
        } else {
          nodeItem = {
            label: "Node.js",
            desc: "版本要求 v22.0 或以上",
            status: res.hasCurl && res.platform !== "win32" ? "warn" : "fail",
            detail: res.hasCurl ? "未安装，安装脚本将自动处理" : "未安装",
          };
        }

        const curlItem: CheckItem = res.hasCurl
          ? { label: "网络工具", desc: "curl 用于下载安装包", status: "pass", detail: "curl 可用" }
          : { label: "网络工具", desc: "curl 用于下载安装包", status: "fail", detail: "未检测到 curl" };

        setItems([openclawItem, nodeItem, curlItem]);
        onEnvReady?.({ canInstall: res.canInstall, hasOpenClaw: res.hasOpenClaw });
      })
      .catch(async (error) => {
        console.error("[EnvCheck] API connection failed:", error);
        console.error("[EnvCheck] Error details:", {
          message: error.message,
          status: error.status,
          stack: error.stack
        });
        
        // Try to fetch directly to see what's happening
        try {
          const directFetch = await fetch("http://127.0.0.1:2620/health");
          console.log("[EnvCheck] Direct health check status:", directFetch.status);
          const healthData = await directFetch.json();
          console.log("[EnvCheck] Direct health check data:", healthData);
        } catch (e) {
          console.error("[EnvCheck] Direct health check also failed:", e);
        }
        
        setItems((prev) =>
          prev.map((i) => ({ ...i, status: "fail" as ItemStatus, detail: "API 连接失败" })),
        );
        onEnvReady?.({ canInstall: false, hasOpenClaw: false });
        
        // Auto-fetch logs on error in production
        if (import.meta.env.PROD) {
          await fetchLogs();
        }
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const statusStyle: Record<ItemStatus, { dot: string; text: string }> = {
    checking: { dot: "bg-[#F59E0B] animate-pulse", text: "text-[#F59E0B]" },
    pass: { dot: "bg-[#10B981]", text: "text-[#15803D]" },
    warn: { dot: "bg-[#F59E0B]", text: "text-[#D97706]" },
    fail: { dot: "bg-[#DC2626]", text: "text-[#DC2626]" },
  };

  const canProceed = envResult?.canInstall ?? false;
  const allPass = items.every((i) => i.status === "pass");
  const hasFailed = items.some((i) => i.status === "fail");

  return (
    <div>
      <h2 className="text-[20px] font-bold mb-1.5">环境检测</h2>
      <p className="text-sm text-[#64748B] mb-5">正在检测安装 OpenClaw 所需的系统环境...</p>

      <div className="bg-[#FAFAFA] border border-[#E5E7EB] rounded-[10px] overflow-hidden">
        {items.map((item, idx) => {
          const { dot, text } = statusStyle[item.status];
          return (
            <div
              key={item.label}
              className={`flex items-center justify-between px-[18px] py-3.5 ${idx < items.length - 1 ? "border-b border-[#F1F5F9]" : ""}`}
            >
              <div>
                <div className="text-sm font-medium">{item.label}</div>
                <div className="text-xs text-[#64748B] mt-0.5">{item.desc}</div>
              </div>
              <div className={`flex items-center gap-1.5 text-[13px] font-medium ${text}`}>
                <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
                {item.detail}
              </div>
            </div>
          );
        })}
      </div>

      {envResult && (
        <div
          className={`mt-5 px-4 py-3 rounded-lg border text-[13px] leading-normal ${
            allPass
              ? "bg-[#F0FDF4] border-[#BBF7D0] text-[#15803D]"
              : canProceed
                ? "bg-[#EFF6FF] border-[#BFDBFE] text-[#1E40AF]"
                : "bg-[#FEF2F2] border-[#FECACA] text-[#DC2626]"
          }`}
        >
          {allPass ? (
            <>
              <strong className="font-semibold">一切就绪！</strong> OpenClaw 已安装，可直接进入配置。
            </>
          ) : canProceed ? (
            <>
              <strong className="font-semibold">提示：</strong>
              {envResult.hasNode
                ? "检测通过，点击下一步将通过 npm 安装 OpenClaw CLI 与 Gateway。"
                : "Node.js 未安装，安装脚本将自动下载 Node.js 22+ 并安装 OpenClaw。整个过程约 1-3 分钟。"}
            </>
          ) : (
            <>
              <strong className="font-semibold">无法自动安装：</strong> {envResult.message}
              。请先在终端运行{" "}
              <code className="bg-red-100 px-1 rounded text-xs">
                curl -fsSL https://openclaw.ai/install.sh | bash
              </code>
            </>
          )}
        </div>
      )}

      {hasFailed && import.meta.env.PROD && (
        <div className="mt-4">
          <button
            onClick={fetchLogs}
            className="text-sm text-blue-600 hover:text-blue-800 underline"
          >
            {showLogs ? "刷新日志" : "查看诊断日志"}
          </button>
        </div>
      )}

      {showLogs && (
        <div className="mt-4 bg-black text-green-400 p-4 rounded-lg text-xs font-mono overflow-auto max-h-[300px]">
          <div className="flex justify-between items-center mb-2">
            <span className="text-white font-semibold">Sidecar 诊断日志</span>
            <button
              onClick={() => setShowLogs(false)}
              className="text-gray-400 hover:text-white"
            >
              关闭
            </button>
          </div>
          <pre className="whitespace-pre-wrap">{logs}</pre>
        </div>
      )}
    </div>
  );
}
