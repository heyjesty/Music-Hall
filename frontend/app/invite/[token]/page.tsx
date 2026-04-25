"use client";

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Music, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import api from '@/lib/api';

export default function InviteHandler() {
  const { token } = useParams();
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    async function joinRoom() {
      const accessToken = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
      
      // If not logged in, redirect to onboarding but save the intent
      if (!accessToken) {
        localStorage.setItem('redirect_after_onboarding', `/invite/${token}`);
        router.replace('/onboarding');
        return;
      }

      try {
        const res = await api.post('invitations/join/', { token });
        setStatus('success');
        // Small delay to show success state
        setTimeout(() => {
          router.push(`/rooms/${res.data.room_id}`);
        }, 1500);
      } catch (err: any) {
        setStatus('error');
        setError(err?.response?.data?.error || 'Failed to join room. The link might be expired.');
      }
    }

    if (token) {
      joinRoom();
    }
  }, [token, router]);

  return (
    <div className="min-h-screen bg-[#070708] flex items-center justify-center px-4 relative overflow-hidden">
      {/* Orbs */}
      <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full bg-[#ff7e5f]/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full bg-[#feb47b]/8 blur-[100px] pointer-events-none" />

      <div className="w-full max-w-sm relative z-10 text-center">
        <div className="mb-8 flex justify-center">
          <div className="relative p-4 rounded-3xl bg-gradient-to-tr from-[#ff7e5f] to-[#feb47b] shadow-2xl">
            <Music size={32} className="text-white" />
          </div>
        </div>

        <div className="glass-card rounded-[2rem] p-8 border border-white/10 shadow-2xl backdrop-blur-xl">
          {status === 'loading' && (
            <div className="flex flex-col items-center gap-4 py-4">
              <Loader2 size={40} className="text-[#ff7e5f] animate-spin" />
              <h2 className="text-xl font-bold text-white uppercase tracking-wider">Validating Invitation…</h2>
              <p className="text-gray-500 text-sm">Hold on, we're getting you in.</p>
            </div>
          )}

          {status === 'success' && (
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center border border-green-500/30">
                <CheckCircle2 size={32} className="text-green-400" />
              </div>
              <h2 className="text-xl font-bold text-white uppercase tracking-wider">Success!</h2>
              <p className="text-gray-400 text-sm">Joining the Music Hall…</p>
            </div>
          )}

          {status === 'error' && (
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center border border-red-500/30">
                <XCircle size={32} className="text-red-400" />
              </div>
              <h2 className="text-xl font-bold text-white uppercase tracking-wider">Oops!</h2>
              <p className="text-red-400/80 text-sm">{error}</p>
              <button 
                onClick={() => router.push('/')}
                className="mt-4 px-6 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm font-bold hover:bg-white/10 transition-all"
              >
                Go Home
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
