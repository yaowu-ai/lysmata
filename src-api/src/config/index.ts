import { join } from 'path';

// Port: read from env, fall back to 2026 (dev) / 2620 (prod)
export const PORT = Number(process.env.PORT) || (process.env.NODE_ENV === 'production' ? 2620 : 2026);

// DB file path: Tauri writes to the app data dir; in dev use a local file
export const DB_PATH =
  process.env.DB_PATH ?? join(import.meta.dir, '..', '..', '..', 'app.db');
