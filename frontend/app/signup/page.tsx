"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import api, { getErrorMessage } from '@/lib/api';
import { setTokens } from '@/lib/auth';
import AuthCard, { FormError } from '@/components/AuthCard';

const FIELDS = [
  { name: 'username', label: 'Username', type: 'text', autoComplete: 'username', required: true },
  { name: 'email', label: 'Email', type: 'email', autoComplete: 'email', required: true },
  { name: 'password', label: 'Password', type: 'password', autoComplete: 'new-password', required: true },
] as const;

export default function Signup() {
  const router = useRouter();
  const [formData, setFormData] = useState({ username: '', email: '', password: '', first_name: '', last_name: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.post('users/', formData);
      // Sign the new user straight in.
      const res = await api.post('auth/login/', { username: formData.username, password: formData.password });
      setTokens(res.data.access, res.data.refresh);
      router.push('/');
    } catch (err) {
      setError(getErrorMessage(err, 'Could not create your account.'));
      setSubmitting(false);
    }
  };

  return (
    <AuthCard title="Create your account" subtitle="Start a room in under a minute.">
      <form onSubmit={handleSignup} className="space-y-4">
        <FormError message={error} />
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="first_name" className="block text-sm font-medium mb-1.5 text-gray-300">First name</label>
            <input id="first_name" name="first_name" className="input" autoComplete="given-name"
              value={formData.first_name} onChange={handleChange} />
          </div>
          <div>
            <label htmlFor="last_name" className="block text-sm font-medium mb-1.5 text-gray-300">Last name</label>
            <input id="last_name" name="last_name" className="input" autoComplete="family-name"
              value={formData.last_name} onChange={handleChange} />
          </div>
        </div>
        {FIELDS.map((f) => (
          <div key={f.name}>
            <label htmlFor={f.name} className="block text-sm font-medium mb-1.5 text-gray-300">{f.label}</label>
            <input id={f.name} name={f.name} type={f.type} className="input" autoComplete={f.autoComplete}
              value={formData[f.name]} onChange={handleChange} required={f.required}
              minLength={f.name === 'password' ? 8 : undefined} />
            {f.name === 'password' && <p className="text-xs text-gray-500 mt-1.5">At least 8 characters, not entirely numeric.</p>}
          </div>
        ))}
        <button type="submit" disabled={submitting} className="btn-primary w-full !mt-6">
          {submitting && <Loader2 size={18} className="animate-spin" />} Create account
        </button>
        <p className="pt-2 text-center text-sm text-gray-400">
          Already have an account? <Link href="/login" className="text-accent hover:underline">Sign in</Link>
        </p>
      </form>
    </AuthCard>
  );
}
