"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import axios from 'axios';
import {
  Send, Users, Play, Pause, SkipForward, Music, Search, Plus, Volume2, Disc, ArrowUp, Trash2, Loader2,
  Crown, Wifi, WifiOff, X,
} from 'lucide-react';
import api, { getErrorMessage } from '@/lib/api';
import { getAccessToken, isLoggedIn } from '@/lib/auth';
import { WS_URL } from '@/lib/config';
import {
  initializeSpotifyPlayer, loadSpotifySDK, type SpotifyPlaybackState, type SpotifyPlayer,
} from '@/lib/spotify';
import { connectSpotify } from '@/lib/spotifyConnect';
import {
  formatMs, themeLabel, type ChatMessage, type QueueItem, type Room, type SearchTrack, type User,
} from '@/lib/types';

type ConnectionStatus = 'connecting' | 'open' | 'closed';

interface NowPlaying {
  spotifyId: string | null;
  title: string;
  artist: string;
  albumArt: string | null;
  duration: number;
  position: number;
  isPlaying: boolean;
}

interface PlaylistResponse {
  id: number;
  track_detail: { spotify_id: string | null; title: string; artist: string; album_art: string | null; duration: number };
}

interface SyncMessage {
  track_id: string | null;
  timestamp_ms: number;
  is_playing: boolean;
  track?: { title: string; artist: string; album_art: string | null; duration: number } | null;
}

type SocketEvent =
  | ({ type: 'chat_message' } & ChatMessage)
  | ({ type: 'playback_sync' } & SyncMessage)
  | { type: 'queue_update' }
  | { type: 'presence'; status: 'joining' | 'leaving'; user_id: number | null; user_name: string };

const SYNC_DRIFT_MS = 3000;
const HEARTBEAT_MS = 5000;
const QUEUE_POLL_MS = 15000;

const toQueueItem = (p: PlaylistResponse): QueueItem => ({
  playlistId: p.id,
  spotifyId: p.track_detail.spotify_id,
  title: p.track_detail.title,
  artist: p.track_detail.artist,
  albumArt: p.track_detail.album_art,
  duration: p.track_detail.duration,
});

const nowPlayingFromState = (state: SpotifyPlaybackState): NowPlaying | null => {
  const track = state.track_window.current_track;
  if (!track) return null;
  return {
    spotifyId: track.id,
    title: track.name,
    artist: track.artists.map((a) => a.name).join(', '),
    albumArt: track.album.images[0]?.url ?? null,
    duration: state.duration,
    position: state.position,
    isPlaying: !state.paused,
  };
};

