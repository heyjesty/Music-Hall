export interface User {
  id: number;
  username: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  profile_photo?: string | null;
  music_preferences?: string[];
  is_spotify_connected?: boolean;
}

export type Theme = 'SAD' | 'ROMANTIC' | 'ENERGETIC' | 'CALM' | 'PARTY';

export interface Room {
  id: number;
  name: string;
  theme: Theme;
  description: string;
  admin: number;
  admin_detail?: User;
  member_count: number;
  current_track_id: string | null;
  is_playing: boolean;
  timestamp_ms: number;
  created_at: string;
}

/** A track as returned by the Spotify search / mood endpoints. */
export interface SearchTrack {
  id: string;
  uri: string;
  title: string;
  artist: string;
  album_art: string | null;
  duration: number;
}

export interface QueueItem {
  playlistId: number;
  spotifyId: string | null;
  title: string;
  artist: string;
  albumArt: string | null;
  duration: number;
}

export interface ChatMessage {
  id?: number;
  content: string;
  user_id: number | null;
  user_name: string;
  timestamp?: string;
}

export const THEMES: { value: Theme; label: string; emoji: string }[] = [
  { value: 'CALM', label: 'Calm', emoji: '🌊' },
  { value: 'PARTY', label: 'Party', emoji: '🎉' },
  { value: 'ENERGETIC', label: 'Energetic', emoji: '⚡' },
  { value: 'ROMANTIC', label: 'Romantic', emoji: '💗' },
  { value: 'SAD', label: 'Melancholy', emoji: '🌧️' },
];

export const themeLabel = (theme: string) => THEMES.find((t) => t.value === theme)?.label ?? theme;

export function formatMs(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
