// src/shared/hooks/useOnboardingInstall.ts
import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE_URL } from "../../config";
import { apiClient } from "../api-client";

export type InstallErrorKind = "network" | "permission" | "timeout" | "server_error" | "unknown";

export interface InstallState {
  logs: string[];
  progress: number;
  statusLabel: string;
  isDone: boolean;
  isError: boolean;
  errorMsg: string;
  errorKind?: InstallErrorKind;
  platform?: string;
  retryCount: number;
}

const INITIAL_STATE: InstallState = {
  logs: [],
  progress: 0,
  statusLabel: "准备中...",
  isDone: false,
  isError: false,
  errorMsg: "",
  errorKind: undefined,
  platform: undefined,
  retryCount: 0,
};

const STEP_LABELS: Record<string, string> = {
  checking: "检查系统环境...",
  installing: "正在安装 OpenClaw...",
  verifying: "验证安装结果...",
  success: "安装成功",
};

function connectInstall(
  setState: React.Dispatch<React.SetStateAction<InstallState>>,
  esRef: React.MutableRefObject<EventSource | null>,
) {
  esRef.current?.close();

  const es = new EventSource(`${API_BASE_URL}/openclaw/install`);
  esRef.current = es;

  es.onmessage = (e) => {
    try {
      const event = JSON.parse(e.data) as {
        step?: string;
        message?: string;
        progress?: number;
        log?: string;
        error?: string;
        errorKind?: InstallErrorKind;
        platform?: string;
        success?: boolean;
      };
      setState((prev) => ({
        ...prev,
        logs: event.log ? [...prev.logs, event.log] : prev.logs,
        progress: event.progress ?? prev.progress,
        statusLabel:
          event.message ?? (event.step ? STEP_LABELS[event.step] : undefined) ?? prev.statusLabel,
        isDone: !!event.success,
        isError: !!event.error,
        errorMsg: event.error ?? prev.errorMsg,
        errorKind: event.errorKind ?? prev.errorKind,
        platform: event.platform ?? prev.platform,
      }));
      if (event.success || event.error) es.close();
    } catch {
      /* ignore parse errors */
    }
  };

  es.onerror = () => {
    setState((prev) => ({
      ...prev,
      isError: true,
      errorMsg: "与本地服务的连接中断（sidecar 可能已停止）。请检查应用是否正常运行，然后点击重试。",
      errorKind: "unknown",
    }));
    es.close();
  };
}

export function useOnboardingInstall(run: boolean) {
  const [state, setState] = useState<InstallState>(INITIAL_STATE);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!run) return;
    connectInstall(setState, esRef);
    return () => {
      esRef.current?.close();
    };
  }, [run]);

  const retry = useCallback(() => {
    setState((prev) => ({
      ...INITIAL_STATE,
      retryCount: prev.retryCount + 1,
    }));
    connectInstall(setState, esRef);
  }, []);

  const cancel = useCallback(async () => {
    esRef.current?.close();
    esRef.current = null;
    try {
      await apiClient.post("/openclaw/cancel-install", {});
    } catch {
      /* best effort */
    }
  }, []);

  return { ...state, retry, cancel };
}
