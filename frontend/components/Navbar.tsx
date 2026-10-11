"use client";

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Music, LogIn, LogOut, User, Disc, Plus } from 'lucide-react';
import { clearTokens } from '@/lib/auth';
import { useCurrentUser } from '@/lib/useCurrentUser';

export default function Navbar() {
  const router = useRouter();
  const { user, loading } = useCurrentUser();

  const handleLogout = () => {
    clearTokens();
    router.push('/login');
  };

  return (
    <nav className="glass sticky top-0 z-50 w-full">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
        <Link href="/" className="flex items-center gap-2 group shrink-0" aria-label="Music Hall home">
          <div className="p-2 rounded-full bg-gradient-to-tr from-accent to-accent-2 group-hover:scale-110 transition-transform">
            <Music size={18} className="text-white" />
          </div>
          <span className="text-lg font-bold tracking-wide text-gradient">Music Hall</span>
        </Link>

        <div className="flex items-center gap-2 sm:gap-3">
          {loading ? null : user ? (
            <>
              {user.is_spotify_connected && (
                <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-spotify/10 text-spotify border border-spotify/20">
                  <Disc size={14} className="animate-spin-slow" />
                  <span className="text-[10px] font-bold uppercase tracking-widest">Spotify connected</span>
                </div>
              )}
              <Link
                href="/rooms/create"
                className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-full glass-card hover:bg-white/10 transition-colors text-sm font-medium"
              >
                <Plus size={16} /> New room
              </Link>
              <Link
                href="/profile"
                className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-full glass-card hover:bg-white/10 transition-colors"
                aria-label="Profile"
              >
                <User size={16} />
                <span className="hidden sm:inline text-sm font-medium max-w-[10rem] truncate">{user.username}</span>
              </Link>
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-full text-gray-300 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                aria-label="Log out"
              >
                <LogOut size={16} />
                <span className="hidden sm:inline text-sm font-medium">Log out</span>
              </button>
            </>
          ) : (
            <>
              <Link href="/signup" className="hidden sm:inline text-sm font-medium text-gray-300 hover:text-white px-3">
                Create account
              </Link>
              <Link href="/login" className="btn-primary !rounded-full !py-2 text-sm">
                <LogIn size={16} /> Sign in
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
