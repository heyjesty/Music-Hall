const trimSlash = (url: string) => url.replace(/\/+$/, '');

/** Base URL of the Django backend, e.g. https://music-hall-api.onrender.com */
export const BACKEND_URL = trimSlash(process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000');

export const API_URL = `${BACKEND_URL}/api/`;

/** WebSocket origin derived from the backend URL (http -> ws, https -> wss). */
export const WS_URL = trimSlash(process.env.NEXT_PUBLIC_WS_URL || BACKEND_URL.replace(/^http/, 'ws'));
