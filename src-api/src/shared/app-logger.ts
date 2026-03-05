/**
 * AppLogger — writes application-level events to lysmata.log (NDJSON format).
 *
 * Tail in real-time:
 *   tail -f ~/.lysmata/logs/lysmata.log | jq .
 */

import { appendFileSync, mkdirSync, existsSync } from "fs";
import { dirname } from "path";
import { LYSMATA_LOG_PATH } from "../config";

let logEnabled = false;

if (LYSMATA_LOG_PATH) {
  try {
    const dir = dirname(LYSMATA_LOG_PATH);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    logEnabled = true;
    appendFileSync(
      LYSMATA_LOG_PATH,
      JSON.stringify({ ts: new Date().toISOString(), level: "INFO", msg: "AppLogger initialised", logFile: LYSMATA_LOG_PATH }) + "\n",
    );
  } catch (err) {
    console.warn("[app-logger] Could not open log file, logging disabled:", err);
  }
}

function write(level: string, msg: string, extra?: Record<string, unknown>): void {
  if (!logEnabled) return;
  try {
    appendFileSync(
      LYSMATA_LOG_PATH,
      JSON.stringify({ ts: new Date().toISOString(), level, msg, ...extra }) + "\n",
    );
  } catch {
    // Silently ignore write errors
  }
}

export const AppLogger = {
  info(msg: string, extra?: Record<string, unknown>): void {
    write("INFO", msg, extra);
  },
  warn(msg: string, extra?: Record<string, unknown>): void {
    write("WARN", msg, extra);
  },
  error(msg: string, extra?: Record<string, unknown>): void {
    write("ERROR", msg, extra);
  },
};
