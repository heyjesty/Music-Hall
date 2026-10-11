"use client";

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import api, { getErrorMessage } from '@/lib/api';
import { safeNext, setTokens } from '@/lib/auth';
import AuthCard, { FormError } from '@/components/AuthCard';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await api.post('auth/login/', { username, password });
      setTokens(res.data.access, res.data.refresh);
      router.push(safeNext(searchParams.get('next')));
    } catch (err) {
      setError(getErrorMessage(err, 'Invalid username or password.'));
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleLogin} className="space-y-4">
      <FormError message={error} />
      <div>
        <label htmlFor="username" className="block text-sm font-medium mb-1.5 text-gray-300">Username</label>
        <input id="username" className="input" autoComplete="username" value={username}
          onChange={(e) => setUsername(e.target.value)} required autoFocus />
      </div>
      <div>
        <label htmlFor="password" className="block text-sm font-medium mb-1.5 text-gray-300">Password</label>
        <input id="password" type="password" className="input" autoComplete="current-password" value={password}
          onChange={(e) => setPassword(e.target.value)} required />
      </div>
      <button type="submit" disabled={submitting} className="btn-primary w-full !mt-6">
        {submitting && <Loader2 size={18} className="animate-spin" />} Sign in
      </button>
      <p className="pt-2 text-center text-sm text-gray-400">
        New to Music Hall? <Link href="/signup" className="text-accent hover:underline">Create an account</Link>
      </p>
    </form>
  );
}

export default function Login() {
  return (
    <AuthCard title="Welcome back" subtitle="Sign in to join the room.">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </AuthCard>
  );
}
