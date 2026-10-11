"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import api, { getErrorMessage } from '@/lib/api';
import { isLoggedIn } from '@/lib/auth';
import { THEMES, type Theme } from '@/lib/types';
import { FormError } from '@/components/AuthCard';

export default function CreateRoom() {
  const router = useRouter();
  const [formData, setFormData] = useState<{ name: string; theme: Theme; description: string }>({
    name: '',
    theme: 'CALM',
    description: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isLoggedIn()) router.replace('/login?next=/rooms/create');
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await api.post('rooms/', formData);
      router.push(`/rooms/${res.data.id}`);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to create room.'));
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-6 sm:py-12">
      <div className="glass-card p-6 sm:p-10 rounded-3xl">
        <h1 className="text-3xl sm:text-4xl font-bold text-gradient">Start a room</h1>
        <p className="text-gray-400 text-sm mt-2 mb-8">You&apos;ll be the host — you control playback and the queue.</p>

        <form onSubmit={handleSubmit} className="space-y-6">
          <FormError message={error} />
          <div>
            <label htmlFor="name" className="block text-sm font-medium mb-2 text-gray-300">Room name</label>
            <input id="name" className="input" value={formData.name} maxLength={255} required
              placeholder="e.g. Midnight Lofi" onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
          </div>

          <fieldset>
            <legend className="block text-sm font-medium mb-2 text-gray-300">Mood</legend>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {THEMES.map((t) => (
                <button
                  type="button"
                  key={t.value}
                  onClick={() => setFormData({ ...formData, theme: t.value })}
                  aria-pressed={formData.theme === t.value}
                  className={`px-3 py-3 rounded-xl border text-sm font-medium transition-colors ${
                    formData.theme === t.value
                      ? 'border-accent bg-accent/10 text-white'
                      : 'border-white/10 text-gray-400 hover:border-white/30 hover:text-white'
                  }`}
                >
                  <div className="text-xl mb-1">{t.emoji}</div>
                  {t.label}
                </button>
              ))}
            </div>
          </fieldset>

          <div>
            <label htmlFor="description" className="block text-sm font-medium mb-2 text-gray-300">Description</label>
            <textarea id="description" className="input h-32 resize-none" value={formData.description}
              placeholder="What kind of vibe is this room?"
              onChange={(e) => setFormData({ ...formData, description: e.target.value })} />
          </div>

          <button type="submit" disabled={submitting} className="btn-primary w-full !py-4 text-lg">
            {submitting ? <Loader2 size={22} className="animate-spin" /> : 'Create & enter room'}
          </button>
        </form>
      </div>
    </div>
  );
}
