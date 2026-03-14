// src/pages/Onboarding/views/EnvCheckView.tsx
import { useEffect, useState } from "react";
import { apiClient } from "../../../shared/api-client";
import { getSidecarLogs } from "../../../shared/tauri-bridge";

interface WindowsShellOption {
  id: string;
  label: string;
}

interface EnvCheckResult {
  canInstall: boolean;
  message: string;
  hasOpenClaw: boolean;
  openclawVersion?: string;
  openclawPath?: string;
  hasNode: boolean;
  nodeVersion?: string;
  nodeMajor?: number;
  nodePath?: string;
  hasNpm?: boolean;
  npmPath?: string;
  hasCurl: boolean;
  networkReachable?: boolean;
  platform: string;
  windowsShell?: string;
  windowsShellOptions?: WindowsShellOption[];
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
    { label: "网络连通", desc: "连接安装服务器", status: "checking", detail: "检测中..." },
  ]);
  const [envResult, setEnvResult] = useState<EnvCheckResult | null>(null);
  const [showLogs, setShowLogs] = useState(false);
  const [logs, setLogs] = useState<string>("");
  const [checking, setChecking] = useState(true);

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

  const runEnvCheck = async () => {
    setChecking(true);
    apiClient
      .get<EnvCheckResult>("/openclaw/check-environment")
      .then((res) => {
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

        let networkItem: CheckItem;
        if (res.hasOpenClaw) {
          networkItem = { label: "网络连通", desc: "连接安装服务器", status: "pass", detail: "已安装，无需网络" };
        } else if (res.networkReachable === undefined) {
          networkItem = { label: "网络连通", desc: "连接安装服务器", status: "warn", detail: "未检测" };
        } else if (res.networkReachable) {
          networkItem = { label: "网络连通", desc: "连接安装服务器", status: "pass", detail: "服务器可达" };
        } else {
          networkItem = { label: "网络连通", desc: "连接安装服务器", status: "fail", detail: "无法连接安装服务器，请检查网络" };
        }

        setItems([openclawItem, nodeItem, curlItem, networkItem]);
        onEnvReady?.({ canInstall: res.canInstall, hasOpenClaw: res.hasOpenClaw });
      })
      .catch(async () => {
        setItems((prev) =>
          prev.map((i) => ({ ...i, status: "fail" as ItemStatus, detail: "API 连接失败" })),
        );
        onEnvReady?.({ canInstall: false, hasOpenClaw: false });
        
        // Auto-fetch logs on error in production
        if (import.meta.env.PROD) {
          await fetchLogs();
        }
      })
      .finally(() => {
        setChecking(false);
      });
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void runEnvCheck();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleWindowsShellChange = async (value: string) => {
    setChecking(true);
    await apiClient.put("/openclaw/shell-preferences", { windowsShell: value });
    await runEnvCheck();
  };

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

      {envResult?.platform === "win32" && (envResult.windowsShellOptions?.length ?? 0) > 0 && (
        <div className="mt-4 rounded-lg border border-[#E5E7EB] bg-[#FAFAFA] px-4 py-3">
          <div className="text-sm font-medium text-[#0F172A]">Windows Shell</div>
          <div className="text-xs text-[#64748B] mt-1 mb-3">
            用选定的 shell 解析 `node`、`npm`、`openclaw` 的实际路径；切换后会重新检测环境。
          </div>
          <select
            value={envResult.windowsShell ?? "auto"}
            onChange={(e) => void handleWindowsShellChange(e.target.value)}
            disabled={checking}
            className="w-full rounded-md border border-[#CBD5E1] bg-white px-3 py-2 text-sm text-[#0F172A] disabled:bg-[#F8FAFC]"
          >
            {envResult.windowsShellOptions?.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      )}

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

      {envResult && (
        <div className="mt-4 rounded-lg border border-[#E5E7EB] bg-[#FAFAFA] px-4 py-3">
          <div className="text-sm font-medium text-[#0F172A]">检测结果</div>
          <div className="text-xs text-[#64748B] mt-1 mb-3">
            下面显示的是应用当前实际解析到的可执行文件路径。
          </div>
          <div className="space-y-2 text-xs">
            <div className="grid grid-cols-[92px_1fr] gap-2">
              <span className="text-[#64748B]">OpenClaw</span>
              <code className="break-all rounded bg-white px-2 py-1 text-[#0F172A] border border-[#E5E7EB]">
                {envResult.openclawPath ?? "未解析到"}
              </code>
            </div>
            <div className="grid grid-cols-[92px_1fr] gap-2">
              <span className="text-[#64748B]">Node.js</span>
              <code className="break-all rounded bg-white px-2 py-1 text-[#0F172A] border border-[#E5E7EB]">
                {envResult.nodePath ?? "未解析到"}
              </code>
            </div>
            <div className="grid grid-cols-[92px_1fr] gap-2">
              <span className="text-[#64748B]">npm</span>
              <code className="break-all rounded bg-white px-2 py-1 text-[#0F172A] border border-[#E5E7EB]">
                {envResult.npmPath ?? "未解析到"}
              </code>
            </div>
            {envResult.platform === "win32" && (
              <div className="grid grid-cols-[92px_1fr] gap-2">
                <span className="text-[#64748B]">Windows Shell</span>
                <code className="break-all rounded bg-white px-2 py-1 text-[#0F172A] border border-[#E5E7EB]">
                  {envResult.windowsShell ?? "auto"}
                </code>
              </div>
            )}
          </div>
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
