import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { API_BASE_URL } from '../../config';
import { useAppStore } from '../store/app-store';
import { botKeys } from './useBots';

export function useGlobalStream() {
  const qc = useQueryClient();
  const setPresence = useAppStore((s) => s.setPresence);

  useEffect(() => {
    const url = `${API_BASE_URL}/bots/global-stream`;
    const es = new EventSource(url);

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'system_presence') {
          // If we receive system_presence, we might want to update the bot connection status or just general presence UI.
          // For now, we can invalidate bots query or set some global state
          qc.invalidateQueries({ queryKey: botKeys.all });
          
          if (setPresence) {
            setPresence(data.metadata);
          }
        }
      } catch (e) {
        console.error('Failed to parse global stream event', e);
      }
    };

    es.onerror = () => {
      // EventSource auto-reconnects
    };

    return () => {
      es.close();
    };
  }, [qc, setPresence]);
}