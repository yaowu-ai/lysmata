import { useState } from "react";
import { Download, CheckCircle, XCircle, Loader2, Terminal } from "lucide-react";
import { API_BASE_URL } from "../../config";

type InstallStep = "idle" | "checking" | "downloading" | "installing" | "success" | "error";

interface InstallStatus {
  step: InstallStep;
  message: string;
  progress?: number;
  error?: string;
}

export function OpenClawInstallSection() {
  const [status, setStatus] = useState<InstallStatus>({ step: "idle", message: "" });
  const [logs, setLogs] = useState<string[]>([]);
  const [showLogs, setShowLogs] = useState(false);

  const addLog = (msg: string) => {
    setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  const handleInstall = async () => {
    try {
      setStatus({ step: "checking", message: "检查系统环境..." });
      setShowLogs(true);
      addLog("开始安装 OpenClaw");

      const checkRes = await fetch(`${API_BASE_URL}/openclaw/check-environment`);
      const checkData = await checkRes.json();

      if (!checkData.canInstall) {
        setStatus({
          step: "error",
          message: "系统环境不满足安装要求",
          error: checkData.message,
        });
        addLog(`错误: ${checkData.message}`);
        return;
      }

      addLog("环境检查通过");
      setStatus({ step: "downloading", message: "下载 OpenClaw...", progress: 0 });

      const installRes = await fetch(`${API_BASE_URL}/openclaw/install`, {
        method: "POST",
      });

      if (!installRes.ok) {
        const errorData = await installRes.json();
        throw new Error(errorData.message || "安装失败");
      }

      const reader = installRes.body?.getReader();
      if (!reader) throw new Error("无法读取安装流");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim() || line.startsWith(":")) continue;

          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));

              if (data.step) {
                setStatus({
                  step: data.step,
                  message: data.message,
                  progress: data.progress,
                });
              }

              if (data.log) {
                addLog(data.log);
              }

              if (data.error) {
                setStatus({
                  step: "error",
                  message: "安装失败",
                  error: data.error,
                });
                addLog(`错误: ${data.error}`);
                return;
              }

              if (data.success) {
                setStatus({
                  step: "success",
                  message: "OpenClaw 安装成功！",
                });
                addLog("安装完成");
              }
            } catch (e) {
              console.error("解析安装事件失败:", e);
            }
          }
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setStatus({ step: "error", message: "安装失败", error: message });
      addLog(`错误: ${message}`);
    }
  };

  const getStepIcon = () => {
    switch (status.step) {
      case "idle":
        return <Download className="text-[#2563EB]" size={20} />;
      case "checking":
      case "downloading":
      case "installing":
        return <Loader2 className="text-[#2563EB] animate-spin" size={20} />;
      case "success":
        return <CheckCircle className="text-green-500" size={20} />;
      case "error":
        return <XCircle className="text-red-500" size={20} />;
    }
  };

  const isInstalling = ["checking", "downloading", "installing"].includes(status.step);

  return (
    <section className="mt-8">
      <h2 className="text-xs font-medium text-[#64748B] uppercase tracking-wide mb-3">
        OpenClaw 安装
      </h2>

      <div className="rounded-lg border border-[#E5E7EB] bg-white shadow-sm p-4">
        <div className="flex items-start gap-3 mb-4">
          <div className="flex-shrink-0 mt-0.5">{getStepIcon()}</div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-medium text-[#0F172A] mb-1">
              {status.step === "idle" ? "OpenClaw 一键安装" : status.message}
            </h3>
            {status.step === "idle" && (
              <p className="text-xs text-[#64748B] mb-3">自动下载并配置 OpenClaw Gateway 服务</p>
            )}
            {status.error && (
              <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                {status.error}
              </div>
            )}
            {status.progress !== undefined && (
              <div className="mt-2">
                <div className="w-full bg-[#F1F5F9] rounded-full h-1.5">
                  <div
                    className="bg-[#2563EB] h-1.5 rounded-full transition-all"
                    style={{ width: `${status.progress}%` }}
                  />
                </div>
                <p className="text-xs text-[#64748B] mt-1">{status.progress}%</p>
              </div>
            )}
            {status.step === "success" && (
              <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded text-xs text-green-700">
                安装成功！重启终端后运行{" "}
                <code className="bg-green-100 px-1 rounded">openclaw --version</code> 验证
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleInstall}
            disabled={isInstalling || status.step === "success"}
            className="px-3 py-1.5 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:bg-[#94A3B8] text-white rounded text-xs font-medium"
          >
            {isInstalling ? "安装中..." : status.step === "success" ? "已安装" : "开始安装"}
          </button>
          {logs.length > 0 && (
            <button
              onClick={() => setShowLogs(!showLogs)}
              className="px-3 py-1.5 border border-[#E5E7EB] hover:bg-[#F1F5F9] text-[#64748B] rounded text-xs font-medium"
            >
              {showLogs ? "隐藏" : "显示"}日志
            </button>
          )}
        </div>

        {showLogs && logs.length > 0 && (
          <div className="mt-3 bg-[#0F172A] rounded p-3">
            <div className="flex items-center gap-2 mb-2">
              <Terminal size={12} className="text-[#94A3B8]" />
              <span className="text-xs font-medium text-white">安装日志</span>
            </div>
            <div className="font-mono text-xs text-[#94A3B8] space-y-0.5 max-h-40 overflow-y-auto">
              {logs.map((log, i) => (
                <div key={i}>{log}</div>
              ))}
            </div>
          </div>
        )}

        <details className="mt-3">
          <summary className="text-xs text-[#64748B] cursor-pointer hover:text-[#0F172A]">
            手动安装说明
          </summary>
          <div className="mt-2 space-y-2">
            <div>
              <p className="text-xs text-[#64748B] mb-1">使用 Homebrew：</p>
              <pre className="bg-[#0F172A] text-[#94A3B8] p-2 rounded text-xs font-mono overflow-x-auto">
                brew tap openclaw/tap brew install openclaw
              </pre>
            </div>
            <div>
              <p className="text-xs text-[#64748B] mb-1">验证安装：</p>
              <pre className="bg-[#0F172A] text-[#94A3B8] p-2 rounded text-xs font-mono overflow-x-auto">
                openclaw --version
              </pre>
            </div>
          </div>
        </details>
      </div>
    </section>
  );
}
