"use client";

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import api from '@/lib/api';
import {
  Send, Users, Play, Pause, SkipForward, SkipBack,
  Music, Search, Plus, Volume2, Trash2, Loader2, Radio,
  UserPlus, Link, Check
} from 'lucide-react';

export default function Room() {
  const { id } = useParams();
  const router = useRouter();
  const [room, setRoom] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // HTML5 Audio Player
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [currentTrack, setCurrentTrack] = useState<any>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(30);
  const [volume, setVolume] = useState(0.8);
  const [inviteLink, setInviteLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [creatingInvite, setCreatingInvite] = useState(false);

  // Free Music
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [popularTracks, setPopularTracks] = useState<any[]>([]);
  const [queue, setQueue] = useState<any[]>([]);

  const lastSyncRef = useRef<number>(0);
  const isAdminRef = useRef<boolean>(false);
  const sentMessageIds = useRef<Set<string>>(new Set());
  const wsRef = useRef<WebSocket | null>(null);  // persistent socket ref — survives async delays

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // Init audio element once
  useEffect(() => {
    const audio = new Audio();
    audio.volume = volume;
    audioRef.current = audio;

    audio.addEventListener('timeupdate', () => setProgress(audio.currentTime));
    audio.addEventListener('loadedmetadata', () => setDuration(audio.duration));
    audio.addEventListener('play', () => setIsPlaying(true));
    audio.addEventListener('pause', () => setIsPlaying(false));
    audio.addEventListener('ended', () => {
      setIsPlaying(false);
      setProgress(0);
    });

    return () => { audio.pause(); audio.src = ''; };
  }, []);

  const broadcastSync = useCallback((track: any, timeSec: number, playing: boolean, wsRef: WebSocket) => {
    if (!isAdminRef.current) return;
    const now = Date.now();
    if (now - lastSyncRef.current < 2000) return;
    lastSyncRef.current = now;
    wsRef.send(JSON.stringify({
      type: 'playback_sync',
      track_id: track.id,
      preview_url: track.preview_url,
      track_title: track.title,
      track_artist: track.artist,
      track_art: track.album_art,
      timestamp_ms: timeSec * 1000,
      is_playing: playing,
    }));
  }, []);

  const playTrack = async (track: any, wsRef?: WebSocket) => {
    if (!audioRef.current) return;
    if (currentTrack?.id === track.id) {
      isPlaying ? audioRef.current.pause() : audioRef.current.play();
      return;
    }
    setCurrentTrack(track);
    audioRef.current.src = track.preview_url;
    audioRef.current.load();
    await audioRef.current.play().catch(console.error);

    if (wsRef && isAdminRef.current) {
      lastSyncRef.current = 0;
      broadcastSync(track, 0, true, wsRef);
    }
  };

  const togglePlay = () => {
    if (!audioRef.current || !currentTrack) return;
    isPlaying ? audioRef.current.pause() : audioRef.current.play();
  };

  const seek = (val: number) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = val;
    setProgress(val);
  };

  const changeVolume = (val: number) => {
    setVolume(val);
    if (audioRef.current) audioRef.current.volume = val;
  };

  const fetchQueue = async () => {
    try {
      const res = await api.get('playlists/');
      setQueue(res.data
        .filter((p: any) => p.room === parseInt(id as string))
        .map((p: any) => ({ ...p.track_detail, playlist_id: p.id }))
      );
    } catch (err) { console.error(err); }
  };

  const searchFreeMusic = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const res = await api.get(`free-music/search/?q=${encodeURIComponent(searchQuery)}`);
      setSearchResults(res.data);
    } catch (err) { console.error(err); }
    finally { setSearching(false); }
  };

  const addToQueue = async (track: any) => {
    try {
      await api.post('playlists/', {
        room: room.id, track_id: track.id,
        title: track.title, artist: track.artist,
        duration: track.duration, album_art: track.album_art,
      });
      fetchQueue();
    } catch (err) { console.error(err); }
  };

  const createInvite = async () => {
    setCreatingInvite(true);
    try {
      const res = await api.post('invitations/', { room: room.id });
      const link = `${window.location.origin}/invite/${res.data.token}`;
      setInviteLink(link);
      navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch (err) {
      console.error('Failed to create invite', err);
    } finally {
      setCreatingInvite(false);
    }
  };

  const removeFromQueue = async (playlistId: number) => {
    try {
      await api.delete(`playlists/${playlistId}/`);
      fetchQueue();
    } catch (err) { console.error(err); }
  };

  const handleNextSong = (wsRef?: WebSocket) => {
    setQueue(prev => {
      if (prev.length === 0) return prev;
      const next = prev[0];
      if (next?.preview_url) playTrack(next, wsRef);
      return prev.slice(1);
    });
  };

  useEffect(() => {
    let cancelled = false;

    // Close any existing socket immediately (handles React StrictMode double-invoke)
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    async function init() {
      // Auth guard — redirect to onboarding if no token
      const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
      if (!token) {
        router.replace('/onboarding');
        return;
      }

      // Load guest user data from localStorage (no extra API call needed)
      const localName = localStorage.getItem('guest_name') || 'Guest';
      const localUsername = localStorage.getItem('guest_username') || 'guest';
      const localId = parseInt(localStorage.getItem('guest_id') || '0');
      setCurrentUser({ id: localId, username: localUsername, first_name: localName });

      try {
        const roomRes = await api.get(`rooms/${id}/`);
        setRoom(roomRes.data);
        isAdminRef.current = localId === roomRes.data.admin;

        // Load mood tracks
        const mood = roomRes.data.theme || 'HAPPY';
        const popRes = await api.get(`free-music/popular/?mood=${mood}`);
        setPopularTracks(popRes.data);

        const msgRes = await api.get('messages/');
        setMessages(msgRes.data.filter((m: any) => m.room === parseInt(id as string)));

        await fetchQueue();

        // Guard: effect was cleaned up while awaiting — don't open a zombie socket
        if (cancelled) return;

        // WebSocket — store in ref so cleanup can always close it
        const socket = new WebSocket(`ws://localhost:8000/ws/room/${id}/`);
        wsRef.current = socket;
        setWs(socket);

        socket.onmessage = (event) => {
          const data = JSON.parse(event.data);
          if (data.type === 'chat_message') {
            // Skip messages we already added optimistically
            if (data.client_id && sentMessageIds.current.has(data.client_id)) {
              sentMessageIds.current.delete(data.client_id);
              return;
            }
            setMessages(prev => [...prev, data]);
          } else if (data.type === 'queue_update') {
            fetchQueue();
          } else if (data.type === 'playback_sync' && !isAdminRef.current) {
            // Member syncs to admin
            if (!audioRef.current || !data.preview_url) return;
            const audio = audioRef.current;
            if (audio.src !== data.preview_url) {
              setCurrentTrack({
                id: data.track_id, title: data.track_title,
                artist: data.track_artist, album_art: data.track_art,
                preview_url: data.preview_url,
              });
              audio.src = data.preview_url;
              audio.load();
            }
            const targetTime = (data.timestamp_ms || 0) / 1000;
            if (Math.abs(audio.currentTime - targetTime) > 3) {
              audio.currentTime = targetTime;
            }
            data.is_playing ? audio.play().catch(console.error) : audio.pause();
          }
        };

      } catch (err: any) {
        // Token expired or invalid — redirect to onboarding
        if (err?.response?.status === 401) {
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
          router.replace('/onboarding');
        } else {
          console.error('Init failed', err);
        }
      }
    }

    init();
    const queueInterval = setInterval(fetchQueue, 15000);

    return () => {
      cancelled = true;
      // Close via ref — works even if socket was created after cleanup triggered
      wsRef.current?.close();
      wsRef.current = null;
      setWs(null);
      clearInterval(queueInterval);
    };
  }, [id]);

  // Admin periodic sync
  useEffect(() => {
    if (!ws || !currentTrack || !isAdminRef.current) return;
    const interval = setInterval(() => {
      if (audioRef.current && isPlaying) {
        broadcastSync(currentTrack, audioRef.current.currentTime, true, ws);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [ws, currentTrack, isPlaying, broadcastSync]);

  // Auto-scroll chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (!room) return (
    <div className="flex items-center justify-center min-h-screen bg-[#070708]">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#ff7e5f]" />
    </div>
  );

  const progressPct = duration > 0 ? (progress / duration) * 100 : 0;

  return (
    <div className="flex flex-col lg:flex-row gap-6 p-4 lg:p-8 h-screen bg-[#070708] text-white overflow-hidden">

      {/* ── Sidebar ── */}
      <div className="w-full lg:w-80 flex flex-col gap-4 flex-shrink-0 min-h-0">

        {/* Search */}
        <div className="glass-card flex-1 min-h-0 flex flex-col rounded-3xl overflow-hidden">
          <div className="p-4 border-b border-white/5">
            <h2 className="text-base font-bold flex items-center gap-2">
              <Music size={14} className="text-[#ff7e5f]" /> Find Music
            </h2>
            <p className="text-[10px] text-green-400 mt-0.5 flex items-center gap-1">
              <Radio size={9} /> Free via Deezer · no login required
            </p>
          </div>
          <div className="p-3">
            <form onSubmit={searchFreeMusic} className="relative">
              <input
                type="text"
                className="w-full bg-black/40 border border-white/10 rounded-xl pl-4 pr-10 py-2.5 text-sm focus:ring-2 focus:ring-[#ff7e5f] outline-none"
                placeholder="Search artists, songs…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
              <button type="submit" className="absolute right-3 top-2.5 text-gray-500 hover:text-white">
                {searching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
              </button>
            </form>
          </div>

          <div className="flex-1 overflow-y-auto p-3 pt-0 space-y-1 custom-scrollbar">
            {/* Mood picks */}
            {popularTracks.length > 0 && !searchQuery && (
              <>
                <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest px-2 mb-2">
                  Mood · {room.theme}
                </p>
                {popularTracks.map(track => (
                  <TrackRow key={track.id} track={track} onPlay={() => playTrack(track, ws || undefined)} onQueue={() => addToQueue(track)} />
                ))}
              </>
            )}
            {/* Search results */}
            {searchResults.length > 0 && (
              <>
                <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest px-2 mb-2 mt-3">
                  Results
                </p>
                {searchResults.map(track => (
                  <TrackRow key={track.id} track={track} onPlay={() => playTrack(track, ws || undefined)} onQueue={() => addToQueue(track)} />
                ))}
              </>
            )}
          </div>
        </div>

        {/* Queue */}
        <div className="glass-card h-52 flex flex-col rounded-3xl overflow-hidden">
          <div className="p-3 border-b border-white/5 flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500">Up Next</h2>
            <span className="text-[10px] bg-white/5 px-2 py-0.5 rounded-full text-gray-400">{queue.length}</span>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
            {queue.length === 0 && <p className="text-center text-gray-600 text-xs py-4">Queue is empty</p>}
            {queue.map((item, i) => (
              <div key={i} className="flex items-center gap-2 group text-xs">
                <span className="text-gray-600 w-4">{i + 1}</span>
                {item?.album_art && <img src={item.album_art} className="w-7 h-7 rounded object-cover" alt="" />}
                <div className="flex-1 min-w-0">
                  <p className="truncate font-medium">{item?.title || 'Unknown'}</p>
                  <p className="truncate text-gray-500">{item?.artist}</p>
                </div>
                {isAdminRef.current && (
                  <button onClick={() => removeFromQueue(item.playlist_id)} className="p-1 text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all">
                    <Trash2 size={11} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Main ── */}
      <div className="flex-1 flex flex-col gap-4 min-w-0 min-h-0">

        {/* Player Card */}
        <div className="glass-card p-6 lg:p-8 rounded-[2rem] relative overflow-hidden group flex-shrink-0">
          <div className="absolute inset-0 bg-gradient-to-br from-[#ff7e5f]/10 to-transparent" />
          <div className="relative z-10 flex flex-col md:flex-row items-center gap-8">

            {/* Album Art */}
            <div className="relative shrink-0">
              <div className={`absolute -inset-4 bg-gradient-to-tr from-[#ff7e5f] to-[#feb47b] rounded-[2.5rem] blur-2xl opacity-20 transition-opacity ${isPlaying ? 'opacity-40 animate-pulse' : ''}`} />
              {currentTrack?.album_art ? (
                <img
                  src={currentTrack.album_art}
                  className={`w-48 h-48 lg:w-56 lg:h-56 rounded-[2rem] object-cover shadow-2xl relative z-10 transition-all duration-700 ${isPlaying ? 'scale-105 rotate-2' : ''}`}
                  alt="Album Art"
                />
              ) : (
                <div className="w-48 h-48 rounded-[2rem] bg-black/40 flex items-center justify-center relative z-10 border border-white/10">
                  <Music size={64} className="text-gray-700" />
                </div>
              )}
            </div>

            {/* Info + Controls */}
            <div className="flex-1 min-w-0 text-center md:text-left">
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 mb-4">
                <span className="px-3 py-1 bg-white/5 text-[9px] font-bold uppercase tracking-[0.2em] rounded-full text-[#ff7e5f] border border-[#ff7e5f]/20">
                  {room.theme} Session
                </span>
                <span className="px-3 py-1 bg-green-500/10 text-green-400 text-[9px] font-bold rounded-full border border-green-500/20 flex items-center gap-1">
                  <Radio size={8} /> Free Music
                </span>
                <div className="flex items-center gap-1 text-[10px] text-gray-500">
                  <Users size={11} /> {room.memberships?.length || 1} Listening
                </div>
                <button 
                  onClick={createInvite}
                  disabled={creatingInvite}
                  className={`flex items-center gap-2 px-3 py-1 text-[10px] font-bold rounded-full border transition-all ${copied ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-white/5 border-white/10 hover:bg-white/10 text-gray-300'}`}
                >
                  {creatingInvite ? <Loader2 size={10} className="animate-spin" /> : copied ? <Check size={10} /> : <UserPlus size={10} />}
                  {copied ? 'Link Copied!' : 'Invite Friends'}
                </button>
              </div>

              <h1 className="text-3xl lg:text-4xl font-black mb-1 tracking-tight truncate">
                {currentTrack?.title || room.name}
              </h1>
              <p className="text-lg text-gray-400 font-medium truncate mb-6">
                {currentTrack?.artist || room.description}
              </p>

              {/* Progress */}
              <div className="mb-6 max-w-md mx-auto md:mx-0">
                <input
                  type="range" min={0} max={duration || 30} step={0.1}
                  value={progress}
                  onChange={e => seek(parseFloat(e.target.value))}
                  className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-[#ff7e5f] bg-white/10"
                />
                <div className="flex justify-between mt-1.5 text-[10px] font-mono text-gray-500">
                  <span>{formatTime(progress)}</span>
                  <span>{formatTime(duration)}</span>
                </div>
              </div>

              {/* Controls */}
              <div className="flex items-center justify-center md:justify-start gap-5">
                <button onClick={() => seek(Math.max(0, progress - 10))} className="text-gray-400 hover:text-white transition-colors">
                  <SkipBack size={22} />
                </button>
                <button
                  onClick={togglePlay}
                  disabled={!currentTrack}
                  className={`w-14 h-14 rounded-full flex items-center justify-center transition-all shadow-xl ${currentTrack ? 'bg-white text-black hover:scale-110' : 'bg-white/10 text-gray-600 cursor-not-allowed'}`}
                >
                  {isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" className="translate-x-0.5" />}
                </button>
                <button onClick={() => handleNextSong(ws || undefined)} className="text-gray-400 hover:text-white transition-colors">
                  <SkipForward size={22} />
                </button>
                <div className="hidden md:flex items-center gap-3 ml-4 pl-4 border-l border-white/10 text-gray-500">
                  <Volume2 size={16} />
                  <input
                    type="range" min={0} max={1} step={0.01}
                    value={volume}
                    onChange={e => changeVolume(parseFloat(e.target.value))}
                    className="w-20 h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-[#ff7e5f]"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Chat */}
        <div className="flex-1 glass-card flex flex-col min-h-0 rounded-[2rem] overflow-hidden">
          <div className="p-4 border-b border-white/5 flex items-center justify-between flex-shrink-0">
            <h3 className="font-bold text-xs tracking-widest uppercase text-gray-500">Live Chat</h3>
            <div className="flex -space-x-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="w-5 h-5 rounded-full border-2 border-[#070708] bg-gradient-to-br from-gray-700 to-gray-800" />
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
            {messages.map((msg, i) => {
              const isMe = msg.user_id === currentUser?.id || msg.user_name === currentUser?.username;
              return (
                <div key={i} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                  <span className="text-[9px] text-gray-600 mb-1 px-1 font-bold uppercase tracking-wider">{msg.user_name || 'Listener'}</span>
                  <div className={`px-3.5 py-2 rounded-2xl max-w-[85%] text-sm ${isMe ? 'bg-gradient-to-r from-[#ff7e5f] to-[#feb47b] text-white rounded-tr-none' : 'bg-white/5 text-gray-200 rounded-tl-none'}`}>
                    {msg.content}
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
          <div className="p-4 pt-0 flex-shrink-0">
            <form
              onSubmit={e => {
                e.preventDefault();
                if (newMessage.trim() && ws) {
                  const clientId = `${Date.now()}-${Math.random()}`;
                  const msgPayload = { type: 'chat_message', content: newMessage, user_id: currentUser?.id, user_name: currentUser?.username, client_id: clientId };
                  // Optimistically add to UI immediately
                  setMessages(prev => [...prev, msgPayload]);
                  // Track this ID so we can ignore the server echo
                  sentMessageIds.current.add(clientId);
                  ws.send(JSON.stringify(msgPayload));
                  setNewMessage('');
                }
              }}
              className="relative"
            >
              <input
                type="text"
                className="w-full bg-black/40 border border-white/10 rounded-2xl pl-4 pr-12 py-3 text-sm focus:ring-2 focus:ring-[#ff7e5f] outline-none"
                placeholder="Say something…"
                value={newMessage}
                onChange={e => setNewMessage(e.target.value)}
              />
              <button type="submit" className="absolute right-3 top-2.5 p-1 text-[#ff7e5f] hover:scale-110 transition-transform">
                <Send size={18} />
              </button>
            </form>
          </div>
        </div>
      </div>

    </div>
  );
}

function TrackRow({ track, onPlay, onQueue }: { track: any; onPlay: () => void; onQueue: () => void }) {
  return (
    <div className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-white/5 transition-colors group cursor-pointer">
      <img src={track.album_art} className="w-9 h-9 rounded-lg object-cover flex-shrink-0" alt={track.title} />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold truncate">{track.title}</p>
        <p className="text-[10px] text-gray-500 truncate">{track.artist}</p>
      </div>
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0">
        <button onClick={onPlay} className="p-1.5 bg-white text-black rounded-full hover:scale-110 transition-all" title="Play">
          <Play size={9} fill="currentColor" />
        </button>
        <button onClick={onQueue} className="p-1.5 bg-[#ff7e5f] rounded-full hover:scale-110 transition-all" title="Add to Queue">
          <Plus size={9} />
        </button>
      </div>
    </div>
  );
}
