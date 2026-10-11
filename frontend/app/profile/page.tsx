"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { User as UserIcon, Library, Disc, Music, Loader2 } from 'lucide-react';
import api, { getErrorMessage } from '@/lib/api';
import { isLoggedIn } from '@/lib/auth';
import { connectSpotify } from '@/lib/spotifyConnect';
import type { User } from '@/lib/types';

interface HistoryRecord {
  id: number;
  timestamp: string;
  track_detail?: { title: string; artist: string; album_art: string | null };
}

export default function Profile() {
  const router = useRouter();
  const [profile, setProfile] = useState<User | null>(null);
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isLoggedIn()) {
      router.replace('/login?next=/profile');
      return;
    }
    Promise.all([api.get<User>('users/me/'), api.get<HistoryRecord[]>('history/')])
      .then(([userRes, historyRes]) => {
        setProfile(userRes.data);
        setHistory(historyRes.data);
      })
      .catch(() => router.replace('/login?next=/profile'))
      .finally(() => setLoading(false));
  }, [router]);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      await connectSpotify('/profile');
    } catch (err) {
      setError(getErrorMessage(err, 'Could not start Spotify sign-in.'));
      setConnecting(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 size={40} className="animate-spin text-accent" /></div>;
  }
  if (!profile) return null;

  const fullName = [profile.first_name, profile.last_name].filter(Boolean).join(' ');

  return (
    <div className="max-w-4xl mx-auto py-4 sm:py-8 space-y-8">
      <div className="glass-card rounded-3xl p-6 sm:p-8 flex flex-col sm:flex-row items-center sm:items-start gap-6 sm:gap-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-accent/20 to-accent-2/20 blur-3xl rounded-full -mr-20 -mt-20 pointer-events-none" />
        <div className="w-28 h-28 rounded-full bg-black/40 border-2 border-accent flex items-center justify-center p-1 relative shrink-0">
          {profile.profile_photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.profile_photo} alt="" className="w-full h-full rounded-full object-cover" />
          ) : (
            <UserIcon size={56} className="text-gray-500" />
          )}
        </div>

        <div className="relative flex-1 text-center sm:text-left min-w-0">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-gradient truncate">{fullName || profile.username}</h1>
          <p className="text-gray-400 mt-1">@{profile.username} · {profile.email}</p>

          <div className="mt-5 flex flex-wrap justify-center sm:justify-start items-center gap-3">
            {profile.is_spotify_connected ? (
              <span className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-spotify/10 text-spotify border border-spotify/20 text-xs font-bold">
                <Disc size={14} className="animate-spin-slow" /> Spotify connected
              </span>
            ) : (
              <button onClick={handleConnect} disabled={connecting}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-spotify hover:bg-[#1ed760] text-black font-bold text-sm transition-colors disabled:opacity-60">
                {connecting ? <Loader2 size={14} className="animate-spin" /> : <Music size={14} />} Connect Spotify
              </button>
            )}
            {(profile.music_preferences || []).map((pref) => (
              <span key={pref} className="px-3 py-1 bg-white/10 rounded-full text-xs font-semibold">{pref}</span>
            ))}
          </div>
          {error && <p className="text-red-300 text-sm mt-3">{error}</p>}
        </div>
      </div>

      <div className="glass-card rounded-3xl p-6 sm:p-8">
        <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
          <Library className="text-accent" /> Recently played
        </h2>

        {history.length === 0 ? (
          <div className="text-center py-10 text-gray-500">
            <Disc size={48} className="mx-auto mb-4 opacity-20" />
            <p>Nothing here yet. Join a room and press play.</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {history.map((record) => (
              <li key={record.id} className="flex items-center gap-4 p-3 rounded-2xl bg-white/5 hover:bg-white/10 transition-colors">
                {record.track_detail?.album_art ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={record.track_detail.album_art} alt="" className="w-12 h-12 rounded-xl object-cover" />
                ) : (
                  <div className="w-12 h-12 bg-black/30 rounded-xl flex items-center justify-center">
                    <Music size={20} className="text-gray-400" />
                  </div>
                )}
                <div className="min-w-0">
                  <h3 className="font-bold truncate">{record.track_detail?.title || 'Unknown track'}</h3>
                  <p className="text-sm text-gray-400 truncate">{record.track_detail?.artist || 'Unknown artist'}</p>
                </div>
                <time className="ml-auto text-xs text-gray-500 text-right shrink-0" dateTime={record.timestamp}>
                  {new Date(record.timestamp).toLocaleDateString()}<br />
                  {new Date(record.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </time>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
