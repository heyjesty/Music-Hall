import api from './api';

const RETURN_KEY = 'spotify_return_to';

/** Start the Spotify OAuth flow, remembering where to come back to. */
export async function connectSpotify(returnTo: string) {
  try {
    sessionStorage.setItem(RETURN_KEY, returnTo);
  } catch {
    // Storage unavailable: we'll fall back to the profile page.
  }
  const res = await api.get<{ url: string }>('spotify/login/');
  window.location.href = res.data.url;
}

export function getSpotifyReturnPath(): string {
  try {
    const path = sessionStorage.getItem(RETURN_KEY);
    if (path && path.startsWith('/') && !path.startsWith('//')) return path;
  } catch {
    // ignore
  }
  return '/profile';
}

export function clearSpotifyReturnPath() {
  try {
    sessionStorage.removeItem(RETURN_KEY);
  } catch {
    // ignore
  }
}
