/* Minimal typings for the Spotify Web Playback SDK. */
export interface SpotifyTrack {
  id: string;
  uri: string;
  name: string;
  artists: { name: string }[];
  album: { images: { url: string }[] };
}

export interface SpotifyPlaybackState {
  paused: boolean;
  position: number;
  duration: number;
  loading?: boolean;
  track_window: { current_track: SpotifyTrack | null };
}

export interface SpotifyPlayer {
  connect(): Promise<boolean>;
  disconnect(): void;
  addListener(event: 'ready' | 'not_ready', cb: (payload: { device_id: string }) => void): void;
  addListener(event: 'player_state_changed', cb: (state: SpotifyPlaybackState | null) => void): void;
  addListener(
    event: 'initialization_error' | 'authentication_error' | 'account_error' | 'playback_error',
    cb: (error: { message: string }) => void,
  ): void;
  getCurrentState(): Promise<SpotifyPlaybackState | null>;
  setVolume(volume: number): Promise<void>;
  togglePlay(): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  seek(positionMs: number): Promise<void>;
  activateElement?(): Promise<void>;
}

declare global {
  interface Window {
    Spotify?: { Player: new (options: Record<string, unknown>) => SpotifyPlayer };
    onSpotifyWebPlaybackSDKReady?: () => void;
  }
}

let sdkPromise: Promise<void> | null = null;

export function loadSpotifySDK(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.Spotify) return Promise.resolve();
  sdkPromise ??= new Promise((resolve, reject) => {
    window.onSpotifyWebPlaybackSDKReady = () => resolve();
    const script = document.createElement('script');
    script.src = 'https://sdk.scdn.co/spotify-player.js';
    script.async = true;
    script.onerror = () => {
      sdkPromise = null;
      reject(new Error('Failed to load Spotify SDK'));
    };
    document.body.appendChild(script);
  });
  return sdkPromise;
}

interface PlayerCallbacks {
  onReady: (deviceId: string) => void;
  onNotReady: () => void;
  onStateChange: (state: SpotifyPlaybackState) => void;
  onError: (message: string) => void;
}

/**
 * Create and connect a Web Playback SDK player.
 * `getToken` is called by the SDK whenever it needs a (fresh) OAuth token.
 */
export function initializeSpotifyPlayer(
  getToken: () => Promise<string>,
  { onReady, onNotReady, onStateChange, onError }: PlayerCallbacks,
  volume = 0.5,
): SpotifyPlayer {
  const player = new window.Spotify!.Player({
    name: 'Music Hall',
    getOAuthToken: (cb: (token: string) => void) => {
      getToken().then(cb).catch(() => onError('Could not get a Spotify token. Try reconnecting Spotify.'));
    },
    volume,
  });

  player.addListener('ready', ({ device_id }) => onReady(device_id));
  player.addListener('not_ready', () => onNotReady());
  player.addListener('player_state_changed', (state) => state && onStateChange(state));
  player.addListener('initialization_error', ({ message }) => onError(message));
  player.addListener('authentication_error', () => onError('Spotify authentication failed. Please reconnect Spotify.'));
  player.addListener('account_error', () => onError('Spotify Premium is required for in-browser playback.'));
  player.addListener('playback_error', ({ message }) => onError(message));

  player.connect();
  return player;
}
