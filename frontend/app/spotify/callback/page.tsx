"use client";

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { clearSpotifyReturnPath, getSpotifyReturnPath } from '@/lib/spotifyConnect';

const REASONS: Record<string, string> = {
  access_denied: 'You declined access on Spotify.',
  invalid_state: 'The sign-in link expired. Please try connecting again.',
  token_exchange_failed: 'Spotify did not accept the sign-in. Please try again.',
};

function CallbackStatus() {
  const router = useRouter();
  const params = useSearchParams();
  const success = params.get('status') === 'success';
  const [returnTo] = useState(getSpotifyReturnPath);

  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => {
      clearSpotifyReturnPath();
      router.replace(returnTo);
    }, 1200);
    return () => clearTimeout(timer);
  }, [router, success, returnTo]);

  return (
    <div className="glass-card rounded-3xl p-10 max-w-md w-full text-center">
      {success ? (
        <>
          <CheckCircle2 size={48} className="mx-auto text-spotify mb-4" />
          <h1 className="text-2xl font-bold mb-2">Spotify connected</h1>
          <p className="text-gray-400 text-sm flex items-center justify-center gap-2">
            <Loader2 size={14} className="animate-spin" /> Taking you back…
          </p>
        </>
      ) : (
        <>
          <XCircle size={48} className="mx-auto text-red-400 mb-4" />
          <h1 className="text-2xl font-bold mb-2">Couldn&apos;t connect Spotify</h1>
          <p className="text-gray-400 text-sm mb-6">{REASONS[params.get('reason') ?? ''] ?? 'Something went wrong. Please try again.'}</p>
          <Link href={returnTo} className="btn-primary">Go back</Link>
        </>
      )}
    </div>
  );
}

export default function SpotifyCallback() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Suspense fallback={<Loader2 className="animate-spin text-accent" size={32} />}>
        <CallbackStatus />
      </Suspense>
    </div>
  );
}
