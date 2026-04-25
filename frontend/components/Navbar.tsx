"use client";

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Music, User, Disc, LogOut } from 'lucide-react';
import { useEffect, useState } from 'react';

export default function Navbar() {
  const router = useRouter();
  const [guestName, setGuestName] = useState<string | null>(null);
  const [guestUsername, setGuestUsername] = useState<string | null>(null);

  const readGuest = () => {
    setGuestName(localStorage.getItem('guest_name'));
    setGuestUsername(localStorage.getItem('guest_username'));
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    readGuest();
    // Listen for same-tab login (fired by onboarding page)
    window.addEventListener('guest-login', readGuest);
    // Listen for cross-tab storage changes
    window.addEventListener('storage', readGuest);
    return () => {
      window.removeEventListener('guest-login', readGuest);
      window.removeEventListener('storage', readGuest);
    };
  }, []);

  const handleLeave = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('guest_name');
    localStorage.removeItem('guest_username');
    localStorage.removeItem('guest_id');
    setGuestName(null);
    setGuestUsername(null);
    router.push('/onboarding');
  };

  return (
    <nav className="glass sticky top-0 z-50 w-full px-6 py-4 flex items-center justify-between">
      <Link href="/" className="flex items-center gap-2 group">
        <div className="p-2 rounded-full bg-gradient-to-tr from-[#ff7e5f] to-[#feb47b] group-hover:scale-110 transition-transform">
          <Music size={20} className="text-white" />
        </div>
        <span className="text-xl font-bold tracking-wider text-gradient">Music Hall</span>
      </Link>

      <div className="flex items-center gap-3">
        {guestName ? (
          <>
            {/* User chip */}
            <div className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-full glass-card border border-white/10">
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[#ff7e5f] to-[#feb47b] flex items-center justify-center text-[10px] font-black text-white">
                {guestName.charAt(0).toUpperCase()}
              </div>
              <span className="text-sm font-medium text-white">{guestName}</span>
              {guestUsername && (
                <span className="text-[10px] text-gray-500 font-mono">@{guestUsername}</span>
              )}
            </div>

            {/* Leave / switch user */}
            <button
              id="navbar-leave-btn"
              onClick={handleLeave}
              title="Switch user"
              className="flex items-center gap-2 px-3 py-2 rounded-full bg-white/5 border border-white/10 text-gray-400 hover:text-red-400 hover:border-red-400/30 transition-colors text-sm"
            >
              <LogOut size={15} />
              <span className="hidden sm:inline text-xs font-medium">Leave</span>
            </button>
          </>
        ) : (
          <Link
            href="/onboarding"
            id="navbar-enter-btn"
            className="flex items-center gap-2 px-6 py-2 rounded-full bg-gradient-to-r from-[#ff7e5f] to-[#feb47b] text-white hover:opacity-90 transition-opacity font-medium shadow-lg"
          >
            <User size={16} />
            <span>Enter</span>
          </Link>
        )}
      </div>
    </nav>
  );
}
