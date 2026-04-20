"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import api from '@/lib/api';

export default function Signup() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    first_name: '',
    last_name: ''
  });
  const [error, setError] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('users/', formData);
      router.push('/login');
    } catch (err) {
      setError('Error creating account.');
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[75vh]">
      <div className="glass-card p-8 rounded-3xl w-full max-w-md">
        <h2 className="text-3xl font-bold mb-6 text-center text-gradient">Create Account</h2>
        {error && <p className="text-red-400 text-sm mb-4 text-center">{error}</p>}
        
        <form onSubmit={handleSignup} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-300">First Name</label>
              <input 
                name="first_name"
                type="text" 
                className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-[#ff7e5f]"
                onChange={handleChange}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-300">Last Name</label>
              <input 
                name="last_name"
                type="text" 
                className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-[#ff7e5f]"
                onChange={handleChange}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-300">Username</label>
            <input 
              name="username"
              type="text" 
              className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-[#ff7e5f]"
              onChange={handleChange}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-300">Email</label>
            <input 
              name="email"
              type="email" 
              className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-[#ff7e5f]"
              onChange={handleChange}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-300">Password</label>
            <input 
              name="password"
              type="password" 
              className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-[#ff7e5f]"
              onChange={handleChange}
              required
            />
          </div>
          
          <button 
            type="submit" 
            className="w-full py-3 mt-4 rounded-xl font-bold text-white bg-gradient-to-r from-[#ff7e5f] to-[#feb47b] hover:opacity-90 transition-opacity"
          >
            Sign Up
          </button>
        </form>
        
        <p className="mt-6 text-center text-sm text-gray-400">
          Already have an account? <Link href="/login" className="text-[#ff7e5f] hover:underline">Log in</Link>
        </p>
      </div>
    </div>
  );
}
