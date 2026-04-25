"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';

export default function CreateRoom() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    name: '',
    theme: 'CALM',
    description: ''
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api.post('rooms/', formData);
      router.push(`/rooms/${res.data.id}`);
    } catch (err) {
      console.error(err);
      alert("Failed to create room.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-12">
      <div className="glass-card p-10 rounded-3xl">
        <h1 className="text-4xl font-bold mb-8 text-gradient">Create a Room</h1>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium mb-2 text-gray-300">Room Name</label>
            <input 
              type="text" 
              className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-[#ff7e5f]"
              value={formData.name}
              onChange={e => setFormData({...formData, name: e.target.value})}
              required
              placeholder="e.g. Midnight Lofi"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2 text-gray-300">Theme/Mood</label>
            <select 
              className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-[#ff7e5f]"
              value={formData.theme}
              onChange={e => setFormData({...formData, theme: e.target.value})}
            >
              <option value="SAD">Sad</option>
              <option value="ROMANTIC">Romantic</option>
              <option value="ENERGETIC">Energetic</option>
              <option value="CALM">Calm</option>
              <option value="PARTY">Party</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2 text-gray-300">Description</label>
            <textarea 
              className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-[#ff7e5f] h-32 resize-none"
              value={formData.description}
              onChange={e => setFormData({...formData, description: e.target.value})}
              placeholder="What kind of vibe is this room?"
            />
          </div>
          
          <button 
            type="submit" 
            disabled={loading}
            className="w-full py-4 mt-6 rounded-xl font-bold text-lg text-white bg-gradient-to-r from-[#ff7e5f] to-[#feb47b] hover:opacity-90 transition-opacity flex justify-center items-center"
          >
            {loading ? <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div> : "Create & Enter Room"}
          </button>
        </form>
      </div>
    </div>
  );
}
