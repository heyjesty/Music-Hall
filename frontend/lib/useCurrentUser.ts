"use client";

import { useCallback, useEffect, useState } from 'react';
import api from './api';
import { AUTH_EVENT, isLoggedIn } from './auth';
import type { User } from './types';

/** Current user from `/users/me/`, kept in sync with login/logout events. */
export function useCurrentUser() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!isLoggedIn()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const res = await api.get<User>('users/me/');
      setUser(res.data);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const onChange = () => load();
    window.addEventListener(AUTH_EVENT, onChange);
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener(AUTH_EVENT, onChange);
      window.removeEventListener('storage', onChange);
    };
  }, [load]);

  return { user, loading, reload: load };
}
