// src/shared/hooks/useOnboardingInstall.ts
import { useEffect, useRef, useState } from "react";
import { API_BASE_URL } from "../../config";

export interface InstallState {
  logs: string[];
  progress: number;
  statusLabel: string;
  isDone: boolean;
  isError: boolean;
  errorMsg: string;
}

export function useOnboardingInstall(run: boolean) {
  const [state, setState] = useState<InstallState>({
    logs: [],
    progress: 0,
    statusLabel: "准备中...",
    isDone: false,
    isError: false,
    errorMsg: "",
  });
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!run) return;
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
          statusLabel: event.message ?? prev.statusLabel,
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

    return () => {
      es.close();
    };
  }, [run]);

  return state;
}
