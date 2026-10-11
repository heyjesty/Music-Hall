"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import axios from 'axios';
import {
  ArrowUp, Check, Crown, Disc, Headphones, Link2, ListMusic, Loader2, LogOut, MessageCircle, Music, Pause, Play,
  Plus, Search, Send, SkipForward, Trash2, Users, Volume1, Volume2, VolumeX, Wifi, WifiOff, X,
} from 'lucide-react';
import api, { getErrorMessage } from '@/lib/api';
import { getAccessToken, isLoggedIn } from '@/lib/auth';
import { WS_URL } from '@/lib/config';
import { useRoomAudio } from '@/lib/useRoomAudio';
import {
  formatMs, themeInfo, type CatalogTrack, type ChatMessage, type Listener, type QueueItem, type Room, type RoomState,
  type User,
} from '@/lib/types';
import Avatar from '@/components/Avatar';

type ConnectionStatus = 'connecting' | 'open' | 'closed';

type ChatItem =
  | ({ kind: 'message' } & ChatMessage)
  | { kind: 'system'; key: string; text: string };

type SocketEvent =
  | RoomState
  | ({ type: 'chat_message' } & ChatMessage)
  | { type: 'listeners'; listeners: Listener[]; change: 'joined' | 'left' | null; user_name: string }
  | { type: 'room_closed' };

let systemKey = 0;

