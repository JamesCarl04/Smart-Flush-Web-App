'use client';

import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';

export type ClientUserRole = 'admin' | 'supervisor' | 'maintenance' | 'viewer' | 'user' | null;

interface UseUserRoleResult {
  role: ClientUserRole;
  loading: boolean;
}

export function useUserRole(): UseUserRoleResult {
  const { user, loading: authLoading } = useAuth();
  const [role, setRole] = useState<ClientUserRole>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      setRole(null);
      setLoading(false);
      return;
    }

    const userDocRef = doc(db, 'users', user.uid);
    const unsubscribe = onSnapshot(
      userDocRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          const rawRole = data?.role;
          const validRoles: ClientUserRole[] = ['admin', 'supervisor', 'maintenance', 'viewer', 'user'];
          setRole(validRoles.includes(rawRole) ? (rawRole as ClientUserRole) : 'user');
        } else {
          // Fallback: try email-based lookup isn't easily done client-side.
          // Default to 'user' if doc not found.
          setRole('user');
        }
        setLoading(false);
      },
      (error) => {
        console.warn('[useUserRole] Firestore error:', error);
        setRole(null);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [authLoading, user]);

  return { role, loading };
}

/** Returns true if the role can access supervisor-or-above pages */
export function isAdminOrSupervisor(role: ClientUserRole): boolean {
  return role === 'admin' || role === 'supervisor';
}

/** Pages restricted to admin only (supervisors are blocked) */
export const SUPERVISOR_RESTRICTED_PATHS = [
  '/configuration',
  '/automation',
  '/reports',
  '/user-management',
];
