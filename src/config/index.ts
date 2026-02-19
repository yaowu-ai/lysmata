export const API_PORT = import.meta.env.PROD ? 2620 : 2026;
export const API_BASE_URL = `http://127.0.0.1:${API_PORT}`;
export const WS_BASE_URL = `ws://127.0.0.1:${API_PORT}`;
