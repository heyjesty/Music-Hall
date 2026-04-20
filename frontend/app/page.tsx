"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { Play, Users, Disc, Shuffle, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const [rooms, setRooms] = useState([]);
  const router = useRouter();

  const handleRandomJoin = async () => {
    try {
      const res = await api.get('random-room/');
      if (res.data.room_id) {
        router.push(`/rooms/${res.data.room_id}`);
      }
    } catch (err) {
      console.error(err);
      alert("Please login first or check the server");
    }
  };
  useEffect(() => {
    async function fetchRooms() {
      try {
        const res = await api.get('rooms/');
        setRooms(res.data);
      } catch (err) {
        console.error("Failed to fetch rooms", err);
      }
    }
    fetchRooms();
  }, []);

  return (
    <div className="space-y-16 pb-20">
      {/* Hero Section */}
      <section className="relative py-20 px-6 overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-white/5 to-transparent border border-white/10 shadow-2xl">
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_0%,rgba(255,126,95,0.15),transparent_50%)] pointer-events-none" />
        
        <div className="max-w-4xl mx-auto text-center relative z-10">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 mb-8 backdrop-blur-sm animate-fade-in">
            <span className="w-2 h-2 rounded-full bg-[#ff7e5f] animate-pulse" />
            <span className="text-xs font-bold uppercase tracking-widest text-gray-300">Live Social Listening</span>
          </div>
          
          <h1 className="text-6xl md:text-8xl font-black mb-8 tracking-tighter leading-tight">
            Sync Your <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#ff7e5f] via-[#feb47b] to-[#ff7e5f]">Music</span> Soul
          </h1>
          
          <p className="text-lg md:text-xl text-gray-400 max-w-2xl mx-auto mb-12 leading-relaxed">
            The social layer for music. Join rooms, share your favorite tracks, and vibe together in real-time with high-fidelity Spotify synchronization.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-5 justify-center items-center">
            <Link 
              href="/rooms/create" 
              className="group relative px-10 py-4 rounded-full font-bold bg-white text-black transition-all hover:scale-105 active:scale-95 shadow-[0_0_40px_rgba(255,255,255,0.2)] overflow-hidden"
            >
              <span className="relative z-10">Start Your Room</span>
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
            </Link>
            
            <button 
              onClick={handleRandomJoin} 
              className="px-10 py-4 rounded-full font-bold text-white glass-card border border-white/20 hover:bg-white/10 transition-all flex items-center gap-3 active:scale-95 shadow-xl"
            >
              <Shuffle size={20} className="text-[#ff7e5f]" /> 
              <span>Feeling Lucky</span>
            </button>
          </div>
        </div>
      </section>

      {/* Stats/Features Banner */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 px-4">
        {[
          { label: 'Rooms Active', val: rooms.length || '0', icon: Disc },
          { label: 'Listeners', val: '2.4k+', icon: Users },
          { label: 'Synched', val: '100%', icon: Shuffle },
          { label: 'Tracks', val: '50M+', icon: Play },
        ].map((stat, i) => (
          <div key={i} className="glass-card p-6 rounded-3xl text-center border border-white/5 hover:border-white/20 transition-all group">
             <stat.icon className="mx-auto mb-3 text-gray-500 group-hover:text-[#ff7e5f] transition-colors" size={20} />
             <div className="text-2xl font-black mb-1">{stat.val}</div>
             <div className="text-[10px] uppercase font-bold tracking-widest text-gray-500">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Rooms Grid */}
      <section id="explore" className="relative group">
        <div className="flex items-center justify-between mb-10">
          <div>
            <h2 className="text-4xl font-black flex items-center gap-4">
              <Disc className="text-[#ff7e5f] animate-spin-slow" /> Current Vibing
            </h2>
            <p className="text-gray-500 text-sm mt-1">Jump into a room and start listening synchronously.</p>
          </div>
          <div className="hidden sm:flex gap-2">
             <button className="p-3 rounded-2xl glass-card border border-white/5 hover:border-white/20"><Search size={18} /></button>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {rooms.map((room: any) => (
            <div key={room.id} className="group glass-card hover:bg-white/[0.07] transition-all duration-500 rounded-[2rem] p-8 border border-white/5 hover:border-white/20 relative overflow-hidden flex flex-col shadow-2xl hover:shadow-[#ff7e5f]/10">
              <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-br from-[#ff7e5f]/10 to-transparent blur-3xl rounded-full -mr-20 -mt-20 opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
              
              <div className="flex justify-between items-center mb-6 relative">
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/10">
                   <div className="w-1.5 h-1.5 rounded-full bg-[#1DB954]" />
                   <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{room.theme}</span>
                </div>
                <div className="flex -space-x-2">
                  {[1,2,3].map(i => (
                    <div key={i} className="w-8 h-8 rounded-full border-2 border-[#0a0a0a] bg-gray-800 flex items-center justify-center text-[10px] font-bold">
                       {String.fromCharCode(64+i)}
                    </div>
                  ))}
                  <div className="w-8 h-8 rounded-full border-2 border-[#0a0a0a] bg-white/5 backdrop-blur-md flex items-center justify-center text-[10px] font-bold text-gray-400">+5</div>
                </div>
              </div>
              
              <h3 className="text-3xl font-black mb-3 group-hover:text-[#ff7e5f] transition-colors">{room.name}</h3>
              <p className="text-gray-400 text-sm line-clamp-2 mb-8 leading-relaxed">
                {room.description || "Join the circle, share your rhythm, and vibe with the community."}
              </p>
              
              <div className="mt-auto flex items-center justify-between border-t border-white/5 pt-6">
                <div className="flex flex-col">
                   <span className="text-[9px] uppercase font-bold tracking-widest text-gray-600">Admin</span>
                   <span className="text-xs font-medium text-gray-300">@heyjesty</span>
                </div>
                <Link href={`/rooms/${room.id}`} className="px-6 py-2.5 rounded-2xl bg-[#ff7e5f]/10 text-[#ff7e5f] font-bold text-sm hover:bg-[#ff7e5f] hover:text-white transition-all transform hover:translate-x-1 flex items-center gap-2 group/btn">
                  Join Room <Play size={14} fill="currentColor" className="group-hover/btn:translate-x-0.5 transition-transform" />
                </Link>
              </div>
            </div>
          ))}

          {rooms.length === 0 && (
            <div className="col-span-full text-center py-20 text-gray-500">
              <Disc size={48} className="mx-auto mb-4 opacity-20" />
              <p>No active rooms found. Be the first to create one!</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
