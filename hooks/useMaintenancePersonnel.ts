'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export interface MaintenancePersonnel {
  id: string;
  displayName: string;
  email: string | null;
}

interface UseMaintenancePersonnelOptions {
  enabled?: boolean;
}

interface UseMaintenancePersonnelResult {
  personnel: MaintenancePersonnel[];
  personnelById: Record<string, MaintenancePersonnel>;
  loading: boolean;
  error: string | null;
}

interface PersonnelSnapshotState {
  personnel: MaintenancePersonnel[];
  error: string | null;
  readyForUserId: string | null;
}

interface MaintenancePersonnelResponse {
  success: boolean;
  data?: MaintenancePersonnel[];
  error?: string;
}

const EMPTY_PERSONNEL: MaintenancePersonnel[] = [];

export function useMaintenancePersonnel({
  enabled = true,
}: UseMaintenancePersonnelOptions = {}): UseMaintenancePersonnelResult {
  const { user, loading: authLoading } = useAuth();
  const [snapshotState, setSnapshotState] = useState<PersonnelSnapshotState>({
    personnel: [],
    error: null,
    readyForUserId: null,
  });

  useEffect(() => {
    if (!enabled || authLoading || !user) {
      return;
    }

    const q = query(collection(db, 'users'), where('role', '==', 'maintenance'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const nextPersonnel = snapshot.docs.map((doc) => {
          const data = doc.data();
          const email = typeof data.email === 'string' && data.email.trim() ? data.email : null;
          return {
            id: doc.id,
            displayName: data.displayName || email || doc.id,
            email,
          };
        }).sort((a, b) => a.displayName.localeCompare(b.displayName));

        setSnapshotState({
          personnel: nextPersonnel,
          error: null,
          readyForUserId: user.uid,
        });
      },
      (error) => {
        console.warn('[useMaintenancePersonnel] Firestore onSnapshot error:', error);
        setSnapshotState({
          personnel: [],
          error: error.message,
          readyForUserId: user.uid,
        });
      }
    );

    return () => unsubscribe();
  }, [authLoading, enabled, user]);

  const personnel =
    enabled && user && snapshotState.readyForUserId === user.uid
      ? snapshotState.personnel
      : EMPTY_PERSONNEL;
  const loading = enabled
    ? authLoading
      ? true
      : !!user && snapshotState.readyForUserId !== user.uid
    : false;
  const error =
    enabled && user && snapshotState.readyForUserId === user.uid
      ? snapshotState.error
      : null;

  const personnelById = useMemo(
    () =>
      personnel.reduce<Record<string, MaintenancePersonnel>>((lookup, person) => {
        lookup[person.id] = person;
        return lookup;
      }, {}),
    [personnel],
  );

  return { personnel, personnelById, loading, error };
}
