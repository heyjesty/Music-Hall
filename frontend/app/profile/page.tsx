"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Disc, Headphones, Loader2, Plus } from 'lucide-react';
import api from '@/lib/api';
import { isLoggedIn } from '@/lib/auth';
import { themeInfo, type Room, type User } from '@/lib/types';
import Avatar from '@/components/Avatar';

export default function Profile() {
  const router = useRouter();
  const [profile, setProfile] = useState<User | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isLoggedIn()) {
      router.replace('/login?next=/profile');
      return;
    }
    Promise.all([api.get<User>('users/me/'), api.get<Room[]>('rooms/', { params: { mine: 1 } })])
      .then(([userRes, roomsRes]) => {
        setProfile(userRes.data);
        setRooms(roomsRes.data);
      })
      .catch(() => router.replace('/login?next=/profile'))
      .finally(() => setLoading(false));
  }, [router]);

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 size={40} className="animate-spin text-accent" /></div>;
  }
  if (!profile) return null;

  const fullName = [profile.first_name, profile.last_name].filter(Boolean).join(' ');

  return (
    <div className="max-w-4xl mx-auto py-4 sm:py-8 space-y-8">
      <div className="glass-card rounded-3xl p-6 sm:p-8 flex flex-col sm:flex-row items-center gap-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-accent/20 to-accent-2/20 blur-3xl rounded-full -mr-20 -mt-20 pointer-events-none" />
        <Avatar name={profile.username} size={96} />
        <div className="relative flex-1 text-center sm:text-left min-w-0">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-gradient truncate">{fullName || profile.username}</h1>
          <p className="text-gray-400 mt-1">@{profile.username}{profile.email && ` · ${profile.email}`}</p>
        </div>
      </div>

      <div className="glass-card rounded-3xl p-6 sm:p-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">Your rooms</h2>
          <Link href="/rooms/create" className="btn-primary !py-2 !px-4 text-sm"><Plus size={16} /> New room</Link>
        </div>

        {rooms.length === 0 ? (
          <div className="text-center py-10 text-gray-500">
            <Disc size={48} className="mx-auto mb-4 opacity-20" />
            <p>You haven&apos;t created a room yet.</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {rooms.map((room) => {
              const theme = themeInfo(room.theme);
              return (
                <li key={room.id}>
                  <Link href={`/rooms/${room.id}`} className="flex items-center gap-4 p-4 rounded-2xl bg-white/5 hover:bg-white/10 transition-colors">
                    <span className="text-2xl w-10 text-center" aria-hidden>{theme.emoji}</span>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-bold truncate">{room.name}</h3>
                      <p className="text-sm text-gray-400 truncate">
                        {room.now_playing ? `${room.is_playing ? '▶' : '❚❚'} ${room.now_playing.title} · ${room.now_playing.artist}` : 'Nothing playing'}
                      </p>
                    </div>
                    <span className="text-xs text-gray-400 flex items-center gap-1 shrink-0"><Headphones size={12} /> {room.listener_count}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
