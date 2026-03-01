import { SSE } from "../config/constants";
import { PushRelay } from "../core/push-relay";

/**
 * 创建带自动心跳的 SSE 长连接 Response。
 * @param channelId  传给 PushRelay.registerClient 的频道 ID
 */
export function createPushSseResponse(channelId: string): Response {
  let cleanup: (() => void) | undefined;
  const stream = new ReadableStream<Uint8Array>({
    start(ctrl) {
      const enc = new TextEncoder();
      const heartbeat = setInterval(() => {
        try {
          ctrl.enqueue(enc.encode(SSE.HEARTBEAT_MESSAGE));
        } catch {
          /* stream closed */
        }
      }, SSE.HEARTBEAT_INTERVAL_MS);
      const innerCleanup = PushRelay.registerClient(channelId, ctrl);
      cleanup = () => {
        clearInterval(heartbeat);
        innerCleanup();
      };
    },
    cancel() {
      cleanup?.();
    },
  });
  return new Response(stream, { headers: SSE.HEADERS });
}
