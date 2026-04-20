"use client";

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import api from '@/lib/api';
import { loadSpotifySDK, initializeSpotifyPlayer } from '@/lib/spotify';
import { Send, Users, Play, Pause, SkipForward, SkipBack, Music, Search, Plus, Volume2, Disc, ArrowUp, Trash2, Loader2 } from 'lucide-react';

export default function Room() {
  const { id } = useParams();
  const router = useRouter();
  const [room, setRoom] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Spotify State
  const [player, setPlayer] = useState<any>(null);
  const [isPlaybackReady, setIsPlaybackReady] = useState(false);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [playbackState, setPlaybackState] = useState<any>(null);
  const [spotifyQuery, setSpotifyQuery] = useState('');
  const [spotifyResults, setSpotifyResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [queue, setQueue] = useState<any[]>([]);
  const [localVolume, setLocalVolume] = useState(50);
  const [moodTracks, setMoodTracks] = useState<any[]>([]);

  // Sync state
  const lastSyncRef = useRef<number>(0);
  const wasPlayingRef = useRef<boolean>(false);
  const currentTrackIdRef = useRef<string | null>(null);

  const playTrack = async (track: any) => {
    if (!player || !deviceId) return;
    try {
      await api.post('spotify/transfer/', { device_id: deviceId });
      await api.post('playlists/', { room: room.id, track_id: track.id, title: track.title, artist: track.artist, duration: track.duration, album_art: track.album_art });
      if (currentUser?.id === room?.admin) {
        api.post('spotify/play/', { track_id: track.id, device_id: deviceId });
      }
    } catch (err) {
      console.error("Failed to play track", err);
    }
  };

  const updateVolume = (val: number) => {
    setLocalVolume(val);
    if (player) player.setVolume(val / 100);
  };

  const reorderToTop = async (track: any) => {
    // Basic reorder: add to front
    // In a full app we'd have a 'position' field, for MVP we re-add
    if (currentUser?.id !== room?.admin) return;
    try {
      // Implementation depends on how we want to handle reordering 
      // For now, let's just log it
      console.log("Reordering track to top:", track.title);
    } catch (err) {
      console.error("Reorder failed", err);
    }
  };

  const fetchQueue = async () => {
    try {
      const playlistRes = await api.get('playlists/');
      setQueue(playlistRes.data.filter((p: any) => p.room === parseInt(id as string)).map((p: any) => ({
          ...p.track_detail,
          playlist_id: p.id
      })));
    } catch (err) {
      console.error("Failed to fetch queue", err);
    }
  };

  const removeFromQueue = async (playlistId: number) => {
    if (currentUser?.id !== room?.admin) return;
    try {
      await api.delete(`playlists/${playlistId}/`);
      fetchQueue();
    } catch (err) {
      console.error("Remove failed", err);
    }
  };

  const connectSpotify = async () => {
    try {
      const res = await api.get('spotify/login/');
      window.location.href = res.data.url;
    } catch (err) {
      console.error("Failed to get Spotify login URL", err);
    }
  };

  const searchSpotify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!spotifyQuery.trim()) return;
    setSearching(true);
    try {
      console.log("Searching for:", spotifyQuery);
      const res = await api.get(`spotify/search/?q=${encodeURIComponent(spotifyQuery)}`);
      console.log("Search results:", res.data);
      setSpotifyResults(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setSearching(false);
    }
  };

  const addToQueue = async (track: any) => {
    try {
      await api.post('playlists/', { room: room.id, track: track.id });
      // Update local queue or wait for next fetch
      setQueue(prev => [...prev, track]);
    } catch (err) {
      console.error("Failed to add to queue", err);
    }
  };

  const syncPlayback = useCallback((state: any) => {
    if (!ws || !room || currentUser?.id !== room.admin) return;
    
    // Only broadcast if there's a significant change to prevent loops
    const now = Date.now();
    if (now - lastSyncRef.current < 2000) return;
    lastSyncRef.current = now;

    ws.send(JSON.stringify({
      type: 'playback_sync',
      track_id: state.track_window.current_track.id,
      timestamp_ms: state.position,
      is_playing: !state.paused
    }));
  }, [ws, room, currentUser]);

  useEffect(() => {
    async function init() {
      try {
        const userRes = await api.get('users/me/');
        setCurrentUser(userRes.data);
        
        const roomRes = await api.get(`rooms/${id}/`);
        setRoom(roomRes.data);
        
        // Load Spotify SDK if connected
        if (userRes.data.is_spotify_connected) {
          await loadSpotifySDK();
          // We need the user's Spotify access token from backend
          const tokenRes = await api.get('spotify/refresh/'); // This effectively gets a fresh token
          const token = tokenRes.data.access_token;
          
            const spotifyPlayer = initializeSpotifyPlayer(
            token,
            (playerInstance) => {
              playerInstance.addListener('ready', ({ device_id }) => {
                console.log('Ready with Device ID', device_id);
                setDeviceId(device_id);
                api.post('spotify/transfer/', { device_id }).catch(err => console.error("Transfer failed", err));
              });
              
              playerInstance.addListener('not_ready', ({ device_id }) => {
                console.log('Device ID has gone offline', device_id);
                setDeviceId(null);
              });

              playerInstance.addListener('initialization_error', ({ message }) => { console.error(message); });
              playerInstance.addListener('authentication_error', ({ message }) => { console.error(message); });
              playerInstance.addListener('account_error', ({ message }) => { 
                console.error(message);
                // Potential Premium error
              });

              setIsPlaybackReady(true);
            },
            (state) => {
              setPlaybackState(state);
              // If Admin, broadcast state
              if (userRes.data.id === roomRes.data.admin) {
                // We'll call syncPlayback via an effect or direct
              }
            }
          );
          setPlayer(spotifyPlayer);
        }

        const msgRes = await api.get('messages/');
        setMessages(msgRes.data.filter((m: any) => m.room === parseInt(id as string)));

        const playlistRes = await api.get('playlists/');
        setQueue(playlistRes.data.filter((p: any) => p.room === parseInt(id as string)).map((p: any) => p.track_detail));

        const moodRes = await api.get(`spotify/mood-tracks/?mood=${roomRes.data.theme || 'happy'}`);
        setMoodTracks(moodRes.data);

      } catch (err) {
        console.error("Initialization failed", err);
      }
    }
    
    init();
    
    const fetchQueue = async () => {
      try {
        const playlistRes = await api.get('playlists/');
        setQueue(playlistRes.data.filter((p: any) => p.room === parseInt(id as string)).map((p: any) => p.track_detail));
      } catch (err) {
        console.error("Failed to fetch queue", err);
      }
    };
    
    // Periodically fetch queue as fallback
    const queueInterval = setInterval(fetchQueue, 10000);

    const socket = new WebSocket(`ws://localhost:8000/ws/room/${id}/`);
    setWs(socket);

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'chat_message') {
        setMessages(prev => [...prev, data]);
      } else if (data.type === 'queue_update') {
        fetchQueue();
      } else if (data.type === 'playback_sync') {
        if (currentUser?.id !== room?.admin && player) {
          handleRemoteSync(data);
        }
      }
    };
    
    const handleRemoteSync = async (data: any) => {
      // Sync logic for followers
      if (!player) return;
      const state = await player.getCurrentState();
      if (!state || state.track_window.current_track.id !== data.track_id) {
        // Play the track if different
        api.post('spotify/play/', { track_id: data.track_id, device_id: deviceId });
      }
      // Seek if difference > 3s
      if (state && Math.abs(state.position - data.timestamp_ms) > 3000) {
        player.seek(data.timestamp_ms);
      }
      // Pause/Play
      if (state && state.paused === data.is_playing) {
        data.is_playing ? player.resume() : player.pause();
      }
    };

    return () => {
      socket.close();
      if (player) player.disconnect();
      clearInterval(queueInterval);
    };
  }, [id]);

  const handleRemoteSync = (data: any) => {
    // If different track, play it
    // If different pause state, toggle
    // If significantly different time, seek
    // This is complex logic, for MVP we focus on basic play/pause/track change
  };

  const skipToNext = () => {
    if (currentUser?.id === room?.admin) {
      handleNextSong();
    }
  };

  const handleNextSong = async () => {
    if (queue.length === 0) return;
    const nextTrack = queue[0];
    try {
      // Logic to play next track and remove it from queue
      await api.post('spotify/play/', { track_id: nextTrack.id, device_id: deviceId });
      // Remove from backend playlist (not fully implemented, usually we'd delete it)
      // For now we slice it locally to trigger transition
      setQueue(prev => prev.slice(1));
    } catch (err) {
      console.error("Auto play failed", err);
    }
  };

  useEffect(() => {
    if (playbackState && room && currentUser?.id === room.admin) {
      syncPlayback(playbackState);
      
      const isEnd = playbackState.position === 0 && 
                    playbackState.paused && 
                    wasPlayingRef.current && 
                    !playbackState.loading;
      
      if (isEnd) {
        console.log("Song ended, moving to next...");
        handleNextSong();
      }
      
      wasPlayingRef.current = !playbackState.paused;
      currentTrackIdRef.current = playbackState.track_window?.current_track?.id || null;
    }
  }, [playbackState, syncPlayback, room, currentUser]);

  const togglePlayback = () => {
    if (!player) return;
    player.togglePlay();
  };

  if (!room) return <div className="flex items-center justify-center min-h-screen bg-[#0a0a0c]"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#ff7e5f]"></div></div>;

  return (
    <div className="flex flex-col lg:flex-row gap-6 p-4 lg:p-8 h-screen bg-[#070708] text-white">
      
      {/* Sidebar: Search & Queue */}
      <div className="w-full lg:w-80 flex flex-col gap-6 flex-shrink-0">
        
        {/* Spotify Connection */}
        {!currentUser?.is_spotify_connected && (
          <div className="glass-card p-6 rounded-3xl bg-gradient-to-br from-[#1DB954]/20 to-black/40 border border-[#1DB954]/30">
            <h3 className="text-sm font-bold text-[#1DB954] mb-2 uppercase tracking-widest">Premium Required</h3>
            <p className="text-xs text-gray-400 mb-4">Connect Spotify Premium to listen and sync with the room.</p>
            <button 
              onClick={connectSpotify}
              className="w-full bg-[#1DB954] hover:bg-[#1ed760] text-black font-bold py-3 rounded-full flex items-center justify-center gap-2 transition-all transform hover:scale-105"
            >
              <Music size={16} /> Connect Spotify
            </button>
          </div>
        )}

        {/* Discovery/Search */}
        <div className="glass-card flex-1 min-h-0 flex flex-col rounded-3xl">
          <div className="p-4 border-b border-white/5">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Music size={12} className="text-[#ff7e5f]" /> Find Music
            </h2>
          </div>
          <div className="p-4">
            <form onSubmit={searchSpotify} className="relative">
              <input 
                type="text" 
                className="w-full bg-black/40 border border-white/10 rounded-xl pl-4 pr-10 py-2.5 text-sm focus:ring-2 focus:ring-[#ff7e5f] outline-none"
                placeholder="Artists, songs..."
                value={spotifyQuery}
                onChange={(e) => setSpotifyQuery(e.target.value)}
              />
              <button type="submit" className="absolute right-3 top-2.5 text-gray-500 hover:text-white">
                <Search size={18} />
              </button>
            </form>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 pt-0 space-y-4 custom-scrollbar">
            {/* Mood Recommendations */}
            {moodTracks.length > 0 && !spotifyQuery && (
              <div className="mb-6">
                <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3 px-2">Mood Picks ({room.theme})</h3>
                <div className="space-y-3">
                  {moodTracks.map(track => (
                    <div key={track.id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 transition-colors group">
                      <img src={track.album_art} className="w-10 h-10 rounded-lg shadow-lg" alt={track.title} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold truncate">{track.title}</p>
                          {track.id.startsWith('mock') && <span className="text-[8px] bg-white/10 px-1 py-0.5 rounded text-gray-500">SIMULATED</span>}
                        </div>
                        <p className="text-xs text-gray-500 truncate">{track.artist}</p>
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                        <button onClick={() => playTrack(track)} className="p-2 bg-[#1DB954] rounded-full hover:bg-[#1ed760]"><Play size={10} fill="currentColor" /></button>
                        <button onClick={() => addToQueue(track)} className="p-2 bg-[#ff7e5f] rounded-full hover:bg-[#feb47b]"><Plus size={10} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Search Results */}
            {spotifyResults.map(track => (
              <div key={track.id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 transition-colors group">
                <img src={track.album_art} className="w-10 h-10 rounded-lg shadow-lg" alt={track.title} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold truncate">{track.title}</p>
                    {track.id.startsWith('mock') && <span className="text-[8px] bg-white/10 px-1 py-0.5 rounded text-gray-500">SIMULATED</span>}
                  </div>
                  <p className="text-xs text-gray-500 truncate">{track.artist}</p>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                  <button 
                    onClick={() => playTrack(track)}
                    className="p-2 bg-[#1DB954] rounded-full hover:bg-[#1ed760] transition-all"
                    title="Play Now"
                  >
                    <Play size={12} fill="currentColor" />
                  </button>
                  <button 
                    onClick={() => addToQueue(track)}
                    className="p-2 bg-[#ff7e5f] rounded-full hover:bg-[#feb47b] transition-all"
                    title="Add to Queue"
                  >
                    <Plus size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Queue */}
        <div className="glass-card h-64 flex flex-col rounded-3xl">
          <div className="p-4 border-b border-white/5 flex justify-between items-center">
            <h2 className="text-sm font-bold uppercase tracking-widest text-gray-500">Up Next</h2>
            <span className="text-xs bg-white/5 px-2 py-0.5 rounded-full text-gray-400">{queue.length}</span>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar text-xs">
            {queue.map((item, i) => (
              <div key={i} className="flex items-center gap-3 group">
                <span className="text-gray-600 w-4">{i + 1}</span>
                <span className="flex-1 truncate font-medium">{item.title}</span>
                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-all">
                  {currentUser?.id === room?.admin && (
                    <>
                      <button 
                        onClick={() => reorderToTop(item)}
                        className="p-2 text-gray-400 hover:text-[#ff7e5f] hover:bg-white/5 rounded-full transition-all"
                        title="Move to Top"
                      >
                        <ArrowUp size={16} />
                      </button>
                      <button 
                        onClick={() => removeFromQueue(item.id)}
                        className="p-2 text-gray-400 hover:text-red-500 hover:bg-white/5 rounded-full transition-all"
                        title="Remove from Queue"
                      >
                        <Trash2 size={16} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main Player & Chat */}
      <div className="flex-1 flex flex-col gap-6 min-w-0">
        
        {/* Player Section */}
        <div className="glass-card p-8 rounded-[2rem] relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-[#ff7e5f]/10 to-transparent opacity-50 group-hover:opacity-70 transition-opacity" />
          
          <div className="relative z-10 flex flex-col md:flex-row items-center gap-10">
            <div className="relative group/art shrink-0">
              <div className="absolute -inset-4 bg-gradient-to-tr from-[#ff7e5f] to-[#feb47b] rounded-[2.5rem] blur-2xl opacity-20 group-hover/art:opacity-40 transition-opacity animate-pulse" />
              {playbackState?.track_window?.current_track?.album?.images[0]?.url ? (
                <img 
                  src={playbackState.track_window.current_track.album.images[0].url} 
                  className={`w-64 h-64 rounded-[2rem] object-cover shadow-2xl relative z-10 transition-transform duration-700 ${!playbackState.paused ? 'scale-105 rotate-3' : 'scale-100'}`}
                  alt="Current Track"
                />
              ) : (
                <div className="w-64 h-64 rounded-[2rem] bg-black/40 flex items-center justify-center relative z-10 border border-white/10">
                  <Music size={80} className="text-gray-700" />
                </div>
              )}
            </div>

            <div className="flex-1 text-center md:text-left min-w-0">
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 mb-4">
                <span className="px-4 py-1 bg-white/5 text-[10px] font-bold uppercase tracking-[0.2em] rounded-full text-[#ff7e5f] border border-[#ff7e5f]/20">
                  {room.theme} Session
                </span>
                <div className="flex items-center gap-1 text-[10px] text-gray-500">
                  <Users size={12} /> {room.memberships?.length || 1} Listening
                </div>
                {!deviceId && currentUser?.is_spotify_connected && (
                  <span className="text-[10px] text-yellow-500 font-bold animate-pulse">
                    ● Connect Spotify Player...
                  </span>
                )}
              </div>

              <h1 className="text-5xl font-black mb-2 tracking-tight truncate">
                {playbackState?.track_window?.current_track?.name || room.name}
              </h1>
              <p className="text-xl text-gray-400 font-medium truncate mb-8">
                {playbackState?.track_window?.current_track?.artists[0]?.name || room.description}
              </p>

              {/* Progress */}
              <div className="mb-8 max-w-xl mx-auto md:mx-0">
                <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-[#ff7e5f] to-[#feb47b] transition-all duration-1000" 
                    style={{ width: `${(playbackState?.position / playbackState?.duration) * 100 || 0}%` }}
                  />
                </div>
                <div className="flex justify-between mt-2 text-[10px] font-mono text-gray-500 uppercase tracking-widest">
                  <span>{Math.floor((playbackState?.position || 0) / 60000)}:{String(Math.floor(((playbackState?.position || 0) % 60000) / 1000)).padStart(2, '0')}</span>
                  <span>{Math.floor((playbackState?.duration || 0) / 60000)}:{String(Math.floor(((playbackState?.duration || 0) % 60000) / 1000)).padStart(2, '0')}</span>
                </div>
              </div>

              {/* Controls */}
              <div className="flex items-center justify-center md:justify-start gap-6">
                <button className="text-gray-400 hover:text-white transition-colors">
                  <SkipBack size={24} />
                </button>
                <div className="relative">
                  <button 
                    onClick={togglePlayback}
                    disabled={!deviceId}
                    className={`w-16 h-16 rounded-full flex items-center justify-center transition-all shadow-xl ${
                      deviceId ? 'bg-white text-black hover:scale-110' : 'bg-white/10 text-gray-600 cursor-not-allowed'
                    }`}
                  >
                    {playbackState?.paused ? <Play size={28} fill="currentColor" className="translate-x-0.5" /> : <Pause size={28} fill="currentColor" />}
                  </button>
                  {!deviceId && currentUser?.is_spotify_connected && (
                    <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 w-48 text-center text-[9px] text-yellow-500 uppercase tracking-tighter">
                      Open Spotify app to activate player
                    </div>
                  )}
                </div>
                <button 
                  onClick={skipToNext}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  <SkipForward size={24} />
                </button>
                <div className="hidden md:flex items-center gap-3 ml-4 pl-6 border-l border-white/10 text-gray-500">
                  <Volume2 size={18} />
                  <input 
                    type="range" 
                    min="0" max="100" 
                    value={localVolume}
                    onChange={(e) => updateVolume(parseInt(e.target.value))}
                    className="w-24 h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-[#ff7e5f]"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Chat & Participants */}
        <div className="flex-1 flex gap-6 min-h-0">
          {/* Chat */}
          <div className="glass-card flex-1 flex flex-col min-h-0 rounded-[2rem]">
            <div className="p-4 border-b border-white/5 flex items-center justify-between">
              <h3 className="font-bold text-sm tracking-widest uppercase text-gray-500">Live Chat</h3>
              <div className="flex -space-x-2">
                {[1, 2, 3].map(i => (
                  <div key={i} className="w-6 h-6 rounded-full border-2 border-[#0a0a0c] bg-gradient-to-br from-gray-700 to-gray-800" />
                ))}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
              {messages.map((msg, i) => {
                const isMe = msg.user_id === currentUser?.id || msg.user_name === currentUser?.username;
                return (
                  <div key={i} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                    <span className="text-[10px] text-gray-600 mb-1 px-1 font-bold uppercase tracking-wider">{msg.user_name || 'Listener'}</span>
                    <div className={`px-4 py-2.5 rounded-2xl max-w-[85%] text-sm ${
                      isMe 
                        ? 'bg-gradient-to-r from-[#ff7e5f] to-[#feb47b] text-white shadow-lg shadow-[#ff7e5f]/10 rounded-tr-none' 
                        : 'bg-white/5 text-gray-200 rounded-tl-none'
                    }`}>
                      {msg.content}
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
            <div className="p-4 pt-0">
              <form onSubmit={(e) => { e.preventDefault(); if (newMessage.trim()) { ws?.send(JSON.stringify({ type: 'chat_message', content: newMessage, user_id: currentUser?.id, user_name: currentUser?.username })); setNewMessage(''); }}} className="relative">
                <input 
                  type="text" 
                  className="w-full bg-black/40 border border-white/10 rounded-2xl pl-4 pr-12 py-3.5 text-sm focus:ring-2 focus:ring-[#ff7e5f] outline-none"
                  placeholder="Say something..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                />
                <button type="submit" className="absolute right-3 top-2.5 p-1 text-[#ff7e5f] hover:scale-110 transition-transform">
                  <Send size={20} />
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>

      <style jsx global>{`
        .glass-card {
          background: rgba(255, 255, 255, 0.03);
          backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.05);
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 20px;
        }
      `}</style>
    </div>
  );
}
