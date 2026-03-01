import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { API_BASE_URL } from "../../config";
import { useAppStore } from "../store/app-store";
import { botKeys } from "./useBots";

export function useGlobalStream() {
  const qc = useQueryClient();
  const storeRef = useRef(useAppStore.getState);

  useEffect(() => {
    const url = `${API_BASE_URL}/bots/global-stream`;
    const es = new EventSource(url);

    es.onmessage = (event) => {
      let data: {
        type: string;
        botId?: string;
        payload?: Record<string, unknown>;
        metadata?: Record<string, unknown>;
      };
      try {
        data = JSON.parse(event.data as string);
      } catch {
        return;
      }

      const {
        setPresence,
        setHealth,
        setLastHeartbeat,
        setShutdown,
        addNodeRequest,
        resolveNodeRequest,
        setBotStatus,
        addBotNodeRequest,
        resolveBotNodeRequest,
      } = storeRef.current();

      const { botId } = data;

      switch (data.type) {
        case "tick":
          break;

        case "system_presence":
          qc.invalidateQueries({ queryKey: botKeys.all });
          if (botId && data.metadata) {
            setBotStatus(botId, { presence: data.metadata });
          } else if (data.metadata) {
            setPresence(data.metadata);
          }
          break;

        case "presence":
          qc.invalidateQueries({ queryKey: botKeys.all });
          if (botId && data.payload) {
            setBotStatus(botId, { presence: data.payload });
          } else if (data.payload) {
            setPresence(data.payload);
          }
          break;

        case "health":
          if (botId && data.payload) {
            setBotStatus(botId, { health: data.payload as Parameters<typeof setHealth>[0] });
          } else if (data.payload) {
            setHealth(data.payload as Parameters<typeof setHealth>[0]);
          }
          break;

        case "heartbeat":
          if (botId && data.payload) {
            setBotStatus(botId, {
              lastHeartbeat: data.payload as Parameters<typeof setLastHeartbeat>[0],
            });
          } else if (data.payload) {
            setLastHeartbeat(data.payload as Parameters<typeof setLastHeartbeat>[0]);
          }
          break;

        case "shutdown":
          if (botId) {
            setBotStatus(botId, { isShutdown: true });
          } else {
            setShutdown(true);
          }
          qc.invalidateQueries();
          break;

        case "node_pair_requested":
          if (botId && data.payload) {
            addBotNodeRequest(botId, data.payload as Parameters<typeof addBotNodeRequest>[1]);
          } else if (data.payload) {
            addNodeRequest(data.payload as Parameters<typeof addNodeRequest>[0]);
          }
          break;

        case "node_pair_resolved":
          if (botId && data.payload?.nodeId) {
            resolveBotNodeRequest(botId, data.payload.nodeId as string);
          } else if (data.payload?.nodeId && data.payload?.status) {
            resolveNodeRequest(
              data.payload.nodeId as string,
              data.payload.status as "approved" | "rejected",
            );
          }
          break;

        case "cron":
          if (botId) {
            setBotStatus(botId, { lastCronAt: new Date().toISOString() });
          }
          qc.invalidateQueries({ queryKey: botKeys.all });
          break;

        default:
          break;
      }
    };

    es.onerror = () => {};

    return () => {
      es.close();
    };
  }, [qc]); // 只依赖 qc，EventSource 生命周期内只建立一次
}
