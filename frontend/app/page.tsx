"use client";

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Headphones, Disc, Shuffle, Search, Radio, MessageCircle, ListMusic, Loader2, Music, Crown } from 'lucide-react';
import api, { getErrorMessage } from '@/lib/api';
import { isLoggedIn } from '@/lib/auth';
import { THEMES, themeInfo, type Room } from '@/lib/types';

const FEATURES = [
  { icon: Radio, title: 'Everyone hears the same song', body: 'Walk into a room and you’re instantly in sync with everyone else — no accounts or apps needed.' },
  { icon: ListMusic, title: 'A queue the whole room builds', body: 'Search millions of songs and add them. The host keeps the vibe on track.' },
  { icon: MessageCircle, title: 'Chat while you listen', body: 'React to every drop in real time and see who’s in the room with you.' },
];

const REFRESH_MS = 15000;

export default function Home() {
  const router = useRouter();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [themeFilter, setThemeFilter] = useState<string>('ALL');
  const [joiningRandom, setJoiningRandom] = useState(false);

  useEffect(() => {
    const load = () => api.get<Room[]>('rooms/')
      .then((res) => {
        setRooms(res.data);
        setError('');
      })
      .catch((err) => setError(getErrorMessage(err, 'Could not load rooms.')))
      .finally(() => setLoading(false));
    load();
    const interval = setInterval(load, REFRESH_MS);
    return () => clearInterval(interval);
  }, []);

  const visibleRooms = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rooms
      .filter((room) =>
        (themeFilter === 'ALL' || room.theme === themeFilter) &&
        (!q || room.name.toLowerCase().includes(q) || room.description?.toLowerCase().includes(q)))
      // Busiest rooms first, then rooms with music on.
      .sort((a, b) => (b.listener_count - a.listener_count) || (Number(b.is_playing) - Number(a.is_playing)));
  }, [rooms, query, themeFilter]);

  const liveListeners = rooms.reduce((sum, r) => sum + r.listener_count, 0);

  const handleRandomJoin = async () => {
    if (!isLoggedIn()) {
      router.push('/login?next=/');
      return;
    }
    setJoiningRandom(true);
    try {
      const res = await api.get<{ room_id: number }>('random-room/');
      router.push(`/rooms/${res.data.room_id}`);
    } catch (err) {
      setError(getErrorMessage(err));
      setJoiningRandom(false);
    }
  };

  return (
    <div className="space-y-14 pb-12">
      {/* Hero */}
      <section className="relative py-16 sm:py-24 px-6 overflow-hidden rounded-[2rem] sm:rounded-[2.5rem] bg-gradient-to-br from-white/5 to-transparent border border-white/10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,126,95,0.18),transparent_55%)] pointer-events-none" />
        <div className="max-w-3xl mx-auto text-center relative z-10">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 mb-8">
            <span className="w-2 h-2 rounded-full bg-spotify animate-pulse" />
            <span className="text-xs font-bold uppercase tracking-widest text-gray-300">
              {liveListeners > 0 ? `${liveListeners} listening right now` : 'Live listening rooms'}
            </span>
          </div>
          <h1 className="text-5xl sm:text-7xl font-black mb-6 tracking-tight leading-[1.05]">
            Your music hall,<br className="hidden sm:block" /> <span className="text-gradient">open to everyone</span>
          </h1>
          <p className="text-base sm:text-lg text-gray-400 max-w-xl mx-auto mb-10 leading-relaxed">
            Create a room or walk into one. Everyone inside hears the same song at the same moment — and chats along.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/rooms/create"
              className="px-8 py-4 rounded-full font-bold bg-white text-black hover:scale-[1.03] active:scale-95 transition-transform shadow-[0_0_40px_rgba(255,255,255,0.15)]"
            >
              Create a room
            </Link>
            <button
              onClick={handleRandomJoin}
              disabled={joiningRandom}
              className="px-8 py-4 rounded-full font-bold glass-card hover:bg-white/10 transition-colors flex items-center justify-center gap-3 disabled:opacity-60"
            >
              {joiningRandom ? <Loader2 size={20} className="animate-spin" /> : <Shuffle size={20} className="text-accent" />}
              Surprise me
            </button>
          </div>
        </div>
      </section>

      {/* Rooms */}
      <section id="explore">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
          <div>
            <h2 className="text-3xl sm:text-4xl font-black flex items-center gap-3">
              <Disc className="text-accent animate-spin-slow" /> Rooms
            </h2>
            <p className="text-gray-500 text-sm mt-1">
              {loading ? 'Loading rooms…' : `${rooms.length} room${rooms.length === 1 ? '' : 's'} open · pick one and walk in`}
            </p>
          </div>
          <div className="relative w-full md:w-72">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
            <input type="search" className="input !pl-10 !py-2.5 text-sm" placeholder="Search rooms"
              value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search rooms" />
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2 mb-6 custom-scrollbar">
          {[{ value: 'ALL', label: 'All', emoji: '✨' }, ...THEMES].map((t) => (
            <button
              key={t.value}
              onClick={() => setThemeFilter(t.value)}
              className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                themeFilter === t.value
                  ? 'bg-accent text-white border-accent'
                  : 'border-white/10 text-gray-400 hover:text-white hover:border-white/30'
              }`}
            >
              <span className="mr-1.5">{t.emoji}</span>{t.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="mb-6 px-4 py-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm">{error}</div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {loading && [0, 1, 2].map((i) => <div key={i} className="glass-card rounded-[2rem] h-72 animate-pulse" />)}

          {!loading && visibleRooms.map((room) => <RoomCard key={room.id} room={room} />)}

          {!loading && visibleRooms.length === 0 && !error && (
            <div className="col-span-full text-center py-16 text-gray-500">
              <Disc size={48} className="mx-auto mb-4 opacity-20" />
              {rooms.length === 0 ? (
                <p>No rooms yet. <Link href="/rooms/create" className="text-accent hover:underline">Create the first one.</Link></p>
              ) : (
                <p>No rooms match your filters.</p>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Features */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {FEATURES.map(({ icon: Icon, title, body }) => (
          <div key={title} className="glass-card p-6 rounded-3xl">
            <div className="w-10 h-10 rounded-xl bg-accent/10 text-accent flex items-center justify-center mb-4">
              <Icon size={20} />
            </div>
            <h3 className="font-bold mb-1">{title}</h3>
            <p className="text-sm text-gray-400 leading-relaxed">{body}</p>
          </div>
        ))}
      </section>
    </div>
  );
}

function RoomCard({ room }: { room: Room }) {
  const theme = themeInfo(room.theme);
  const np = room.now_playing;
  return (
    <Link
      href={`/rooms/${room.id}`}
      className="group glass-card hover:bg-white/[0.06] hover:border-white/20 transition-all duration-300 rounded-[2rem] overflow-hidden flex flex-col"
    >
      <div className="relative h-32 overflow-hidden bg-gradient-to-br from-accent/25 via-accent-2/10 to-transparent">
        {np?.album_art && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={np.album_art} alt="" className="absolute inset-0 w-full h-full object-cover opacity-40 blur-md scale-110 group-hover:scale-125 transition-transform duration-700" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#111216] to-transparent" />
        <div className="absolute top-4 left-4 right-4 flex justify-between items-center">
          <span className="px-3 py-1 rounded-full bg-black/40 backdrop-blur border border-white/10 text-[11px] font-semibold text-gray-200">
            {theme.emoji} {theme.label}
          </span>
          <span className={`flex items-center gap-1.5 px-3 py-1 rounded-full backdrop-blur text-[11px] font-semibold ${
            room.listener_count > 0 ? 'bg-spotify/20 text-spotify' : 'bg-black/40 text-gray-400'
          }`}>
            <Headphones size={12} /> {room.listener_count} listening
          </span>
        </div>
        <div className="absolute bottom-3 left-4 right-4 flex items-center gap-3">
          {np?.album_art ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={np.album_art} alt="" className="w-11 h-11 rounded-lg object-cover shadow-lg" />
          ) : (
            <div className="w-11 h-11 rounded-lg bg-black/40 flex items-center justify-center"><Music size={18} className="text-gray-500" /></div>
          )}
          <div className="min-w-0 text-xs">
            {np ? (
              <>
                <p className="text-gray-400 flex items-center gap-1.5">
                  {room.is_playing && <span className="w-1.5 h-1.5 rounded-full bg-spotify animate-pulse" />}
                  {room.is_playing ? 'Now playing' : 'Paused'}
                </p>
                <p className="font-semibold text-white truncate">{np.title} · <span className="text-gray-300 font-normal">{np.artist}</span></p>
              </>
            ) : (
              <p className="text-gray-400">Quiet right now — start the music</p>
            )}
          </div>
        </div>
      </div>
      <div className="p-6 pt-4 flex flex-col flex-1">
        <h3 className="text-xl font-black mb-1 group-hover:text-accent transition-colors line-clamp-1">{room.name}</h3>
        <p className="text-gray-400 text-sm line-clamp-2 mb-5 leading-relaxed">
          {room.description || 'Drop in, add a song, and vibe with the room.'}
        </p>
        <div className="mt-auto flex items-center justify-between text-xs">
          <span className="text-gray-500 flex items-center gap-1.5"><Crown size={12} className="text-accent-2" /> {room.admin_detail?.username}</span>
          <span className="px-4 py-2 rounded-full bg-accent/10 text-accent font-bold group-hover:bg-accent group-hover:text-white transition-colors">
            Enter room
          </span>
        </div>
      </div>
    </Link>
  );
}
