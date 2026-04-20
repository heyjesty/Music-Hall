"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { User, Library, Disc, Music } from 'lucide-react';

export default function Profile() {
  const router = useRouter();
  const [profile, setProfile] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchProfileData() {
      try {
        const userRes = await api.get('users/me/');
        setProfile(userRes.data);
        
        const historyRes = await api.get('history/');
        setHistory(historyRes.data);
      } catch (err) {
        console.error(err);
        router.push('/login');
      } finally {
        setLoading(false);
      }
    }
    fetchProfileData();
  }, [router]);

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#ff7e5f]"></div></div>;
  if (!profile) return null;

  return (
    <div className="max-w-4xl mx-auto py-8">
      
      {/* Profile Header */}
      <div className="glass-card rounded-3xl p-8 mb-8 flex items-center gap-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-[#ff7e5f]/20 to-[#feb47b]/20 blur-3xl rounded-full -mr-20 -mt-20 pointer-events-none" />
        
        <div className="w-32 h-32 rounded-full bg-black/40 border-2 border-[#ff7e5f] flex items-center justify-center p-1 relative z-10">
          {profile.profile_photo ? (
            <img src={profile.profile_photo} alt="Profile" className="w-full h-full rounded-full object-cover" />
          ) : (
            <User size={64} className="text-gray-500" />
          )}
        </div>
        
        <div className="relative z-10">
          <h1 className="text-4xl font-extrabold mb-1 text-gradient">{profile.username}</h1>
          <p className="text-gray-400 mb-4">{profile.email}</p>
          
          <div className="flex gap-2">
            {(profile.music_preferences || []).map((pref: string, i: number) => (
              <span key={i} className="px-3 py-1 bg-white/10 rounded-full text-xs font-semibold">
                {pref}
              </span>
            ))}
            {(!profile.music_preferences || profile.music_preferences.length === 0) && (
              <span className="px-3 py-1 bg-white/5 rounded-full text-xs text-gray-500">No preferences set</span>
            )}
          </div>
        </div>
      </div>

      {/* Listening History */}
      <div className="glass-card rounded-3xl p-8">
        <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
          <Library className="text-[#ff7e5f]" /> Listening History
        </h2>
        
        {history.length === 0 ? (
          <div className="text-center py-10 text-gray-500">
            <Disc size={48} className="mx-auto mb-4 opacity-20" />
            <p>Your listening history is empty. Go join a room and discover some vibes!</p>
          </div>
        ) : (
          <div className="space-y-4">
            {history.map((record: any) => (
              <div key={record.id} className="flex items-center gap-4 p-4 rounded-2xl bg-white/5 hover:bg-white/10 transition-colors">
                <div className="w-12 h-12 bg-black/30 rounded-xl flex items-center justify-center">
                  <Music size={20} className="text-gray-400" />
                </div>
                <div>
                  <h3 className="font-bold">{record.track_detail?.title || "Unknown Track"}</h3>
                  <p className="text-sm text-gray-400">{record.track_detail?.artist || "Unknown Artist"}</p>
                </div>
                <div className="ml-auto text-sm text-gray-500 text-right">
                  <p>{new Date(record.timestamp).toLocaleDateString()}</p>
                  <p className="text-xs">{new Date(record.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
