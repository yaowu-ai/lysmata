import { useState, useEffect } from "react";
import { useGatewaySettings, useUpdateGatewaySettings } from "../../shared/hooks/useGatewaySettings";
import { useToast } from "../../components/Toast";
import { apiClient } from "../../shared/api-client";

export function GatewayConfigSection() {
  const { data: settings } = useGatewaySettings();
  const updateMut = useUpdateGatewaySettings();
  const toast = useToast();

  const [form, setForm] = useState({
    port: 18789,
    bind: "loopback" as "loopback" | "lan",
    authMode: "token" as "none" | "token",
    authToken: "",
  });

  const [hasChanges, setHasChanges] = useState(false);

  // 初始化表单数据
  useEffect(() => {
    if (settings) {
      setForm({
        port: settings.port,
        bind: settings.bind,
        authMode: settings.authMode,
        authToken: settings.authToken || "",
      });
    }
  }, [settings]);

  // 监听表单变化
  useEffect(() => {
    if (!settings) {
      setHasChanges(false);
      return;
    }
    const changed =
      form.port !== settings.port ||
      form.bind !== settings.bind ||
      form.authMode !== settings.authMode ||
      form.authToken !== (settings.authToken || "");
    setHasChanges(changed);
  }, [form, settings]);

  function handleSave() {
    updateMut.mutate(form, {
      onSuccess: () => {
        toast.success("配置已保存");
        toast.info("需要重启 Gateway 才能生效");
        setHasChanges(false);
      },
      onError: () => toast.error("保存失败"),
    });
  }

  function handleRestart() {
    apiClient
      .post("/settings/gateway-restart", {})
      .then(() => toast.success("Gateway 重启中..."))
      .catch(() => toast.error("重启失败"));
  }

  return (
    <section className="bg-white border border-[#E5E7EB] rounded-xl p-6 mb-5">
      <h2 className="text-[17px] font-semibold mb-4">Gateway 配置</h2>
      <p className="text-[13px] text-[#64748B] mb-4">
        修改 OpenClaw Gateway 的端口、认证模式等参数
      </p>

      {/* 端口输入框 */}
      <div className="mb-4">
        <label className="block text-[13px] font-medium mb-2 text-[#0F172A]">端口</label>
        <input
          type="number"
          value={form.port}
          onChange={(e) => setForm({ ...form, port: parseInt(e.target.value) || 18789 })}
          className="w-full px-3 py-2 text-[14px] border border-[#E5E7EB] rounded-lg bg-white focus:outline-none focus:border-[#2563EB] transition-colors"
        />
      </div>

      {/* 绑定地址下拉框 */}
      <div className="mb-4">
        <label className="block text-[13px] font-medium mb-2 text-[#0F172A]">绑定地址</label>
        <select
          value={form.bind}
          onChange={(e) => setForm({ ...form, bind: e.target.value as "loopback" | "lan" })}
          className="w-full px-3 py-2 text-[14px] border border-[#E5E7EB] rounded-lg bg-white cursor-pointer focus:outline-none focus:border-[#2563EB] transition-colors"
        >
          <option value="loopback">loopback (127.0.0.1)</option>
          <option value="lan">lan (0.0.0.0)</option>
        </select>
      </div>

      {/* 认证模式下拉框 */}
      <div className="mb-4">
        <label className="block text-[13px] font-medium mb-2 text-[#0F172A]">认证模式</label>
        <select
          value={form.authMode}
          onChange={(e) => setForm({ ...form, authMode: e.target.value as "none" | "token" })}
          className="w-full px-3 py-2 text-[14px] border border-[#E5E7EB] rounded-lg bg-white cursor-pointer focus:outline-none focus:border-[#2563EB] transition-colors"
        >
          <option value="token">Token</option>
          <option value="none">无认证</option>
        </select>
      </div>

      {/* 认证 Token 输入框（仅在 authMode === "token" 时显示）*/}
      {form.authMode === "token" && (
        <div className="mb-4">
          <label className="block text-[13px] font-medium mb-2 text-[#0F172A]">认证 Token</label>
          <input
            type="text"
            value={form.authToken}
            onChange={(e) => setForm({ ...form, authToken: e.target.value })}
            className="w-full px-3 py-2 text-[14px] border border-[#E5E7EB] rounded-lg bg-white focus:outline-none focus:border-[#2563EB] transition-colors"
          />
        </div>
      )}

      {/* 按钮组 */}
      <div className="flex gap-3">
        <button
          onClick={handleSave}
          disabled={!hasChanges || updateMut.isPending}
          className="px-4 py-2 rounded-lg bg-[#2563EB] text-white text-[14px] font-medium hover:bg-[#1D4ED8] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          保存配置
        </button>
        <button
          onClick={handleRestart}
          className="px-3 py-2 rounded-lg text-[14px] text-[#64748B] hover:bg-[#F8FAFC] transition-colors"
        >
          重启 Gateway
        </button>
      </div>
    </section>
  );
}
