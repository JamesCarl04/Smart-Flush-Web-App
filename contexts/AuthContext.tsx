'use client';

import React, { createContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User, signOut, getAuth } from 'firebase/auth';
import Cookies from 'js-cookie';
import { app } from '@/lib/firebase';
import { apiFetch } from '@/lib/api-client';
import type { UserRole } from '@/lib/auth-helpers';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  role: UserRole | null;
  roleLoading: boolean;
  roleError: string | null;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<UserRole | null>(null);
  const [roleLoading, setRoleLoading] = useState(true);
  const [roleError, setRoleError] = useState<string | null>(null);

  useEffect(() => {
    const auth = getAuth(app);
    let generation = 0;
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      const currentGeneration = ++generation;
      setUser(user);
      setLoading(false);
      setRole(null);
      setRoleError(null);
      
      if (user) {
        // Set lightweight session flag for edge middleware / proxy routing
        Cookies.set('auth-token', '1', { expires: 7, path: '/', sameSite: 'lax' });
        setRoleLoading(true);
        void apiFetch<{ success: boolean; data?: { role?: UserRole | null }; error?: string }>(
          '/api/auth/me',
          user,
        ).then((response) => {
          if (generation !== currentGeneration) return;
          const authoritativeRole = response.success ? response.data?.role ?? null : null;
          setRole(authoritativeRole);
          setRoleError(response.success ? null : response.error ?? 'Failed to load account role');
        }).catch((error) => {
          if (generation !== currentGeneration) return;
          setRole(null);
          setRoleError(error instanceof Error ? error.message : 'Failed to load account role');
        }).finally(() => {
          if (generation === currentGeneration) setRoleLoading(false);
        });
      } else {
        Cookies.remove('auth-token', { path: '/' });
        setRoleLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // Periodic 60s presence heartbeat while user is authenticated and browser tab is visible
  useEffect(() => {
    if (!user) return;

    const sendHeartbeat = async (isOnline = true, status?: 'available' | 'offline') => {
      try {
        const body: Record<string, unknown> = { isOnline };
        if (status) body.status = status;
        await apiFetch('/api/staff/presence', user, {
          method: 'POST',
          body: JSON.stringify(body),
        });
      } catch {
        // Silent catch for background presence heartbeat
      }
    };

    // Periodic heartbeat every 60 seconds
    const intervalId = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        void sendHeartbeat(true);
      }
    }, 60_000);

    // Refresh immediately when returning to the tab
    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        void sendHeartbeat(true);
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return () => {
      clearInterval(intervalId);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
  }, [user]);

  const logout = async () => {
    if (user) {
      try {
        await apiFetch('/api/staff/presence', user, {
          method: 'POST',
          body: JSON.stringify({ isOnline: false, status: 'offline' }),
        });
      } catch {
        // Continue with logout even if presence update fails
      }
    }
    const auth = getAuth(app);
    await signOut(auth);
    setRole(null);
    setRoleError(null);
    setRoleLoading(false);
    Cookies.remove('auth-token', { path: '/' });
    // Firebase automatically clears internal token storage on logout
  };

  return (
    <AuthContext.Provider value={{ user, loading, role, roleLoading, roleError, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export { AuthContext };
