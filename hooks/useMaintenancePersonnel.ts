'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  collection,
  onSnapshot,
  query,
  where,
  type DocumentData,
} from 'firebase/firestore';
import { useAuth } from '@/hooks/useAuth';
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

const EMPTY_PERSONNEL: MaintenancePersonnel[] = [];

function mapPersonnel(docId: string, data: DocumentData): MaintenancePersonnel {
  const email = typeof data.email === 'string' ? data.email : null;
  const displayName =
    typeof data.displayName === 'string' && data.displayName.trim()
      ? data.displayName.trim()
      : email || docId;

  return {
    id: docId,
    displayName,
    email,
  };
}

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

    const personnelQuery = query(
      collection(db, 'users'),
      where('role', '==', 'maintenance'),
    );

    const unsubscribe = onSnapshot(
      personnelQuery,
      (snapshot) => {
        const nextPersonnel = snapshot.docs
          .map((personDoc) => mapPersonnel(personDoc.id, personDoc.data()))
          .sort((first, second) =>
            first.displayName.localeCompare(second.displayName),
          );

        setSnapshotState({
          personnel: nextPersonnel,
          error: null,
          readyForUserId: user.uid,
        });
      },
      (snapshotError) => {
        console.warn(
          '[useMaintenancePersonnel] snapshot failed:',
          snapshotError,
        );
        setSnapshotState({
          personnel: [],
          error:
            snapshotError.message || 'Failed to load maintenance personnel',
          readyForUserId: user.uid,
        });
      },
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
