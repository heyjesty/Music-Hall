"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import api from '@/lib/api';

export default function Login() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.post('auth/login/', { username, password });
      localStorage.setItem('access_token', res.data.access);
      localStorage.setItem('refresh_token', res.data.refresh);
      router.push('/');
    } catch (err) {
      setError('Invalid credentials');
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[70vh]">
      <div className="glass-card p-8 rounded-3xl w-full max-w-md">
        <h2 className="text-3xl font-bold mb-6 text-center text-gradient">Welcome Back</h2>
        {error && <p className="text-red-400 text-sm mb-4 text-center">{error}</p>}
        
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-300">Username</label>
            <input 
              type="text" 
              className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-[#ff7e5f]"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-300">Password</label>
            <input 
              type="password" 
              className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-[#ff7e5f]"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          
          <button 
            type="submit" 
            className="w-full py-3 mt-4 rounded-xl font-bold text-white bg-gradient-to-r from-[#ff7e5f] to-[#feb47b] hover:opacity-90 transition-opacity"
          >
            Sign In
          </button>
        </form>
        
        <p className="mt-6 text-center text-sm text-gray-400">
          Don't have an account? <Link href="/signup" className="text-[#ff7e5f] hover:underline">Sign up</Link>
        </p>
      </div>
    </div>
  );
}
