import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { API_URL } from './config';
import { clearTokens, getAccessToken, getRefreshToken, setTokens } from './auth';

const api = axios.create({ baseURL: API_URL, timeout: 15000 });

api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const refresh = getRefreshToken();
  if (!refresh) return null;
  try {
    const res = await axios.post(`${API_URL}auth/refresh/`, { refresh });
    setTokens(res.data.access, res.data.refresh);
    return res.data.access;
  } catch {
    clearTokens();
    return null;
  }
}

// On a 401, try once to refresh the access token and replay the request.
api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;
    if (error.response?.status !== 401 || !original || original._retry || original.url?.startsWith('auth/')) {
      return Promise.reject(error);
    }
    original._retry = true;
    refreshPromise ??= refreshAccessToken().finally(() => {
      refreshPromise = null;
    });
    const token = await refreshPromise;
    if (!token) return Promise.reject(error);
    original.headers.Authorization = `Bearer ${token}`;
    return api(original);
  },
);

/** Extract a human-readable message from a DRF error response. */
export function getErrorMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (!axios.isAxiosError(err)) return fallback;
  if (!err.response) return 'Cannot reach the server. Please check your connection.';
  const data = err.response.data as Record<string, unknown> | undefined;
  if (!data || typeof data !== 'object') return fallback;
  if (typeof data.detail === 'string') return data.detail;
  if (typeof data.error === 'string') return data.error;
  const first = Object.entries(data)[0];
  if (first) {
    const [field, value] = first;
    const msg = (Array.isArray(value) ? value : [value]).filter((v) => typeof v === 'string').join(' ');
    if (msg) {
      const label = field.charAt(0).toUpperCase() + field.slice(1).replace(/_/g, ' ');
      return field === 'non_field_errors' ? msg : `${label}: ${msg}`;
    }
  }
  return fallback;
}

export default api;
