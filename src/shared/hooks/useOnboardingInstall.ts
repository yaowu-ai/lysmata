// src/shared/hooks/useOnboardingInstall.ts
import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE_URL } from "../../config";

export interface InstallState {
  logs: string[];
  progress: number;
  statusLabel: string;
  isDone: boolean;
  isError: boolean;
  errorMsg: string;
}

const INITIAL_STATE: InstallState = {
  logs: [],
  progress: 0,
  statusLabel: "准备中...",
  isDone: false,
  isError: false,
  errorMsg: "",
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
        success?: boolean;
      };
      setState((prev) => ({
        logs: event.log ? [...prev.logs, event.log] : prev.logs,
        progress: event.progress ?? prev.progress,
        statusLabel:
          event.message ?? (event.step ? STEP_LABELS[event.step] : undefined) ?? prev.statusLabel,
        isDone: !!event.success,
        isError: !!event.error,
        errorMsg: event.error ?? prev.errorMsg,
      }));
      if (event.success || event.error) es.close();
    } catch {
      /* ignore parse errors */
    }
  };

  es.onerror = () => {
    setState((prev) => ({ ...prev, isError: true, errorMsg: "连接中断，请重试" }));
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
    setState(INITIAL_STATE);
    connectInstall(setState, esRef);
  }, []);

  return { ...state, retry };
}