export default function RoomPage() {
  const params = useParams<{ id: string }>();
  const roomId = Number(params.id);
  const router = useRouter();

  const [room, setRoom] = useState<Room | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchTrack[]>([]);
  const [searching, setSearching] = useState(false);
  const [moodTracks, setMoodTracks] = useState<SearchTrack[]>([]);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [playerError, setPlayerError] = useState('');
  const [nowPlaying, setNowPlaying] = useState<NowPlaying | null>(null);
  const [volume, setVolume] = useState(50);
  const [connection, setConnection] = useState<ConnectionStatus>('connecting');
  const [toast, setToast] = useState('');

  // Refs mirror state for use inside long-lived callbacks (WebSocket, SDK listeners).
  const wsRef = useRef<WebSocket | null>(null);
  const playerRef = useRef<SpotifyPlayer | null>(null);
  const deviceIdRef = useRef<string | null>(null);
  const roomRef = useRef<Room | null>(null);
  const userRef = useRef<User | null>(null);
  const queueRef = useRef<QueueItem[]>([]);
  const pendingSyncRef = useRef<SyncMessage | null>(null);
  const lastSentRef = useRef<{ trackId: string | null; playing: boolean } | null>(null);
  const wasPlayingRef = useRef(false);
  const advancingRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const isAdmin = !!room && !!currentUser && room.admin === currentUser.id;
  const isAdminRef = useRef(false);
  isAdminRef.current = isAdmin;
  roomRef.current = room;
  userRef.current = currentUser;
  queueRef.current = queue;

  const showToast = useCallback((message: string) => {
    setToast(message);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  const fetchQueue = useCallback(async () => {
    try {
      const res = await api.get<PlaylistResponse[]>(`playlists/?room=${roomId}`);
      setQueue(res.data.map(toQueueItem));
    } catch {
      // Silent: polling will retry.
    }
  }, [roomId]);

  // ---------- Playback helpers ----------

  const playOnDevice = useCallback(async (
    spotifyId: string,
    meta?: { title?: string; artist?: string; album_art?: string | null; duration?: number },
    positionMs = 0,
  ) => {
    const device = deviceIdRef.current;
    if (!device) return false;
    try {
      await playerRef.current?.activateElement?.();
      await api.post('spotify/play/', {
        track_id: spotifyId, device_id: device, room: roomId, position_ms: Math.round(positionMs), ...meta,
      });
      return true;
    } catch (err) {
      showToast(getErrorMessage(err, 'Playback failed.'));
      return false;
    }
  }, [roomId, showToast]);

  /** Follower: bring local playback in line with the host. */
  const applySync = useCallback(async (sync: SyncMessage) => {
    if (sync.track) {
      setNowPlaying({
        spotifyId: sync.track_id,
        title: sync.track.title,
        artist: sync.track.artist,
        albumArt: sync.track.album_art,
        duration: sync.track.duration,
        position: sync.timestamp_ms,
        isPlaying: sync.is_playing,
      });
    }

    const player = playerRef.current;
    if (!player || !deviceIdRef.current) {
      pendingSyncRef.current = sync;
      return;
    }
    if (!sync.track_id) return;

    const state = await player.getCurrentState();
    const localId = state?.track_window.current_track?.id;
    if (!state || localId !== sync.track_id) {
      if (sync.is_playing) await playOnDevice(sync.track_id, undefined, sync.timestamp_ms);
      return;
    }
    if (Math.abs(state.position - sync.timestamp_ms) > SYNC_DRIFT_MS) await player.seek(sync.timestamp_ms);
    if (state.paused && sync.is_playing) await player.resume();
    if (!state.paused && !sync.is_playing) await player.pause();
  }, [playOnDevice]);

  /** Host: broadcast the current playback state to listeners. */
  const broadcastState = useCallback((state: SpotifyPlaybackState) => {
    const ws = wsRef.current;
    const track = state.track_window.current_track;
    if (!ws || ws.readyState !== WebSocket.OPEN || !isAdminRef.current || !track) return;
    lastSentRef.current = { trackId: track.id, playing: !state.paused };
    ws.send(JSON.stringify({
      type: 'playback_sync',
      track_id: track.id,
      timestamp_ms: state.position,
      is_playing: !state.paused,
      track: {
        title: track.name,
        artist: track.artists.map((a) => a.name).join(', '),
        album_art: track.album.images[0]?.url ?? null,
        duration: state.duration,
      },
    }));
  }, []);

  const playNextInQueue = useCallback(async () => {
    if (advancingRef.current) return;
    const next = queueRef.current.find((item) => item.spotifyId);
    if (!next?.spotifyId) return;
    advancingRef.current = true;
    try {
      const ok = await playOnDevice(next.spotifyId, {
        title: next.title, artist: next.artist, album_art: next.albumArt, duration: next.duration,
      });
      if (ok) {
        setQueue((prev) => prev.filter((q) => q.playlistId !== next.playlistId));
        await api.delete(`playlists/${next.playlistId}/`).catch(() => undefined);
      }
    } finally {
      setTimeout(() => { advancingRef.current = false; }, 1500);
    }
  }, [playOnDevice]);

  const handlePlayerState = useCallback((state: SpotifyPlaybackState) => {
    setNowPlaying(nowPlayingFromState(state));
    if (!isAdminRef.current) return;

    const trackId = state.track_window.current_track?.id ?? null;
    const last = lastSentRef.current;
    if (!last || last.trackId !== trackId || last.playing !== !state.paused) broadcastState(state);

    // Track finished: SDK reports paused at position 0 right after playing.
    const ended = state.paused && state.position === 0 && wasPlayingRef.current && !state.loading;
    wasPlayingRef.current = !state.paused;
    if (ended) playNextInQueue();
  }, [broadcastState, playNextInQueue]);

  // ---------- Initial load, WebSocket, Spotify player ----------

  useEffect(() => {
    if (!Number.isFinite(roomId)) {
      setNotFound(true);
      return;
    }
    if (!isLoggedIn()) {
      router.replace(`/login?next=/rooms/${roomId}`);
      return;
    }

    let disposed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let reconnectDelay = 1000;

    const connectSocket = () => {
      if (disposed) return;
      setConnection('connecting');
      const token = getAccessToken();
      const socket = new WebSocket(`${WS_URL}/ws/room/${roomId}/${token ? `?token=${encodeURIComponent(token)}` : ''}`);
      wsRef.current = socket;

      socket.onopen = () => {
        reconnectDelay = 1000;
        setConnection('open');
        lastSentRef.current = null; // re-announce state after reconnecting
      };
      socket.onmessage = (event) => {
        let data: SocketEvent;
        try {
          data = JSON.parse(event.data);
        } catch {
          return;
        }
        if (data.type === 'chat_message') {
          setMessages((prev) => (data.id && prev.some((m) => m.id === data.id) ? prev : [...prev, data]));
        } else if (data.type === 'queue_update') {
          fetchQueue();
        } else if (data.type === 'playback_sync' && !isAdminRef.current) {
          applySync(data);
        } else if (data.type === 'presence' && data.status === 'joining' && isAdminRef.current) {
          // Bring the newcomer up to speed.
          lastSentRef.current = null;
          playerRef.current?.getCurrentState().then((s) => s && broadcastState(s));
        }
      };
      socket.onclose = (event) => {
        if (wsRef.current === socket) wsRef.current = null;
        if (disposed) return;
        setConnection('closed');
        if (event.code === 4004) return; // room does not exist
        reconnectTimer = setTimeout(connectSocket, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 2, 15000);
      };
    };

    const setupPlayer = async () => {
      try {
        await loadSpotifySDK();
      } catch {
        setPlayerError('Could not load the Spotify player.');
        return;
      }
      if (disposed) return;
      playerRef.current = initializeSpotifyPlayer(
        async () => (await api.get<{ access_token: string }>('spotify/refresh/')).data.access_token,
        {
          onReady: (id) => {
            deviceIdRef.current = id;
            setDeviceId(id);
            setPlayerError('');
            const pending = pendingSyncRef.current;
            pendingSyncRef.current = null;
            if (pending && !isAdminRef.current) applySync(pending);
          },
          onNotReady: () => {
            deviceIdRef.current = null;
            setDeviceId(null);
          },
          onStateChange: handlePlayerState,
          onError: setPlayerError,
        },
        volume / 100,
      );
    };

    const init = async () => {
      try {
        const [userRes, roomRes] = await Promise.all([
          api.get<User>('users/me/'),
          api.get<Room>(`rooms/${roomId}/`),
        ]);
        if (disposed) return;
        setCurrentUser(userRes.data);
        setRoom(roomRes.data);

        const r = roomRes.data;
        if (r.current_track_id && r.admin !== userRes.data.id) {
          // Remember where the host was; applied once our player is ready.
          pendingSyncRef.current = { track_id: r.current_track_id, timestamp_ms: r.timestamp_ms, is_playing: r.is_playing };
        }

        connectSocket();
        api.post(`rooms/${roomId}/join/`).catch(() => undefined);

        const [msgRes, moodRes] = await Promise.all([
          api.get<ChatMessage[]>(`messages/?room=${roomId}`),
          api.get<SearchTrack[]>(`spotify/mood-tracks/?mood=${r.theme.toLowerCase()}`).catch(() => ({ data: [] as SearchTrack[] })),
          fetchQueue(),
        ]);
        if (disposed) return;
        setMessages(msgRes.data);
        setMoodTracks(moodRes.data);

        if (userRes.data.is_spotify_connected) setupPlayer();
      } catch (err) {
        const status = axios.isAxiosError(err) ? err.response?.status : undefined;
        if (status === 404) setNotFound(true);
        else if (status === 401) router.replace(`/login?next=/rooms/${roomId}`);
        else showToast(getErrorMessage(err, 'Failed to load the room.'));
      }
    };

    init();
    const queueInterval = setInterval(fetchQueue, QUEUE_POLL_MS);

    return () => {
      disposed = true;
      clearInterval(queueInterval);
      clearTimeout(reconnectTimer);
      wsRef.current?.close();
      wsRef.current = null;
      playerRef.current?.disconnect();
      playerRef.current = null;
      deviceIdRef.current = null;
    };
    // Run once per room; callbacks read live values via refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  // Host heartbeat so listeners can correct drift.
  useEffect(() => {
    if (!isAdmin || !deviceId) return;
    const interval = setInterval(async () => {
      const state = await playerRef.current?.getCurrentState();
      if (state && !state.paused) broadcastState(state);
    }, HEARTBEAT_MS);
    return () => clearInterval(interval);
  }, [isAdmin, deviceId, broadcastState]);

  // Advance the progress bar locally between SDK events.
  useEffect(() => {
    if (!nowPlaying?.isPlaying) return;
    const interval = setInterval(() => {
      setNowPlaying((np) => (np && np.isPlaying ? { ...np, position: Math.min(np.position + 1000, np.duration) } : np));
    }, 1000);
    return () => clearInterval(interval);
  }, [nowPlaying?.isPlaying]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages]);

  // ---------- UI actions ----------

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;
    setSearching(true);
    try {
      const res = await api.get<SearchTrack[]>('spotify/search/', { params: { q } });
      setSearchResults(res.data);
    } catch (err) {
      showToast(getErrorMessage(err, 'Search failed.'));
    } finally {
      setSearching(false);
    }
  };

  const addToQueue = async (track: SearchTrack) => {
    try {
      await api.post('playlists/', {
        room: roomId, track_id: track.id, title: track.title, artist: track.artist,
        duration: track.duration, album_art: track.album_art,
      });
      await fetchQueue();
      showToast(`Added “${track.title}” to the queue`);
    } catch (err) {
      showToast(getErrorMessage(err, 'Could not add to queue.'));
    }
  };

  const playNow = async (track: SearchTrack) => {
    if (!deviceId) {
      showToast('Your Spotify player is not ready yet.');
      return;
    }
    await playOnDevice(track.id, {
      title: track.title, artist: track.artist, album_art: track.album_art, duration: track.duration,
    });
  };

  const moveToTop = async (item: QueueItem) => {
    try {
      await api.post(`playlists/${item.playlistId}/move_to_top/`);
      await fetchQueue();
    } catch (err) {
      showToast(getErrorMessage(err, 'Could not reorder the queue.'));
    }
  };

  const removeFromQueue = async (item: QueueItem) => {
    setQueue((prev) => prev.filter((q) => q.playlistId !== item.playlistId));
    try {
      await api.delete(`playlists/${item.playlistId}/`);
    } catch (err) {
      showToast(getErrorMessage(err, 'Could not remove the track.'));
      fetchQueue();
    }
  };

  const togglePlayback = async () => {
    const player = playerRef.current;
    if (!player) return;
    await player.activateElement?.();
    if (!nowPlaying?.spotifyId && queue.length) {
      playNextInQueue();
      return;
    }
    player.togglePlay();
  };

  const updateVolume = (value: number) => {
    setVolume(value);
    playerRef.current?.setVolume(value / 100);
  };

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    const content = newMessage.trim();
    const ws = wsRef.current;
    if (!content || !ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'chat_message', content }));
    setNewMessage('');
  };

  const handleConnectSpotify = async () => {
    try {
      await connectSpotify(`/rooms/${roomId}`);
    } catch (err) {
      showToast(getErrorMessage(err, 'Could not start Spotify sign-in.'));
    }
  };

  // ---------- Render ----------

  if (notFound) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <Disc size={48} className="text-gray-600 mb-4" />
        <h1 className="text-2xl font-bold mb-2">Room not found</h1>
        <p className="text-gray-400 mb-6">It may have been closed by its host.</p>
        <Link href="/" className="btn-primary">Browse rooms</Link>
      </div>
    );
  }

  if (!room || !currentUser) {
    return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 size={40} className="animate-spin text-accent" /></div>;
  }

  const canControl = isAdmin && !!deviceId;
  const showDiscovery = !searchQuery && searchResults.length === 0;
  const tracksToShow = showDiscovery ? moodTracks : searchResults;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[20rem_minmax(0,1fr)] gap-6">
      {/* Sidebar */}
      <aside className="flex flex-col gap-6 order-2 lg:order-1 min-w-0">
        {!currentUser.is_spotify_connected && (
          <div className="glass-card p-6 rounded-3xl bg-gradient-to-br from-spotify/15 to-transparent !border-spotify/30">
            <h3 className="text-sm font-bold text-spotify mb-2 uppercase tracking-widest">Listen along</h3>
            <p className="text-xs text-gray-400 mb-4">Connect Spotify Premium to hear the room in sync. You can still chat and add songs without it.</p>
            <button onClick={handleConnectSpotify}
              className="w-full bg-spotify hover:bg-[#1ed760] text-black font-bold py-3 rounded-full flex items-center justify-center gap-2 transition-colors">
              <Music size={16} /> Connect Spotify
            </button>
          </div>
        )}

        <section className="glass-card flex flex-col rounded-3xl h-[28rem]">
          <div className="p-4 border-b border-white/5">
            <form onSubmit={handleSearch} className="relative">
              <input type="search" className="input !py-2.5 !pr-10 text-sm" placeholder="Search songs or artists"
                value={searchQuery} aria-label="Search Spotify"
                onChange={(e) => { setSearchQuery(e.target.value); if (!e.target.value) setSearchResults([]); }} />
              <button type="submit" className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white" aria-label="Search">
                {searching ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
              </button>
            </form>
          </div>
          <div className="flex-1 overflow-y-auto p-3 custom-scrollbar">
            <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 px-2">
              {showDiscovery ? `${themeLabel(room.theme)} picks` : 'Results'}
            </h3>
            {tracksToShow.length === 0 && !searching && (
              <p className="text-xs text-gray-500 px-2 py-4">{showDiscovery ? 'No suggestions right now.' : 'No tracks found.'}</p>
            )}
            <ul className="space-y-1">
              {tracksToShow.map((track) => (
                <li key={track.id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 transition-colors group">
                  {track.album_art ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={track.album_art} className="w-10 h-10 rounded-lg object-cover" alt="" />
                  ) : <div className="w-10 h-10 rounded-lg bg-white/5" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{track.title}</p>
                    <p className="text-xs text-gray-500 truncate">{track.artist}</p>
                  </div>
                  <div className="flex gap-1 lg:opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                    {canControl && (
                      <button onClick={() => playNow(track)} className="p-2 bg-spotify text-black rounded-full hover:bg-[#1ed760]" title="Play now" aria-label={`Play ${track.title} now`}>
                        <Play size={12} fill="currentColor" />
                      </button>
                    )}
                    <button onClick={() => addToQueue(track)} className="p-2 bg-accent rounded-full hover:bg-accent-2" title="Add to queue" aria-label={`Add ${track.title} to queue`}>
                      <Plus size={12} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="glass-card flex flex-col rounded-3xl h-72">
          <div className="p-4 border-b border-white/5 flex justify-between items-center">
            <h2 className="text-sm font-bold uppercase tracking-widest text-gray-400">Up next</h2>
            <span className="text-xs bg-white/5 px-2 py-0.5 rounded-full text-gray-400">{queue.length}</span>
          </div>
          <ol className="flex-1 overflow-y-auto p-3 space-y-1 custom-scrollbar">
            {queue.length === 0 && <li className="text-xs text-gray-500 px-2 py-4">The queue is empty. Add a song!</li>}
            {queue.map((item, i) => (
              <li key={item.playlistId} className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 group">
                <span className="text-xs text-gray-600 w-4 text-right">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{item.title}</p>
                  <p className="text-xs text-gray-500 truncate">{item.artist}</p>
                </div>
                {isAdmin && (
                  <div className="flex gap-1 lg:opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                    {i > 0 && (
                      <button onClick={() => moveToTop(item)} className="p-1.5 text-gray-400 hover:text-accent rounded-full" title="Move to top" aria-label="Move to top">
                        <ArrowUp size={14} />
                      </button>
                    )}
                    <button onClick={() => removeFromQueue(item)} className="p-1.5 text-gray-400 hover:text-red-400 rounded-full" title="Remove" aria-label="Remove from queue">
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ol>
        </section>
      </aside>

      {/* Player + chat */}
      <div className="flex flex-col gap-6 order-1 lg:order-2 min-w-0">
        <section className="glass-card p-6 sm:p-8 rounded-[2rem] relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-accent/10 to-transparent pointer-events-none" />
          <div className="relative flex flex-col md:flex-row items-center gap-8">
            <div className="relative shrink-0">
              <div className="absolute -inset-4 bg-gradient-to-tr from-accent to-accent-2 rounded-[2.5rem] blur-2xl opacity-20" />
              {nowPlaying?.albumArt ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={nowPlaying.albumArt} alt=""
                  className={`w-48 h-48 sm:w-56 sm:h-56 rounded-[2rem] object-cover shadow-2xl relative transition-transform duration-700 ${nowPlaying.isPlaying ? 'scale-105' : ''}`} />
              ) : (
                <div className="w-48 h-48 sm:w-56 sm:h-56 rounded-[2rem] bg-black/40 flex items-center justify-center relative border border-white/10">
                  <Music size={64} className="text-gray-700" />
                </div>
              )}
            </div>

            <div className="flex-1 text-center md:text-left min-w-0 w-full">
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 mb-4">
                <span className="px-3 py-1 bg-white/5 text-[10px] font-bold uppercase tracking-[0.2em] rounded-full text-accent border border-accent/20">
                  {room.name}
                </span>
                <span className="flex items-center gap-1 text-xs text-gray-400"><Users size={12} /> {room.member_count}</span>
                <span className="flex items-center gap-1 text-xs text-gray-400"><Crown size={12} /> @{room.admin_detail?.username}</span>
                <span className={`flex items-center gap-1 text-xs ${connection === 'open' ? 'text-spotify' : 'text-yellow-500'}`}>
                  {connection === 'open' ? <Wifi size={12} /> : <WifiOff size={12} />}
                  {connection === 'open' ? 'Live' : connection === 'connecting' ? 'Connecting…' : 'Reconnecting…'}
                </span>
              </div>

              <h1 className="text-3xl sm:text-5xl font-black mb-2 tracking-tight truncate">
                {nowPlaying?.title || 'Nothing playing yet'}
              </h1>
              <p className="text-lg text-gray-400 font-medium truncate mb-6">
                {nowPlaying?.artist || (isAdmin ? 'Pick a song or press play to start the queue.' : 'Waiting for the host to press play.')}
              </p>

              <div className="mb-6 max-w-xl mx-auto md:mx-0">
                <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-accent to-accent-2 transition-[width] duration-1000 ease-linear"
                    style={{ width: `${nowPlaying?.duration ? (nowPlaying.position / nowPlaying.duration) * 100 : 0}%` }} />
                </div>
                <div className="flex justify-between mt-2 text-[10px] font-mono text-gray-500">
                  <span>{formatMs(nowPlaying?.position ?? 0)}</span>
                  <span>{formatMs(nowPlaying?.duration ?? 0)}</span>
                </div>
              </div>

              <div className="flex items-center justify-center md:justify-start gap-6">
                <button onClick={togglePlayback} disabled={!canControl}
                  title={isAdmin ? undefined : 'Only the host controls playback'}
                  aria-label={nowPlaying?.isPlaying ? 'Pause' : 'Play'}
                  className={`w-16 h-16 rounded-full flex items-center justify-center transition-all shadow-xl ${
                    canControl ? 'bg-white text-black hover:scale-110' : 'bg-white/10 text-gray-600 cursor-not-allowed'
                  }`}>
                  {nowPlaying?.isPlaying ? <Pause size={28} fill="currentColor" /> : <Play size={28} fill="currentColor" className="translate-x-0.5" />}
                </button>
                <button onClick={playNextInQueue} disabled={!canControl || queue.length === 0}
                  className="text-gray-400 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed" aria-label="Skip to next">
                  <SkipForward size={24} />
                </button>
                <div className="hidden sm:flex items-center gap-3 pl-6 border-l border-white/10 text-gray-500">
                  <Volume2 size={18} />
                  <input type="range" min={0} max={100} value={volume} aria-label="Volume"
                    onChange={(e) => updateVolume(Number(e.target.value))}
                    className="w-24 h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-accent" />
                </div>
              </div>

              {currentUser.is_spotify_connected && !deviceId && !playerError && (
                <p className="mt-4 text-xs text-yellow-500 flex items-center gap-2 justify-center md:justify-start">
                  <Loader2 size={12} className="animate-spin" /> Starting your Spotify player…
                </p>
              )}
              {playerError && <p className="mt-4 text-xs text-red-300">{playerError}</p>}
            </div>
          </div>
        </section>

        <section className="glass-card flex flex-col rounded-[2rem] h-[28rem]">
          <div className="p-4 border-b border-white/5">
            <h2 className="font-bold text-sm tracking-widest uppercase text-gray-400">Live chat</h2>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar" aria-live="polite">
            {messages.length === 0 && <p className="text-center text-sm text-gray-500 py-8">No messages yet. Say hi 👋</p>}
            {messages.map((msg, i) => {
              const isMe = msg.user_id === currentUser.id;
              return (
                <div key={msg.id ?? `local-${i}`} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                  <span className="text-[10px] text-gray-500 mb-1 px-1 font-bold uppercase tracking-wider">
                    {msg.user_name}{msg.user_id === room.admin && ' · host'}
                  </span>
                  <div className={`px-4 py-2.5 rounded-2xl max-w-[85%] text-sm break-words ${
                    isMe ? 'bg-gradient-to-r from-accent to-accent-2 text-white rounded-tr-none' : 'bg-white/5 text-gray-200 rounded-tl-none'
                  }`}>
                    {msg.content}
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
          <form onSubmit={sendMessage} className="p-4 pt-0 relative">
            <input className="input !rounded-2xl !pr-12" placeholder={connection === 'open' ? 'Say something…' : 'Connecting to chat…'}
              value={newMessage} maxLength={1000} disabled={connection !== 'open'} aria-label="Chat message"
              onChange={(e) => setNewMessage(e.target.value)} />
            <button type="submit" disabled={connection !== 'open' || !newMessage.trim()}
              className="absolute right-7 top-1/2 -translate-y-[calc(50%+0.5rem)] p-1 text-accent disabled:text-gray-600" aria-label="Send">
              <Send size={20} />
            </button>
          </form>
        </section>
      </div>

      {toast && (
        <div role="status" className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 glass-card !bg-[#16171c]/95 px-5 py-3 rounded-2xl shadow-2xl text-sm flex items-center gap-3 max-w-[90vw]">
          <span className="truncate">{toast}</span>
          <button onClick={() => setToast('')} className="text-gray-500 hover:text-white" aria-label="Dismiss"><X size={14} /></button>
        </div>
      )}
    </div>
  );
}