export default function RoomPage() {
  const params = useParams<{ id: string }>();
  const roomId = Number(params.id);
  const router = useRouter();

  const [room, setRoom] = useState<Room | null>(null);
  const [me, setMe] = useState<User | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [state, setState] = useState<RoomState | null>(null);
  const [listeners, setListeners] = useState<Listener[]>([]);
  const [chat, setChat] = useState<ChatItem[]>([]);
  const [draft, setDraft] = useState('');
  const [connection, setConnection] = useState<ConnectionStatus>('connecting');
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [mobileTab, setMobileTab] = useState<'music' | 'queue' | 'chat'>('chat');

  const wsRef = useRef<WebSocket | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const isHost = !!room && !!me && room.admin === me.id;

  const sendSocket = useCallback((payload: object) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
  }, []);

  const audio = useRoomAudio(state, {
    onTrackEnded: (playSeq) => sendSocket({ type: 'track_ended', play_seq: playSeq }),
  });

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [chat]);

  // Load the room, then keep a WebSocket open for live updates.
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

    const connect = () => {
      if (disposed) return;
      setConnection('connecting');
      const token = getAccessToken() ?? '';
      const socket = new WebSocket(`${WS_URL}/ws/room/${roomId}/?token=${encodeURIComponent(token)}`);
      wsRef.current = socket;

      socket.onopen = () => {
        reconnectDelay = 1000;
        setConnection('open');
      };
      socket.onmessage = (event) => {
        let data: SocketEvent;
        try {
          data = JSON.parse(event.data);
        } catch {
          return;
        }
        switch (data.type) {
          case 'room_state':
            setState(data);
            break;
          case 'chat_message':
            setChat((prev) => (data.id && prev.some((m) => m.kind === 'message' && m.id === data.id)
              ? prev
              : [...prev, { kind: 'message', ...data }]));
            break;
          case 'listeners':
            setListeners(data.listeners);
            if (data.change) {
              const text = `${data.user_name} ${data.change === 'joined' ? 'joined the room' : 'left the room'}`;
              setChat((prev) => [...prev, { kind: 'system', key: `sys-${systemKey++}`, text }]);
            }
            break;
          case 'room_closed':
            disposed = true;
            setToast('The host closed this room.');
            setTimeout(() => router.push('/'), 1500);
            break;
        }
      };
      socket.onclose = async (event) => {
        if (wsRef.current === socket) wsRef.current = null;
        if (disposed) return;
        setConnection('closed');
        if (event.code === 4004) {
          setNotFound(true);
          return;
        }
        if (event.code === 4001) {
          // Access token expired: refreshing it through any API call, then retry.
          try {
            await api.get('users/me/');
          } catch {
            router.replace(`/login?next=/rooms/${roomId}`);
            return;
          }
        }
        reconnectTimer = setTimeout(connect, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 2, 15000);
      };
    };

    (async () => {
      try {
        const [userRes, roomRes, msgRes] = await Promise.all([
          api.get<User>('users/me/'),
          api.get<Room>(`rooms/${roomId}/`),
          api.get<ChatMessage[]>(`messages/?room=${roomId}`),
        ]);
        if (disposed) return;
        setMe(userRes.data);
        setRoom(roomRes.data);
        setChat(msgRes.data.map((m) => ({ kind: 'message' as const, ...m })));
        api.post(`rooms/${roomId}/join/`).catch(() => undefined);
        connect();
      } catch (err) {
        const status = axios.isAxiosError(err) ? err.response?.status : undefined;
        if (status === 404) setNotFound(true);
        else if (status === 401) router.replace(`/login?next=/rooms/${roomId}`);
        else setToast(getErrorMessage(err, 'Failed to load the room.'));
      }
    })();

    return () => {
      disposed = true;
      clearTimeout(reconnectTimer);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [roomId, router]);

  // ---------- Actions ----------

  const run = async (key: string, fn: () => Promise<{ data: RoomState }>, success?: string) => {
    // A click inside the room counts as permission to play audio.
    audio.unlock();
    setBusy(key);
    try {
      const res = await fn();
      setState(res.data);
      if (success) setToast(success);
    } catch (err) {
      setToast(getErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const addTrack = (track: CatalogTrack) => run(
    `add:${track.source}:${track.external_id}`,
    () => api.post<RoomState>(`rooms/${roomId}/queue/`, { source: track.source, external_id: track.external_id }),
    `Added “${track.title}”`,
  );

  const playNow = (track: CatalogTrack) => run(
    `now:${track.source}:${track.external_id}`,
    () => api.post<RoomState>(`rooms/${roomId}/play-now/`, { source: track.source, external_id: track.external_id }),
  );

  const control = (action: 'play' | 'pause' | 'skip') => run(
    `control:${action}`,
    () => api.post<RoomState>(`rooms/${roomId}/playback/`, { action }),
  );

  const removeItem = (item: QueueItem) => run(
    `remove:${item.item_id}`,
    () => api.delete<RoomState>(`rooms/${roomId}/queue/${item.item_id}/`),
  );

  const moveToTop = (item: QueueItem) => run(
    `top:${item.item_id}`,
    () => api.post<RoomState>(`rooms/${roomId}/queue/${item.item_id}/top/`),
  );

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    const content = draft.trim();
    if (!content) return;
    sendSocket({ type: 'chat_message', content });
    setDraft('');
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setToast('Copy the address bar link to invite friends.');
    }
  };

  const closeRoom = async () => {
    if (!window.confirm('Close this room for everyone? This cannot be undone.')) return;
    try {
      await api.delete(`rooms/${roomId}/`);
      router.push('/');
    } catch (err) {
      setToast(getErrorMessage(err));
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

  if (!room || !me) {
    return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 size={40} className="animate-spin text-accent" /></div>;
  }

  const theme = themeInfo(room.theme);
  const current = state?.current ?? null;
  const queue = state?.queue ?? [];

  return (
    <div className="space-y-6">
      {/* Room header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
            <span>{theme.emoji} {theme.label}</span>
            <span>·</span>
            <span className="flex items-center gap-1"><Crown size={12} className="text-accent-2" /> {room.admin_detail?.username}</span>
            <span>·</span>
            <span className={`flex items-center gap-1 ${connection === 'open' ? 'text-spotify' : 'text-yellow-500'}`}>
              {connection === 'open' ? <Wifi size={12} /> : <WifiOff size={12} />}
              {connection === 'open' ? 'Live' : 'Reconnecting…'}
            </span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight truncate">{room.name}</h1>
          {room.description && <p className="text-gray-400 text-sm mt-1 line-clamp-1">{room.description}</p>}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-2 glass-card rounded-full pl-2 pr-3 py-1.5" title={listeners.map((l) => l.username).join(', ')}>
            <div className="flex -space-x-2">
              {listeners.slice(0, 5).map((l) => <Avatar key={l.id} name={l.username} size={26} ring />)}
            </div>
            <span className="text-xs text-gray-300 flex items-center gap-1"><Headphones size={12} /> {listeners.length}</span>
          </div>
          <button onClick={copyLink} className="flex items-center gap-2 px-4 py-2 rounded-full glass-card hover:bg-white/10 text-sm font-medium transition-colors">
            {copied ? <Check size={16} className="text-spotify" /> : <Link2 size={16} />} {copied ? 'Copied' : 'Invite'}
          </button>
          {isHost && (
            <button onClick={closeRoom} className="p-2 rounded-full text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-colors" title="Close room" aria-label="Close room">
              <LogOut size={18} />
            </button>
          )}
        </div>
      </header>

      {/* Now playing */}
      <section className="glass-card p-5 sm:p-8 rounded-[2rem] relative overflow-hidden">
        {current?.album_art && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={current.album_art} alt="" aria-hidden className="absolute inset-0 w-full h-full object-cover opacity-15 blur-3xl scale-125 pointer-events-none" />
        )}
        <div className="relative flex flex-col md:flex-row items-center gap-6 sm:gap-8">
          <div className="relative shrink-0">
            {current?.album_art ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={current.album_art} alt=""
                className={`w-44 h-44 sm:w-52 sm:h-52 rounded-[1.75rem] object-cover shadow-2xl transition-transform duration-700 ${state?.is_playing ? 'scale-100' : 'scale-95 opacity-80'}`} />
            ) : (
              <div className="w-44 h-44 sm:w-52 sm:h-52 rounded-[1.75rem] bg-black/40 flex items-center justify-center border border-white/10">
                <Music size={56} className="text-gray-700" />
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0 w-full text-center md:text-left">
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-accent mb-2">
              {current ? (state?.is_playing ? 'Now playing' : 'Paused') : 'Nothing playing'}
            </p>
            <h2 className="text-2xl sm:text-4xl font-black tracking-tight truncate">
              {current?.title ?? 'The room is quiet'}
            </h2>
            <p className="text-gray-400 truncate mt-1">
              {current ? current.artist : 'Add a song below — it will start playing for everyone.'}
            </p>
            {current && (
              <p className="text-xs text-gray-500 mt-2 flex items-center justify-center md:justify-start gap-2">
                {current.added_by && <>Added by <span className="text-gray-300">{current.added_by}</span></>}
                {current.is_preview && <span className="px-1.5 py-0.5 rounded bg-white/10 text-[10px] uppercase tracking-wider">30s preview</span>}
              </p>
            )}

            <div className="mt-6 max-w-xl mx-auto md:mx-0">
              <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-accent to-accent-2 transition-[width] duration-500 ease-linear"
                  style={{ width: `${current?.duration ? (audio.positionMs / current.duration) * 100 : 0}%` }} />
              </div>
              <div className="flex justify-between mt-2 text-[11px] font-mono text-gray-500">
                <span>{formatMs(current ? audio.positionMs : 0)}</span>
                <span>{formatMs(current?.duration ?? 0)}</span>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-center md:justify-start gap-4">
              {isHost ? (
                <>
                  <button
                    onClick={() => control(state?.is_playing ? 'pause' : 'play')}
                    disabled={busy === 'control:play' || busy === 'control:pause' || (!current && queue.length === 0)}
                    className="w-14 h-14 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 active:scale-95 transition-transform disabled:opacity-40 disabled:hover:scale-100"
                    aria-label={state?.is_playing ? 'Pause for everyone' : 'Play for everyone'}
                    title={state?.is_playing ? 'Pause for everyone' : 'Play for everyone'}
                  >
                    {state?.is_playing ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" className="translate-x-0.5" />}
                  </button>
                  <button onClick={() => control('skip')} disabled={!current || busy === 'control:skip'}
                    className="p-3 rounded-full text-gray-300 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-30"
                    aria-label="Skip to next song" title="Skip">
                    <SkipForward size={22} />
                  </button>
                </>
              ) : (
                <span className="text-xs text-gray-500 flex items-center gap-1.5"><Crown size={12} /> The host controls playback</span>
              )}

              <div className="flex items-center gap-2 text-gray-400 md:ml-auto">
                <button onClick={() => audio.setVolume(audio.volume > 0 ? 0 : 0.8)} aria-label={audio.volume > 0 ? 'Mute' : 'Unmute'} className="hover:text-white">
                  {audio.volume === 0 ? <VolumeX size={18} /> : audio.volume < 0.5 ? <Volume1 size={18} /> : <Volume2 size={18} />}
                </button>
                <input type="range" min={0} max={100} value={Math.round(audio.volume * 100)} aria-label="Volume"
                  onChange={(e) => audio.setVolume(Number(e.target.value) / 100)}
                  className="w-24 accent-accent cursor-pointer" />
              </div>
            </div>

            {audio.loadError && current && (
              <p className="mt-4 text-xs text-red-300">
                This song couldn&apos;t be loaded.{isHost ? ' Skip to the next one.' : ' The host can skip it.'}
              </p>
            )}
          </div>
        </div>

        {current && state?.is_playing && audio.needsUnlock && (
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center rounded-[2rem]">
            <button onClick={audio.unlock} className="btn-primary !rounded-full !px-8 !py-4 text-lg shadow-2xl animate-pulse">
              <Headphones size={22} /> Start listening
            </button>
          </div>
        )}
      </section>

      {/* Mobile tabs */}
      <div className="lg:hidden grid grid-cols-3 gap-2 glass-card rounded-2xl p-1">
        {([
          ['chat', MessageCircle, 'Chat'],
          ['music', Search, 'Add music'],
          ['queue', ListMusic, `Up next (${queue.length})`],
        ] as const).map(([key, Icon, label]) => (
          <button key={key} onClick={() => setMobileTab(key)}
            className={`flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-medium transition-colors ${mobileTab === key ? 'bg-white/10 text-white' : 'text-gray-400'}`}>
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        <div className={`${mobileTab === 'music' ? '' : 'hidden'} lg:block`}>
          <MusicFinder theme={room.theme} isHost={isHost} busy={busy} onAdd={addTrack} onPlayNow={playNow} />
        </div>

        <section className={`${mobileTab === 'queue' ? 'flex' : 'hidden'} lg:flex glass-card flex-col rounded-3xl h-[30rem]`}>
          <div className="p-4 border-b border-white/5 flex justify-between items-center">
            <h2 className="text-sm font-bold uppercase tracking-widest text-gray-400 flex items-center gap-2"><ListMusic size={16} /> Up next</h2>
            <span className="text-xs bg-white/5 px-2 py-0.5 rounded-full text-gray-400">{queue.length}</span>
          </div>
          <ol className="flex-1 overflow-y-auto p-3 space-y-1 custom-scrollbar">
            {queue.length === 0 && (
              <li className="text-sm text-gray-500 px-2 py-8 text-center">
                Nothing queued. Anyone in the room can add songs.
              </li>
            )}
            {queue.map((item, i) => (
              <li key={item.item_id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 group">
                <span className="text-xs text-gray-600 w-4 text-right">{i + 1}</span>
                <TrackArt src={item.album_art} size={40} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{item.title}</p>
                  <p className="text-xs text-gray-500 truncate">{item.artist}{item.added_by && ` · added by ${item.added_by}`}</p>
                </div>
                {isHost && (
                  <div className="flex gap-1 lg:opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                    {i > 0 && (
                      <button onClick={() => moveToTop(item)} className="p-1.5 text-gray-400 hover:text-accent rounded-full" title="Play next" aria-label="Play next">
                        <ArrowUp size={15} />
                      </button>
                    )}
                    <button onClick={() => removeItem(item)} className="p-1.5 text-gray-400 hover:text-red-400 rounded-full" title="Remove" aria-label="Remove from queue">
                      <Trash2 size={15} />
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ol>
        </section>

        <section className={`${mobileTab === 'chat' ? 'flex' : 'hidden'} lg:flex glass-card flex-col rounded-3xl h-[30rem] lg:col-span-2 xl:col-span-1`}>
          <div className="p-4 border-b border-white/5 flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-widest text-gray-400 flex items-center gap-2"><MessageCircle size={16} /> Chat</h2>
            <span className="text-xs text-gray-500 flex items-center gap-1"><Users size={12} /> {listeners.length} here</span>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar" aria-live="polite">
            {chat.length === 0 && <p className="text-center text-sm text-gray-500 py-8">No messages yet. Say hi 👋</p>}
            {chat.map((item, i) => {
              if (item.kind === 'system') {
                return <p key={item.key} className="text-center text-[11px] text-gray-500">{item.text}</p>;
              }
              const mine = item.user_id === me.id;
              return (
                <div key={item.id ?? `m-${i}`} className={`flex gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
                  {!mine && <Avatar name={item.user_name} size={28} />}
                  <div className={`flex flex-col max-w-[80%] ${mine ? 'items-end' : 'items-start'}`}>
                    {!mine && (
                      <span className="text-[11px] text-gray-500 mb-0.5 px-1">
                        {item.user_name}{item.user_id === room.admin && <Crown size={10} className="inline ml-1 text-accent-2" />}
                      </span>
                    )}
                    <div className={`px-3.5 py-2 rounded-2xl text-sm break-words ${
                      mine ? 'bg-gradient-to-r from-accent to-accent-2 text-white rounded-tr-sm' : 'bg-white/[0.07] text-gray-100 rounded-tl-sm'
                    }`}>
                      {item.content}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={chatEndRef} />
          </div>
          <form onSubmit={sendMessage} className="p-3 border-t border-white/5 flex gap-2">
            <input className="input !rounded-full !py-2.5 text-sm" placeholder={connection === 'open' ? 'Say something…' : 'Connecting…'}
              value={draft} maxLength={1000} disabled={connection !== 'open'} aria-label="Chat message"
              onChange={(e) => setDraft(e.target.value)} />
            <button type="submit" disabled={connection !== 'open' || !draft.trim()}
              className="shrink-0 w-11 h-11 rounded-full bg-accent text-white flex items-center justify-center disabled:opacity-40 hover:opacity-90 transition-opacity" aria-label="Send">
              <Send size={18} />
            </button>
          </form>
        </section>
      </div>

      {toast && (
        <div role="status" className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-[#16171c]/95 border border-white/10 backdrop-blur px-5 py-3 rounded-2xl shadow-2xl text-sm flex items-center gap-3 max-w-[90vw]">
          <span className="truncate">{toast}</span>
          <button onClick={() => setToast('')} className="text-gray-500 hover:text-white" aria-label="Dismiss"><X size={14} /></button>
        </div>
      )}
    </div>
  );
}

function TrackArt({ src, size }: { src: string | null; size: number }) {
  if (!src) {
    return (
      <div className="rounded-lg bg-white/5 flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
        <Music size={size * 0.4} className="text-gray-600" />
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" className="rounded-lg object-cover shrink-0" style={{ width: size, height: size }} loading="lazy" />;
}

function MusicFinder({ theme, isHost, busy, onAdd, onPlayNow }: {
  theme: string;
  isHost: boolean;
  busy: string | null;
  onAdd: (t: CatalogTrack) => void;
  onPlayNow: (t: CatalogTrack) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CatalogTrack[] | null>(null);
  const [suggested, setSuggested] = useState<CatalogTrack[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const info = themeInfo(theme);

  useEffect(() => {
    api.get<CatalogTrack[]>('music/suggestions/', { params: { theme } })
      .then((res) => setSuggested(res.data))
      .catch(() => setSuggested([]));
  }, [theme]);

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setError('');
    try {
      const res = await api.get<CatalogTrack[]>('music/search/', { params: { q } });
      setResults(res.data);
    } catch (err) {
      setError(getErrorMessage(err, 'Search failed.'));
    } finally {
      setSearching(false);
    }
  };

  const tracks = results ?? suggested;

  return (
    <section className="glass-card flex flex-col rounded-3xl h-[30rem]">
      <div className="p-4 border-b border-white/5">
        <form onSubmit={search} className="relative">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
          <input type="search" className="input !pl-10 !pr-10 !py-2.5 text-sm" placeholder="Search songs or artists"
            value={query} aria-label="Search music"
            onChange={(e) => { setQuery(e.target.value); if (!e.target.value) setResults(null); }} />
          {searching && <Loader2 size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 animate-spin text-gray-400" />}
        </form>
      </div>
      <div className="flex-1 overflow-y-auto p-3 custom-scrollbar">
        <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 px-2">
          {results ? `Results for “${query}”` : `Trending ${info.genre} · ${info.emoji} ${info.label} picks`}
        </h3>
        {error && <p className="text-xs text-red-300 px-2 py-2">{error}</p>}
        {!error && tracks.length === 0 && !searching && (
          <p className="text-sm text-gray-500 px-2 py-8 text-center">{results ? 'No songs found. Try another search.' : 'Loading suggestions…'}</p>
        )}
        <ul className="space-y-1">
          {tracks.map((track) => {
            const key = `${track.source}:${track.external_id}`;
            const adding = busy === `add:${key}`;
            return (
              <li key={key} className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 transition-colors group">
                <TrackArt src={track.album_art} size={44} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{track.title}</p>
                  <p className="text-xs text-gray-500 truncate flex items-center gap-1.5">
                    {track.is_preview && <span className="px-1 rounded bg-white/10 text-[9px] uppercase tracking-wider text-gray-400 shrink-0">Preview</span>}
                    <span className="truncate">{track.artist}</span>
                    <span className="shrink-0">· {formatMs(track.duration)}</span>
                  </p>
                </div>
                <div className="flex gap-1 shrink-0">
                  {isHost && (
                    <button onClick={() => onPlayNow(track)} disabled={!!busy}
                      className="p-2 rounded-full text-gray-300 hover:text-white hover:bg-white/10 lg:opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity disabled:opacity-40"
                      title="Play now for everyone" aria-label={`Play ${track.title} now`}>
                      <Play size={14} fill="currentColor" />
                    </button>
                  )}
                  <button onClick={() => onAdd(track)} disabled={!!busy}
                    className="p-2 rounded-full bg-accent/15 text-accent hover:bg-accent hover:text-white transition-colors disabled:opacity-40"
                    title="Add to queue" aria-label={`Add ${track.title} to queue`}>
                    {adding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
      <p className="px-4 py-2 border-t border-white/5 text-[10px] text-gray-600">
        Full tracks from Audius · 30-second previews from Apple Music
      </p>
    </section>
  );
}
