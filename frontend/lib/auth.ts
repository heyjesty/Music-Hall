const ACCESS_KEY = 'access_token';
const REFRESH_KEY = 'refresh_token';
export const AUTH_EVENT = 'musichall:auth-change';

const safeStorage = () => (typeof window !== 'undefined' ? window.localStorage : null);

export function getAccessToken(): string | null {
  try {
    return safeStorage()?.getItem(ACCESS_KEY) ?? null;
  } catch {
    return null;
  }
}

export function getRefreshToken(): string | null {
  try {
    return safeStorage()?.getItem(REFRESH_KEY) ?? null;
  } catch {
    return null;
  }
}

export function setTokens(access: string, refresh?: string) {
  const storage = safeStorage();
  if (!storage) return;
  storage.setItem(ACCESS_KEY, access);
  if (refresh) storage.setItem(REFRESH_KEY, refresh);
  window.dispatchEvent(new Event(AUTH_EVENT));
}

export function clearTokens() {
  const storage = safeStorage();
  if (!storage) return;
  storage.removeItem(ACCESS_KEY);
  storage.removeItem(REFRESH_KEY);
  window.dispatchEvent(new Event(AUTH_EVENT));
}

export function isLoggedIn() {
  return !!getAccessToken();
}

/** Only allow same-site relative redirects (prevents open redirects via ?next=). */
export function safeNext(next: string | null) {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
}
