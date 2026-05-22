import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import { PORT } from "./config";
import health from "./app/api/health";
import bots from "./app/api/bots";
import conversations from "./app/api/conversations";
import messages from "./app/api/messages";
import { PushRelay } from "./core/push-relay";
import { BotService } from "./core/bot-service";
import { ApiError } from "./shared/errors";
import settings from "./app/api/settings";
import openclawInstall from "./app/api/openclaw-install";
import agents from "./app/api/agents";
import onboardingWorkspace from "./app/api/onboarding-workspace";
import { bootstrapAdapters, getAdapter } from "./core/adapters/registry";
import type { AgentEvent } from "./core/adapters/types";

const app = new Hono();

// Global middleware
app.use("*", logger());
app.use(
  "*",
  cors({
    origin: [
      "http://localhost:1420",
      "http://127.0.0.1:1420",
      "tauri://localhost",
      "http://tauri.localhost",
      "https://tauri.localhost",
    ],
  }),
);

// Routes
app.route("/health", health);
app.route("/bots", bots);
app.route("/conversations", conversations);
app.route("/conversations/:conversationId/messages", messages);
app.route("/settings", settings);
app.route("/openclaw", openclawInstall);
app.route("/agents", agents);
app.route("/onboarding", onboardingWorkspace);

// Global error handler
app.onError((err, c) => {
  if (err instanceof ApiError) {
    return c.json({ error: err.message }, err.statusCode as 400 | 404 | 500);
  }
  console.error("[sidecar] Unhandled error:", err);
  return c.json({ error: "Internal server error" }, 500);
});

// Bootstrap adapter registry — registers all built-in backend adapters
bootstrapAdapters();

// Wire push handlers for all active bots so bot-initiated messages are captured
// Also prewarm connections to reduce first-message latency
function wirePushHandlersAndPrewarm() {
  const allBots = BotService.findAll().filter((b) => b.is_active);
  for (const bot of allBots) {
    try {
      const adapter = getAdapter(bot.backend_type);
      if (adapter.setPushHandler) {
        adapter.setPushHandler(bot.backend_url, (event: AgentEvent) => {
          PushRelay.handlePush(event, bot.id);
        });
      }
      if (adapter.prewarmConnection) {
        adapter.prewarmConnection(bot.backend_url, bot.backend_token || undefined).catch(() => {});
      }
    } catch (err) {
      console.warn(`[sidecar] Failed to wire push handler for bot ${bot.id}:`, err);
    }
  }
}
wirePushHandlersAndPrewarm();

// Graceful shutdown
process.on("SIGTERM", () => {
  console.info("[sidecar] Received SIGTERM, shutting down...");
  process.exit(0);
});
process.on("SIGINT", () => {
  console.info("[sidecar] Received SIGINT, shutting down...");
  process.exit(0);
});

// Start server - this will be the main entry point when compiled
console.info(`[sidecar] Starting Hono API server...`);
console.info(`[sidecar] PORT: ${PORT}`);
console.info(`[sidecar] DB_PATH: ${process.env.DB_PATH || "not set"}`);
console.info(`[sidecar] CONFIG_DIR: ${process.env.CONFIG_DIR || "not set"}`);
console.info(`[sidecar] Platform: ${process.platform}`);
console.info(`[sidecar] Node version: ${process.version}`);

try {
  Bun.serve({
    port: PORT,
    hostname: "127.0.0.1",
    fetch: app.fetch,
    idleTimeout: 255,
  });

  console.info(`[sidecar] ✓ Hono API running on http://127.0.0.1:${PORT}`);
  console.info(`[sidecar] ✓ Server started successfully`);
} catch (error) {
  console.error(`[sidecar] ✗ Failed to start server:`, error);
  process.exit(1);
}

// Don't export default to prevent Bun from auto-starting the server
// export default app;
