"use client";

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Play, Users, Disc, Shuffle, Search, Radio, MessageCircle, ListMusic, Loader2 } from 'lucide-react';
import api, { getErrorMessage } from '@/lib/api';
import { isLoggedIn } from '@/lib/auth';
import { THEMES, themeLabel, type Room } from '@/lib/types';

const FEATURES = [
  { icon: Radio, title: 'Synced playback', body: 'The host controls the music and every listener stays on the same beat.' },
  { icon: ListMusic, title: 'Shared queue', body: 'Search Spotify, add tracks, and let the room build the vibe together.' },
  { icon: MessageCircle, title: 'Live chat', body: 'React to every drop in real time without leaving the room.' },
];

export default function Home() {
  const router = useRouter();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [themeFilter, setThemeFilter] = useState<string>('ALL');
  const [joiningRandom, setJoiningRandom] = useState(false);

  useEffect(() => {
    api.get<Room[]>('rooms/')
      .then((res) => setRooms(res.data))
      .catch((err) => setError(getErrorMessage(err, 'Could not load rooms.')))
      .finally(() => setLoading(false));
  }, []);

  const visibleRooms = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rooms.filter((room) =>
      (themeFilter === 'ALL' || room.theme === themeFilter) &&
      (!q || room.name.toLowerCase().includes(q) || room.description?.toLowerCase().includes(q)),
    );
  }, [rooms, query, themeFilter]);

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
    <div className="space-y-16 pb-12">
      {/* Hero */}
      <section className="relative py-16 sm:py-24 px-6 overflow-hidden rounded-[2rem] sm:rounded-[2.5rem] bg-gradient-to-br from-white/5 to-transparent border border-white/10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,126,95,0.18),transparent_55%)] pointer-events-none" />
        <div className="max-w-3xl mx-auto text-center relative z-10">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 mb-8">
            <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
            <span className="text-xs font-bold uppercase tracking-widest text-gray-300">Social listening, in sync</span>
          </div>
          <h1 className="text-5xl sm:text-7xl font-black mb-6 tracking-tight leading-[1.05]">
            Listen <span className="text-gradient">together</span>,<br className="hidden sm:block" /> wherever you are
          </h1>
          <p className="text-base sm:text-lg text-gray-400 max-w-xl mx-auto mb-10 leading-relaxed">
            Open a room, queue tracks from Spotify, and share every moment with friends in real time.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/rooms/create"
              className="px-8 py-4 rounded-full font-bold bg-white text-black hover:scale-[1.03] active:scale-95 transition-transform shadow-[0_0_40px_rgba(255,255,255,0.15)]"
            >
              Start a room
            </Link>
            <button
              onClick={handleRandomJoin}
              disabled={joiningRandom}
              className="px-8 py-4 rounded-full font-bold glass-card hover:bg-white/10 transition-colors flex items-center justify-center gap-3 disabled:opacity-60"
            >
              {joiningRandom ? <Loader2 size={20} className="animate-spin" /> : <Shuffle size={20} className="text-accent" />}
              Join a random room
            </button>
          </div>
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

      {/* Rooms */}
      <section id="explore">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
          <div>
            <h2 className="text-3xl sm:text-4xl font-black flex items-center gap-3">
              <Disc className="text-accent animate-spin-slow" /> Live rooms
            </h2>
            <p className="text-gray-500 text-sm mt-1">
              {loading ? 'Loading rooms…' : `${rooms.length} room${rooms.length === 1 ? '' : 's'} open right now`}
            </p>
          </div>
          <div className="relative w-full md:w-72">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="search"
              className="input !pl-10 !py-2.5 text-sm"
              placeholder="Search rooms"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search rooms"
            />
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

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {loading && [0, 1, 2].map((i) => (
            <div key={i} className="glass-card rounded-[2rem] p-8 h-64 animate-pulse" />
          ))}

          {!loading && visibleRooms.map((room) => (
            <Link
              key={room.id}
              href={`/rooms/${room.id}`}
              className="group glass-card hover:bg-white/[0.06] transition-all duration-300 rounded-[2rem] p-7 hover:border-white/20 relative overflow-hidden flex flex-col"
            >
              <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-br from-accent/15 to-transparent blur-3xl rounded-full -mr-20 -mt-20 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="flex justify-between items-center mb-5 relative">
                <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] font-bold uppercase tracking-widest text-gray-300">
                  <span className={`w-1.5 h-1.5 rounded-full ${room.is_playing ? 'bg-spotify animate-pulse' : 'bg-gray-500'}`} />
                  {themeLabel(room.theme)}
                </span>
                <span className="flex items-center gap-1.5 text-xs text-gray-400">
                  <Users size={14} /> {room.member_count}
                </span>
              </div>
              <h3 className="text-2xl font-black mb-2 group-hover:text-accent transition-colors line-clamp-1">{room.name}</h3>
              <p className="text-gray-400 text-sm line-clamp-2 mb-6 leading-relaxed">
                {room.description || 'Drop in, add a track, and vibe with the room.'}
              </p>
              <div className="mt-auto flex items-center justify-between border-t border-white/5 pt-5">
                <div className="flex flex-col">
                  <span className="text-[9px] uppercase font-bold tracking-widest text-gray-600">Hosted by</span>
                  <span className="text-xs font-medium text-gray-300">@{room.admin_detail?.username ?? 'unknown'}</span>
                </div>
                <span className="px-5 py-2 rounded-2xl bg-accent/10 text-accent font-bold text-sm group-hover:bg-accent group-hover:text-white transition-colors flex items-center gap-2">
                  Join <Play size={14} fill="currentColor" />
                </span>
              </div>
            </Link>
          ))}

          {!loading && visibleRooms.length === 0 && !error && (
            <div className="col-span-full text-center py-16 text-gray-500">
              <Disc size={48} className="mx-auto mb-4 opacity-20" />
              {rooms.length === 0 ? (
                <p>No rooms yet. <Link href="/rooms/create" className="text-accent hover:underline">Be the first to start one.</Link></p>
              ) : (
                <p>No rooms match your filters.</p>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
