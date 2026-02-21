import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { API_BASE_URL } from '../../config';
import { useAppStore } from '../store/app-store';
import { botKeys } from './useBots';

/**
 * Subscribe to the global SSE channel (/bots/global-stream) and dispatch
 * incoming Gateway events to the React Query cache and Zustand AppStore.
 *
 * Events that carry a `botId` are stored in `botStatuses[botId]` for
 * per-bot status pages. Events without a botId fall back to the global
 * top-level fields in the store.
 *
 * Handled event types:
 *   tick                — keep-alive pulse (ignored at UI level)
 *   system_presence     — legacy presence snapshot
 *   presence            — standard presence update
 *   health              — system health snapshot
 *   heartbeat           — agent/node heartbeat
 *   shutdown            — Gateway shutting down
 *   node_pair_requested — new pairing request
 *   node_pair_resolved  — pairing resolved
 *   cron                — scheduled job fired
 */
export function useGlobalStream() {
  const qc = useQueryClient();

  const setPresence         = useAppStore((s) => s.setPresence);
  const setHealth           = useAppStore((s) => s.setHealth);
  const setLastHeartbeat    = useAppStore((s) => s.setLastHeartbeat);
  const setShutdown         = useAppStore((s) => s.setShutdown);
  const addNodeRequest      = useAppStore((s) => s.addNodeRequest);
  const resolveNodeRequest  = useAppStore((s) => s.resolveNodeRequest);

  const setBotStatus        = useAppStore((s) => s.setBotStatus);
  const addBotNodeRequest   = useAppStore((s) => s.addBotNodeRequest);
  const resolveBotNodeRequest = useAppStore((s) => s.resolveBotNodeRequest);

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

      const { botId } = data;

      switch (data.type) {
        case 'tick':
          // Keep-alive pulse — no UI action needed
          break;

        case 'system_presence':
          // Legacy event name from older Gateway versions
          qc.invalidateQueries({ queryKey: botKeys.all });
          if (botId && data.metadata) {
            setBotStatus(botId, { presence: data.metadata });
          } else if (data.metadata) {
            setPresence(data.metadata);
          }
          break;

        case 'presence':
          qc.invalidateQueries({ queryKey: botKeys.all });
          if (botId && data.payload) {
            setBotStatus(botId, { presence: data.payload });
          } else if (data.payload) {
            setPresence(data.payload);
          }
          break;

        case 'health':
          if (botId && data.payload) {
            setBotStatus(botId, { health: data.payload as Parameters<typeof setHealth>[0] });
          } else if (data.payload) {
            setHealth(data.payload as Parameters<typeof setHealth>[0]);
          }
          break;

        case 'heartbeat':
          if (botId && data.payload) {
            setBotStatus(botId, { lastHeartbeat: data.payload as Parameters<typeof setLastHeartbeat>[0] });
          } else if (data.payload) {
            setLastHeartbeat(data.payload as Parameters<typeof setLastHeartbeat>[0]);
          }
          break;

        case 'shutdown':
          if (botId) {
            setBotStatus(botId, { isShutdown: true });
          } else {
            setShutdown(true);
          }
          qc.invalidateQueries();
          break;

        case 'node_pair_requested':
          if (botId && data.payload) {
            addBotNodeRequest(botId, data.payload as Parameters<typeof addBotNodeRequest>[1]);
          } else if (data.payload) {
            addNodeRequest(data.payload as Parameters<typeof addNodeRequest>[0]);
          }
          break;

        case 'node_pair_resolved':
          if (botId && data.payload?.nodeId) {
            resolveBotNodeRequest(botId, data.payload.nodeId as string);
          } else if (data.payload?.nodeId && data.payload?.status) {
            resolveNodeRequest(
              data.payload.nodeId as string,
              data.payload.status as 'approved' | 'rejected',
            );
          }
          break;

        case 'cron':
          if (botId) {
            setBotStatus(botId, { lastCronAt: new Date().toISOString() });
          }
          qc.invalidateQueries({ queryKey: botKeys.all });
          break;

        default:
          // Unknown event type — silently ignore to stay forward-compatible
          break;
      }
    };

    es.onerror = () => {
      // EventSource auto-reconnects; no manual action needed
    };

    return () => {
      es.close();
    };
  }, [
    qc,
    setPresence, setHealth, setLastHeartbeat, setShutdown,
    addNodeRequest, resolveNodeRequest,
    setBotStatus, addBotNodeRequest, resolveBotNodeRequest,
  ]);
}
