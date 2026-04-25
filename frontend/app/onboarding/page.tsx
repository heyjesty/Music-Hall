"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Music, User, AtSign, Loader2, Headphones, Radio, Disc } from 'lucide-react';
import api from '@/lib/api';

export default function Onboarding() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'idle' | 'success'>('idle');

  // If already onboarded, redirect to home
  useEffect(() => {
    const token = localStorage.getItem('access_token');
    const guestName = localStorage.getItem('guest_name');
    if (token && guestName) {
      router.replace('/');
    }
  }, []);

  // Auto-generate username from name
  const handleNameChange = (val: string) => {
    setName(val);
    const generated = val.toLowerCase().replace(/\s+/g, '_').replace(/[^\w]/g, '').slice(0, 20);
    setUsername(generated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!name.trim()) { setError('Please enter your name'); return; }
    if (!username.trim()) { setError('Please enter a username'); return; }
    if (username.length < 3) { setError('Username must be at least 3 characters'); return; }

    setLoading(true);
    try {
      const res = await api.post('auth/guest-session/', { name: name.trim(), username: username.trim() });
      localStorage.setItem('access_token', res.data.access);
      localStorage.setItem('refresh_token', res.data.refresh);
      localStorage.setItem('guest_name', name.trim());
      localStorage.setItem('guest_username', res.data.user.username);
      localStorage.setItem('guest_id', String(res.data.user.id));
      // Notify Navbar (same tab) to refresh user info immediately
      window.dispatchEvent(new Event('guest-login'));
      setStep('success');
      
      const redirectTo = localStorage.getItem('redirect_after_onboarding');
      if (redirectTo) {
        localStorage.removeItem('redirect_after_onboarding');
        setTimeout(() => router.push(redirectTo), 1200);
      } else {
        setTimeout(() => router.push('/'), 1200);
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Something went wrong. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#070708] flex items-center justify-center px-4 relative overflow-hidden">
      {/* Ambient background orbs */}
      <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full bg-[#ff7e5f]/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full bg-[#feb47b]/8 blur-[100px] pointer-events-none" />

      <div className="w-full max-w-md relative z-10">
        {/* Logo */}
        <div className="flex flex-col items-center mb-10">
          <div className="relative mb-5">
            <div className="absolute inset-0 bg-gradient-to-tr from-[#ff7e5f] to-[#feb47b] rounded-full blur-xl opacity-50 scale-125" />
            <div className="relative p-5 rounded-full bg-gradient-to-tr from-[#ff7e5f] to-[#feb47b] shadow-2xl">
              <Music size={36} className="text-white" />
            </div>
          </div>
          <h1 className="text-4xl font-black tracking-tight text-white mb-1">Music Hall</h1>
          <p className="text-gray-500 text-sm text-center">Social listening, real-time vibes</p>
        </div>

        {/* Card */}
        <div className="glass-card rounded-[2rem] p-8 border border-white/10 shadow-2xl backdrop-blur-xl">
          {step === 'success' ? (
            <div className="flex flex-col items-center py-6 gap-5">
              <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center border border-green-500/30">
                <Headphones size={32} className="text-green-400" />
              </div>
              <div className="text-center">
                <h2 className="text-2xl font-black text-white mb-1">Welcome, {name.split(' ')[0]}! 🎵</h2>
                <p className="text-gray-400 text-sm">Taking you to the halls…</p>
              </div>
              <div className="flex gap-1.5">
                {[0,1,2,3,4].map(i => (
                  <div key={i} className="w-2 h-2 rounded-full bg-[#ff7e5f] animate-bounce" style={{ animationDelay: `${i * 0.1}s` }} />
                ))}
              </div>
            </div>
          ) : (
            <>
              <div className="mb-7">
                <h2 className="text-2xl font-black text-white mb-1">Jump right in</h2>
                <p className="text-gray-500 text-sm">No account needed — just pick a name and you're in.</p>
              </div>

              {error && (
                <div className="mb-5 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Name field */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">
                    Your Name
                  </label>
                  <div className="relative">
                    <User size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                    <input
                      id="guest-name"
                      type="text"
                      value={name}
                      onChange={e => handleNameChange(e.target.value)}
                      placeholder="e.g. Alex Johnson"
                      className="w-full bg-black/30 border border-white/10 rounded-xl pl-10 pr-4 py-3.5 text-white placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-[#ff7e5f] focus:border-transparent transition-all"
                      autoFocus
                      suppressHydrationWarning
                    />
                  </div>
                </div>

                {/* Username field */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">
                    Username
                  </label>
                  <div className="relative">
                    <AtSign size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                    <input
                      id="guest-username"
                      type="text"
                      value={username}
                      onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^\w]/g, '').slice(0, 30))}
                      placeholder="e.g. alex_j"
                      className="w-full bg-black/30 border border-white/10 rounded-xl pl-10 pr-4 py-3.5 text-white placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-[#ff7e5f] focus:border-transparent transition-all font-mono"
                      suppressHydrationWarning
                    />
                  </div>
                  <p className="text-[10px] text-gray-600 mt-1.5 pl-1">Letters, numbers, underscores only</p>
                </div>

                <button
                  id="enter-music-hall-btn"
                  type="submit"
                  disabled={loading}
                  className="w-full py-4 rounded-xl font-black text-white text-base bg-gradient-to-r from-[#ff7e5f] to-[#feb47b] hover:opacity-90 transition-all hover:scale-[1.02] active:scale-[0.98] shadow-xl disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-3 mt-2"
                >
                  {loading ? (
                    <><Loader2 size={20} className="animate-spin" /> Entering…</>
                  ) : (
                    <><Radio size={20} /> Enter Music Hall</>
                  )}
                </button>
              </form>

              {/* Feature hints */}
              <div className="mt-8 pt-6 border-t border-white/5 grid grid-cols-3 gap-4 text-center">
                {[
                  { icon: Radio, label: 'Live Rooms' },
                  { icon: Disc, label: 'Sync Music' },
                  { icon: Headphones, label: 'Free Tracks' },
                ].map(({ icon: Icon, label }) => (
                  <div key={label} className="flex flex-col items-center gap-2">
                    <div className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center border border-white/10">
                      <Icon size={14} className="text-[#ff7e5f]" />
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-600">{label}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
