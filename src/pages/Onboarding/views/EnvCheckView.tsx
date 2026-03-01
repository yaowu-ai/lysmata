// src/pages/Onboarding/views/EnvCheckView.tsx
import { useEffect, useState } from "react";
import { apiClient } from "../../../shared/api-client";

interface EnvResult {
  canInstall: boolean;
  message: string;
  details?: { platform: string; hasHomebrew: boolean; hasCurl: boolean };
}

type ItemStatus = "checking" | "pass" | "warn" | "fail";

interface CheckItem {
  label: string;
  desc: string;
  status: ItemStatus;
  detail: string;
}

export function EnvCheckView() {
  const [items, setItems] = useState<CheckItem[]>([
    { label: "Node.js", desc: "版本要求 v18.0 或以上", status: "checking", detail: "检测中..." },
    { label: "系统权限", desc: "需要守护进程执行权限", status: "checking", detail: "检测中..." },
    {
      label: "网络连接",
      desc: "连接至 OpenClaw Registry",
      status: "checking",
      detail: "检测中...",
    },
  ]);

  useEffect(() => {
    apiClient
      .get<EnvResult>("/openclaw/check-environment")
      .then((res) => {
        setItems([
          {
            label: "Node.js",
            desc: "版本要求 v18.0 或以上",
            status: "pass",
            detail: "Node.js 环境就绪",
          },
          {
            label: "系统权限",
            desc: "需要守护进程执行权限",
            status: res.details?.platform === "darwin" ? "pass" : "warn",
            detail: res.details?.platform === "darwin" ? "权限通过" : "非 macOS 系统，部分功能受限",
          },
          {
            label: "网络连接",
            desc: "连接至 OpenClaw Registry",
            status: res.details?.hasCurl || res.details?.hasHomebrew ? "pass" : "fail",
            detail: res.details?.hasCurl ? "curl 可用" : "未检测到 curl，请安装后重试",
          },
        ]);
      })
      .catch(() => {
        setItems((prev) =>
          prev.map((i) => ({ ...i, status: "fail" as ItemStatus, detail: "API 连接失败" })),
        );
      });
  }, []);

  const statusStyle: Record<ItemStatus, { dot: string; text: string }> = {
    checking: { dot: "bg-[#F59E0B] animate-pulse", text: "text-[#F59E0B]" },
    pass: { dot: "bg-[#10B981]", text: "text-[#15803D]" },
    warn: { dot: "bg-[#F59E0B]", text: "text-[#D97706]" },
    fail: { dot: "bg-[#DC2626]", text: "text-[#DC2626]" },
  };

  return (
    <div>
      <h2 className="text-[20px] font-bold mb-1.5">环境检测</h2>
      <p className="text-sm text-[#64748B] mb-5">正在扫描运行 OpenClaw 必需的系统环境依赖...</p>

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
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dot}`} />
                {item.detail}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-5 px-4 py-3 bg-[#EFF6FF] rounded-lg border border-[#BFDBFE] text-[13px] text-[#1E40AF] leading-[1.5]">
        <strong className="font-semibold">提示：</strong>检测通过后，系统将使用一键脚本安装 OpenClaw
        Daemon 及 CLI 工具。安装过程中无需终端交互。
      </div>
    </div>
  );
}
