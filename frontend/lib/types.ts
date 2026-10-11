export interface User {
  id: number;
  username: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  profile_photo?: string | null;
  music_preferences?: string[];
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
  listener_count: number;
  now_playing: { title: string; artist: string; album_art: string | null } | null;
  is_playing: boolean;
  created_at: string;
}

export type TrackSource = 'audius' | 'itunes';

/** A track from search or suggestions (not yet in a room). */
export interface CatalogTrack {
  source: TrackSource;
  external_id: string;
  title: string;
  artist: string;
  duration: number;
  album_art: string | null;
  stream_url: string;
  is_preview: boolean;
}

/** A track inside a room (now playing or queued). */
export interface RoomTrack {
  id: number;
  source: TrackSource;
  title: string;
  artist: string;
  duration: number;
  album_art: string | null;
  stream_url: string;
  is_preview: boolean;
  added_by: string | null;
}

export interface QueueItem extends RoomTrack {
  item_id: number;
}

export interface RoomState {
  type: 'room_state';
  room_id: number;
  play_seq: number;
  is_playing: boolean;
  position_ms: number;
  current: RoomTrack | null;
  queue: QueueItem[];
}

export interface Listener {
  id: number;
  username: string;
}

export interface ChatMessage {
  id?: number;
  content: string;
  user_id: number | null;
  user_name: string;
  timestamp?: string;
}

export const THEMES: { value: Theme; label: string; emoji: string; genre: string }[] = [
  { value: 'CALM', label: 'Calm', emoji: '🌊', genre: 'Lo-fi' },
  { value: 'PARTY', label: 'Party', emoji: '🎉', genre: 'Electronic' },
  { value: 'ENERGETIC', label: 'Energetic', emoji: '⚡', genre: 'Hip-hop' },
  { value: 'ROMANTIC', label: 'Romantic', emoji: '💗', genre: 'R&B / Soul' },
  { value: 'SAD', label: 'Melancholy', emoji: '🌧️', genre: 'Acoustic' },
];

export const themeInfo = (theme: string) => THEMES.find((t) => t.value === theme) ?? THEMES[0];
export const themeLabel = (theme: string) => themeInfo(theme).label;

export function formatMs(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** Deterministic accent colour for a username (avatars). */
export function userColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return `hsl(${Math.abs(hash) % 360} 70% 60%)`;
}
