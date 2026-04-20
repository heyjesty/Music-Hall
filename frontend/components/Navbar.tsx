"use client";

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Music, LogIn, LogOut, User, Disc } from 'lucide-react';
import { useEffect, useState } from 'react';
import api from '@/lib/api';

export default function Navbar() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const auth = !!localStorage.getItem('access_token');
      setIsAuthenticated(auth);
      if (auth) {
        api.get('users/me/').then(res => setUser(res.data)).catch(() => setIsAuthenticated(false));
      }
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    setIsAuthenticated(false);
    setUser(null);
    router.push('/login');
  };

  return (
    <nav className="glass sticky top-0 z-50 w-full px-6 py-4 flex items-center justify-between">
      <Link href="/" className="flex items-center gap-2 group">
        <div className="p-2 rounded-full bg-gradient-to-tr from-[#ff7e5f] to-[#feb47b] group-hover:scale-110 transition-transform">
          <Music size={20} className="text-white" />
        </div>
        <span className="text-xl font-bold tracking-wider text-gradient">Music Hall</span>
      </Link>

      <div className="flex items-center gap-4">
        {isAuthenticated ? (
          <>
            {user?.is_spotify_connected && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#1DB954]/10 text-[#1DB954] border border-[#1DB954]/20 hidden sm:flex">
                <Disc size={14} className="animate-spin-slow" />
                <span className="text-[10px] font-bold uppercase tracking-widest">Spotify Active</span>
              </div>
            )}
            <Link href="/profile" className="flex items-center gap-2 px-4 py-2 rounded-full glass-card hover:bg-white/10 transition-colors">
              <User size={18} />
              <span className="text-sm font-medium">Profile</span>
            </Link>
            <button 
              onClick={handleLogout}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
            >
              <LogOut size={18} />
              <span className="text-sm font-medium">Logout</span>
            </button>
          </>
        ) : (
          <Link href="/login" className="flex items-center gap-2 px-6 py-2 rounded-full bg-gradient-to-r from-[#ff7e5f] to-[#feb47b] text-white hover:opacity-90 transition-opacity font-medium shadow-lg">
            <LogIn size={18} />
            <span>Sign In</span>
          </Link>
        )}
      </div>

      <style jsx>{`
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .animate-spin-slow {
          animation: spin-slow 4s linear infinite;
        }
      `}</style>
    </nav>
  );
}
