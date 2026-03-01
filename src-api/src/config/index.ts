import { join } from "path";

// Port: read from env, fall back to 2026 (dev) / 2620 (prod)
export const PORT =
  Number(process.env.PORT) || (process.env.NODE_ENV === "production" ? 2620 : 2026);

// DB file path: Tauri writes to the app data dir; in dev use a local file
export const DB_PATH = process.env.DB_PATH ?? join(import.meta.dir, "..", "..", "..", "app.db");

// Config dir path
export const CONFIG_DIR =
  process.env.CONFIG_DIR ?? join(import.meta.dir, "..", "..", "..", "config");

// Gateway communication log file — set GATEWAY_LOG_PATH='' to disable logging
export const GATEWAY_LOG_PATH =
  process.env.GATEWAY_LOG_PATH ?? join(import.meta.dir, "..", "..", "..", "logs", "gateway.log");
