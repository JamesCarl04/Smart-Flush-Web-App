'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { apiFetch } from '@/lib/api-client';

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

    let cancelled = false;

    const loadPersonnel = async () => {
      try {
        const response = await apiFetch<MaintenancePersonnelResponse>(
          '/api/maintenance-personnel',
          user,
        );

        if (!response.success) {
          throw new Error(
            response.error ?? 'Failed to load maintenance personnel',
          );
        }

        if (cancelled) {
          return;
        }

        const nextPersonnel = Array.isArray(response.data)
          ? response.data
          : [];
        setSnapshotState({
          personnel: nextPersonnel,
          error: null,
          readyForUserId: user.uid,
        });
      } catch (error) {
        if (cancelled) {
          return;
        }

        const message =
          error instanceof Error
            ? error.message
            : 'Failed to load maintenance personnel';
        console.warn('[useMaintenancePersonnel] API load failed:', error);
        setSnapshotState({
          personnel: [],
          error: message,
          readyForUserId: user.uid,
        });
      }
    };

    void loadPersonnel();

    return () => {
      cancelled = true;
    };
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
