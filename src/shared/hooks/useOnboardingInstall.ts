// src/shared/hooks/useOnboardingInstall.ts
import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE_URL } from "../../config";
import { apiClient } from "../api-client";

export type InstallErrorKind = "network" | "permission" | "timeout" | "server_error" | "unknown";
export type InstallStage =
  | "idle"
  | "checking"
  | "preparing"
  | "installing"
  | "configuring"
  | "verifying"
  | "completed";

export interface InstallState {
  logs: string[];
  stage: InstallStage;
  statusLabel: string;
  summary: string;
  progress: number;
  isInstalling: boolean;
  isCompleted: boolean;
  isDone: boolean;
  isError: boolean;
  errorMsg: string;
  errorKind?: InstallErrorKind;
  platform?: string;
  waitingForPrivilege: boolean;
  canContinue: boolean;
  retryCount: number;
}

const INITIAL_STATE: InstallState = {
  logs: [],
  stage: "idle",
  statusLabel: "准备安装",
  summary: "将在当前页面完成检测、安装和验证。",
  progress: 0,
  isInstalling: false,
  isCompleted: false,
  isDone: false,
  isError: false,
  errorMsg: "",
  errorKind: undefined,
  platform: undefined,
  waitingForPrivilege: false,
  canContinue: false,
  retryCount: 0,
};

const STAGE_LABELS: Record<string, string> = {
  idle: "准备安装",
  checking: "检查系统环境...",
  preparing: "准备安装依赖...",
  installing: "正在安装 OpenClaw...",
  configuring: "配置 OpenClaw 服务...",
  verifying: "验证安装结果...",
  completed: "安装完成",
};

const STAGE_PROGRESS: Record<InstallStage, number> = {
  idle: 0,
  checking: 10,
  preparing: 25,
  installing: 60,
  configuring: 80,
  verifying: 92,
  completed: 100,
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
        stage?: InstallStage;
        message?: string;
        log?: string;
        summary?: string;
        error?: string;
        errorKind?: InstallErrorKind;
        platform?: string;
        waitingForPrivilege?: boolean;
        done?: boolean;
      };
      setState((prev) => ({
        ...prev,
        logs: event.log ? [...prev.logs, event.log] : prev.logs,
        stage: event.stage ?? prev.stage,
        progress: event.stage ? STAGE_PROGRESS[event.stage] : prev.progress,
        statusLabel:
          event.message ??
          (event.stage ? STAGE_LABELS[event.stage] : undefined) ??
          prev.statusLabel,
        summary: event.summary ?? prev.summary,
        isInstalling: !event.done && !event.error,
        isCompleted: !!event.done,
        isDone: !!event.done,
        isError: !!event.error,
        errorMsg: event.error ?? prev.errorMsg,
        errorKind: event.errorKind ?? prev.errorKind,
        platform: event.platform ?? prev.platform,
        waitingForPrivilege: event.waitingForPrivilege ?? false,
        canContinue: !!event.done,
      }));
      if (event.done || event.error) es.close();
    } catch {
      /* ignore parse errors */
    }
  };

  es.onerror = () => {
    setState((prev) => ({
      ...prev,
      progress: prev.progress,
      isInstalling: false,
      isDone: false,
      isError: true,
      errorMsg:
        "与本地服务的连接中断（sidecar 可能已停止）。请检查应用是否正常运行，然后点击重试。",
      errorKind: "unknown",
      summary: "安装连接已中断，请检查本地服务后重试。",
      waitingForPrivilege: false,
    }));
    es.close();
  };
}

export function useOnboardingInstall(run = false) {
  const [state, setState] = useState<InstallState>(INITIAL_STATE);
  const esRef = useRef<EventSource | null>(null);

  useEffect(
    () => () => {
      esRef.current?.close();
    },
    [],
  );

  const start = useCallback(() => {
    setState((prev) => ({
      ...INITIAL_STATE,
      retryCount: prev.retryCount,
      isInstalling: true,
      stage: "checking",
      progress: STAGE_PROGRESS.checking,
      statusLabel: STAGE_LABELS.checking,
      summary: "正在准备安装 OpenClaw。",
    }));
    connectInstall(setState, esRef);
  }, []);

  useEffect(() => {
    if (!run) return;
    start();
  }, [run, start]);

  const retry = useCallback(() => {
    setState((prev) => ({ ...prev, retryCount: prev.retryCount + 1 }));
    start();
  }, [start]);

  const reset = useCallback(() => {
    esRef.current?.close();
    esRef.current = null;
    setState(INITIAL_STATE);
  }, []);

  const cancel = useCallback(async () => {
    esRef.current?.close();
    esRef.current = null;
    try {
      await apiClient.post("/openclaw/cancel-install", {});
    } catch {
      /* best effort */
    }
    setState((prev) => ({
      ...prev,
      isInstalling: false,
      waitingForPrivilege: false,
      summary: "安装已取消。你可以重新开始安装。",
      statusLabel: "安装已取消",
    }));
  }, []);

  return { ...state, start, retry, cancel, reset };
}
