c'use client';

import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { MessageSquareText, Send, Smartphone } from 'lucide-react';
import { DashboardToast } from '@/components/dashboard/DashboardToast';
import { useAuth } from '@/hooks/useAuth';
import { useMaintenancePersonnel } from '@/hooks/useMaintenancePersonnel';
import { apiFetch } from '@/lib/api-client';
import { getErrorMessage } from '@/lib/error-utils';
import { db } from '@/lib/firebase';
import type { Device } from '@/types';

interface DevicesResponse {
  success: boolean;
  data: Device[];
}

interface MaintenanceNoteResponse {
  success: boolean;
  data?: {
    noteId: string;
    taskId: string;
  };
  error?: string;
}

type UserRole = 'admin' | 'supervisor' | 'maintenance' | 'viewer' | 'user' | null;
type ToastKind = 'success' | 'error';

function formatDeviceLabel(device: Device): string {
  return device.name || device.id;
}

export function RestroomMaintenanceNotes() {
  const { user, loading: authLoading } = useAuth();
  const [role, setRole] = useState<UserRole>(null);
  const [roleLoading, setRoleLoading] = useState(true);
  const [devices, setDevices] = useState<Device[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(true);
  const [restroomId, setRestroomId] = useState('');
  const [note, setNote] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toast, setToast] = useState<{
    kind: ToastKind;
    message: string;
  } | null>(null);

  const showComposer = role !== null && role !== 'viewer';
  const showAssigneeSelect = role === 'admin' || role === 'supervisor';
  const { personnel, loading: personnelLoading } = useMaintenancePersonnel({
    enabled: showAssigneeSelect,
  });

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timeoutId = window.setTimeout(() => setToast(null), 3600);
    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  useEffect(() => {
    let cancelled = false;

    const loadRole = async () => {
      if (authLoading) {
        return;
      }

      if (!user) {
        if (!cancelled) {
          setRole(null);
          setRoleLoading(false);
        }
        return;
      }

      setRoleLoading(true);

      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (!cancelled) {
          setRole(
            userDoc.exists()
              ? ((userDoc.data().role as UserRole | undefined) ?? 'user')
              : 'user',
          );
        }
      } catch (error) {
        console.warn('[RestroomMaintenanceNotes] role lookup failed:', error);
        if (!cancelled) {
          setRole('user');
        }
      } finally {
        if (!cancelled) {
          setRoleLoading(false);
        }
      }
    };

    void loadRole();

    return () => {
      cancelled = true;
    };
  }, [authLoading, user]);

  useEffect(() => {
    let cancelled = false;

    const loadDevices = async () => {
      if (authLoading || roleLoading) {
        return;
      }

      if (!user || !showComposer) {
        if (!cancelled) {
          setDevices([]);
          setDevicesLoading(false);
        }
        return;
      }

      setDevicesLoading(true);

      try {
        const response = await apiFetch<DevicesResponse>('/api/devices', user);
        if (!cancelled) {
          const nextDevices = Array.isArray(response.data) ? response.data : [];
          setDevices(nextDevices);
          setRestroomId((current) =>
            current && nextDevices.some((device) => device.id === current)
              ? current
              : (nextDevices[0]?.id ?? ''),
          );
        }
      } catch (error) {
        console.warn('[RestroomMaintenanceNotes] device lookup failed:', error);
        if (!cancelled) {
          setDevices([]);
          setRestroomId('');
          setToast({
            kind: 'error',
            message: getErrorMessage(error) ?? 'Failed to load restrooms',
          });
        }
      } finally {
        if (!cancelled) {
          setDevicesLoading(false);
        }
      }
    };

    void loadDevices();

    return () => {
      cancelled = true;
    };
  }, [authLoading, role, roleLoading, showComposer, user]);

  const handleSendNote = async () => {
    if (!user) {
      setToast({ kind: 'error', message: 'You must be logged in.' });
      return;
    }

    const trimmedNote = note.trim();
    if (!restroomId) {
      setToast({ kind: 'error', message: 'Select a restroom first.' });
      return;
    }

    if (!trimmedNote) {
      setToast({ kind: 'error', message: 'Enter a note or command.' });
      return;
    }

    setIsSubmitting(true);

    try {
      await apiFetch<MaintenanceNoteResponse>('/api/maintenance-notes', user, {
        method: 'POST',
        body: JSON.stringify({
          restroomId,
          note: trimmedNote,
          assignedTo: assignedTo || null,
        }),
      });

      setNote('');
      setAssignedTo('');
      window.dispatchEvent(new Event('maintenance-tasks:refresh'));
      setToast({
        kind: 'success',
        message: 'Maintenance note sent to staff phones',
      });
    } catch (error) {
      setToast({
        kind: 'error',
        message: getErrorMessage(error) ?? 'Failed to send maintenance note',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (roleLoading || authLoading) {
    return (
      <section className="card border border-base-200 bg-base-100 shadow-xl">
        <div className="card-body p-6">
          <div className="skeleton h-8 w-64"></div>
          <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto]">
            <div className="skeleton h-12 w-full"></div>
            <div className="skeleton h-12 w-full"></div>
            <div className="skeleton h-12 w-36"></div>
          </div>
          <div className="skeleton h-24 w-full"></div>
        </div>
      </section>
    );
  }

  if (!showComposer) {
    return null;
  }

  return (
    <>
      <section className="card border border-base-200 bg-base-100 shadow-xl">
        <div className="card-body p-6">
          <div className="mb-5 flex flex-col gap-4 border-b border-base-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-info/15 text-info">
                <MessageSquareText className="h-5 w-5" />
              </div>
              <div>
                <h2 className="card-title text-xl">
                  Restroom Maintenance Notes
                </h2>
                <p className="text-sm text-base-content/60">
                  Send a note or command to cleaning staff phones.
                </p>
              </div>
            </div>
            <div className="badge badge-outline gap-2 px-3 py-3 text-xs font-semibold uppercase tracking-wide">
              <Smartphone className="h-3.5 w-3.5" />
              Phone Alert
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="form-control">
              <label className="label" htmlFor="note-restroom">
                <span className="label-text font-medium">Restroom</span>
              </label>
              {devicesLoading ? (
                <div className="skeleton h-12 w-full"></div>
              ) : (
                <select
                  id="note-restroom"
                  className="select select-bordered w-full"
                  value={restroomId}
                  onChange={(event) => setRestroomId(event.target.value)}
                >
                  {devices.length === 0 ? (
                    <option value="">No restrooms available</option>
                  ) : (
                    devices.map((device) => (
                      <option key={device.id} value={device.id}>
                        {formatDeviceLabel(device)}
                      </option>
                    ))
                  )}
                </select>
              )}
            </div>

            {showAssigneeSelect ? (
              <div className="form-control">
                <label className="label" htmlFor="note-assignee">
                  <span className="label-text font-medium">Notify</span>
                </label>
                {personnelLoading ? (
                  <div className="skeleton h-12 w-full"></div>
                ) : (
                  <select
                    id="note-assignee"
                    className="select select-bordered w-full"
                    value={assignedTo}
                    onChange={(event) => setAssignedTo(event.target.value)}
                  >
                    <option value="">All maintenance staff</option>
                    {personnel.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.displayName}
                        {person.email ? ` (${person.email})` : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            ) : (
              <div className="form-control">
                <label className="label">
                  <span className="label-text font-medium">Notify</span>
                </label>
                <div className="flex min-h-12 items-center rounded-lg border border-base-300 bg-base-200/40 px-4 text-sm text-base-content/70">
                  All maintenance staff
                </div>
              </div>
            )}
          </div>

          <div className="form-control mt-4">
            <label className="label" htmlFor="maintenance-note">
              <span className="label-text font-medium">Note or Command</span>
              <span className="label-text-alt text-base-content/50">
                {note.length}/500
              </span>
            </label>
            <textarea
              id="maintenance-note"
              className="textarea textarea-bordered min-h-24 w-full"
              maxLength={500}
              placeholder="Clean Restroom 1"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            ></textarea>
          </div>

          <div className="mt-5 flex justify-end">
            <button
              type="button"
              className="btn btn-info min-h-12 w-full sm:w-auto"
              disabled={
                isSubmitting ||
                devicesLoading ||
                personnelLoading ||
                devices.length === 0
              }
              onClick={() => void handleSendNote()}
            >
              {isSubmitting ? (
                <>
                  <span className="loading loading-spinner loading-sm"></span>
                  Sending...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Send Note
                </>
              )}
            </button>
          </div>
        </div>
      </section>

      {toast ? (
        <DashboardToast kind={toast.kind} message={toast.message} />
      ) : null}
    </>
  );
}
