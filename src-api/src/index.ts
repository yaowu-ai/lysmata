import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import { PORT } from "./config";
import health from "./app/api/health";
import bots from "./app/api/bots";
import conversations from "./app/api/conversations";
import messages from "./app/api/messages";
import { OpenClawProxy } from "./core/openclaw-proxy";
import { PushRelay } from "./core/push-relay";
import { BotService } from "./core/bot-service";
import { ApiError } from "./shared/errors";
import settings from "./app/api/settings";
import openclawInstall from "./app/api/openclaw-install";
import agents from "./app/api/agents";

const app = new Hono();

// Global middleware
app.use("*", logger());
app.use(
  "*",
  cors({ origin: ["http://localhost:1420", "http://127.0.0.1:1420", "tauri://localhost"] }),
);

// Routes
app.route("/health", health);
app.route("/bots", bots);
app.route("/conversations", conversations);
app.route("/conversations/:conversationId/messages", messages);
app.route("/settings", settings);
app.route("/openclaw", openclawInstall);
app.route("/agents", agents);

// Global error handler
app.onError((err, c) => {
  if (err instanceof ApiError) {
    return c.json({ error: err.message }, err.statusCode as 400 | 404 | 500);
  }
  console.error("[sidecar] Unhandled error:", err);
  return c.json({ error: "Internal server error" }, 500);
});

// Wire push handlers for all active WS bots so bot-initiated messages are captured
// Also prewarm WS connections to reduce first-message latency
function wirePushHandlersAndPrewarm() {
  const bots = BotService.findAll().filter((b) => b.openclaw_ws_url?.startsWith("ws"));
  for (const bot of bots) {
    OpenClawProxy.setPushHandler(bot.openclaw_ws_url, (event) => {
      PushRelay.handlePush(event, bot.id);
    });
    // Prewarm connection
    OpenClawProxy.prewarmConnection(bot.openclaw_ws_url, bot.openclaw_ws_token || undefined).catch(
      () => {},
    );
  }
}
wirePushHandlersAndPrewarm();

// Graceful shutdown
process.on("SIGTERM", () => {
  OpenClawProxy.closeAll();
  process.exit(0);
});
process.on("SIGINT", () => {
  OpenClawProxy.closeAll();
  process.exit(0);
});

Bun.serve({
  port: PORT,
  hostname: "127.0.0.1",
  fetch: app.fetch,
});

console.info(`[sidecar] Hono API running on http://127.0.0.1:${PORT}`);

export default app;
