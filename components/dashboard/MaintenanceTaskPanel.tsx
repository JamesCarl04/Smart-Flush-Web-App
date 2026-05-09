'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { BrushCleaning, ClipboardList } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { useAuth } from '@/hooks/useAuth';
import { useTasks } from '@/hooks/useTasks';
import { apiFetch } from '@/lib/api-client';
import { getErrorMessage } from '@/lib/error-utils';
import { db } from '@/lib/firebase';
import type { Device, Task } from '@/types';

interface DevicesResponse {
  success: boolean;
  data: Device[];
}

interface CreateTaskResponse {
  success: boolean;
  data?: {
    id: string;
  };
  error?: string;
}

type UserRole = 'admin' | 'viewer' | 'user' | null;

function formatDeviceLabel(device: Device): string {
  if (device.name && device.name !== device.id) {
    return `${device.name} (${device.id})`;
  }

  return device.name || device.id;
}

function getStatusBadgeClassName(status: Task['status']): string {
  switch (status) {
    case 'acknowledged':
      return 'badge-warning text-warning-content';
    case 'completed':
      return 'badge-success text-white';
    case 'pending':
    default:
      return 'badge-error text-white';
  }
}

function getStatusLabel(status: Task['status']): string {
  switch (status) {
    case 'acknowledged':
      return 'Acknowledged';
    case 'completed':
      return 'Completed';
    case 'pending':
    default:
      return 'Pending';
  }
}

export function MaintenanceTaskPanel() {
  const { user, loading: authLoading } = useAuth();
  const { tasks, pendingCount, loading: tasksLoading } = useTasks();
  const [devices, setDevices] = useState<Device[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(true);
  const [selectedToiletId, setSelectedToiletId] = useState('');
  const [note, setNote] = useState('');
  const [role, setRole] = useState<UserRole>(null);
  const [roleLoading, setRoleLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const confirmDialogRef = useRef<HTMLDialogElement | null>(null);

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
          const nextRole = userDoc.exists()
            ? ((userDoc.data().role as UserRole | undefined) ?? 'user')
            : 'user';
          setRole(nextRole);
        }
      } catch (error) {
        console.warn('[MaintenanceTaskPanel] role lookup failed:', error);
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

      if (!user || role !== 'admin') {
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
          setSelectedToiletId((current) => {
            if (
              current &&
              nextDevices.some((device) => device.id === current)
            ) {
              return current;
            }

            return nextDevices[0]?.id ?? '';
          });
        }
      } catch (error) {
        console.warn('[MaintenanceTaskPanel] device lookup failed:', error);
        if (!cancelled) {
          setDevices([]);
          setSelectedToiletId('');
          toast.error(getErrorMessage(error) ?? 'Failed to load toilet units');
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
  }, [authLoading, role, roleLoading, user]);

  const selectedDevice = useMemo(
    () => devices.find((device) => device.id === selectedToiletId) ?? null,
    [devices, selectedToiletId],
  );
  const selectedDeviceLabel = selectedDevice
    ? formatDeviceLabel(selectedDevice)
    : selectedToiletId;
  const recentTasks = tasks.filter((task) => task.triggeredAt > 0).slice(0, 5);
  const showAssignmentForm = role === 'admin';
  const showAssignmentSkeleton = roleLoading;
  const useTwoColumnLayout = showAssignmentForm || showAssignmentSkeleton;

  const openConfirmModal = () => {
    if (!selectedToiletId) {
      toast.error('Select a toilet unit before assigning a task.');
      return;
    }

    confirmDialogRef.current?.showModal();
  };

  const closeConfirmModal = () => {
    confirmDialogRef.current?.close();
  };

  const handleAssignTask = async () => {
    if (!user) {
      toast.error('You must be logged in to assign a task.');
      return;
    }

    if (!selectedToiletId) {
      toast.error('Select a toilet unit before assigning a task.');
      return;
    }

    setIsSubmitting(true);

    try {
      await apiFetch<CreateTaskResponse>('/api/tasks/create', user, {
        method: 'POST',
        body: JSON.stringify({
          toiletId: selectedToiletId,
          note: note.trim() || undefined,
        }),
      });

      setNote('');
      closeConfirmModal();
      toast.success('Cleaning task assigned to maintenance personnel');
    } catch (error) {
      toast.error(getErrorMessage(error) ?? 'Failed to assign cleaning task');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <section
        id="maintenance-task-panel"
        className={`grid gap-8 scroll-mt-24 ${
          useTwoColumnLayout ? 'grid-cols-1 xl:grid-cols-2' : 'grid-cols-1'
        }`}
      >
        {showAssignmentSkeleton ? (
          <div className="card border border-base-200 bg-base-100 shadow-xl">
            <div className="card-body space-y-5 p-6">
              <div className="flex items-center gap-3 border-b border-base-200 pb-4">
                <div className="skeleton h-10 w-10 rounded-xl"></div>
                <div className="space-y-2">
                  <div className="skeleton h-5 w-40"></div>
                  <div className="skeleton h-3 w-56"></div>
                </div>
              </div>
              <div className="space-y-4">
                <div className="skeleton h-4 w-32"></div>
                <div className="skeleton h-12 w-full"></div>
                <div className="skeleton h-4 w-24"></div>
                <div className="skeleton h-28 w-full"></div>
                <div className="skeleton h-12 w-full"></div>
              </div>
            </div>
          </div>
        ) : showAssignmentForm ? (
          <div className="card border border-base-200 bg-base-100 shadow-xl">
            <div className="card-body p-6">
              <div className="mb-6 flex items-center gap-3 border-b border-base-200 pb-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-warning/15 text-warning">
                  <BrushCleaning className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="card-title text-xl">Assign Cleaning Task</h2>
                  <p className="text-sm text-base-content/60">
                    Send a maintenance task to the mobile team for a specific
                    toilet unit.
                  </p>
                </div>
              </div>

              <div className="space-y-5">
                <div className="form-control w-full">
                  <label className="label" htmlFor="maintenance-toilet">
                    <span className="label-text font-medium text-base-content/80">
                      Toilet Unit
                    </span>
                  </label>
                  {devicesLoading ? (
                    <div className="skeleton h-12 w-full"></div>
                  ) : (
                    <select
                      id="maintenance-toilet"
                      className="select select-bordered w-full"
                      value={selectedToiletId}
                      onChange={(event) =>
                        setSelectedToiletId(event.target.value)
                      }
                    >
                      {devices.length === 0 ? (
                        <option value="">No toilet units available</option>
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

                <div className="form-control w-full">
                  <label className="label" htmlFor="maintenance-note">
                    <span className="label-text font-medium text-base-content/80">
                      Optional Note
                    </span>
                    <span className="label-text-alt text-base-content/50">
                      {note.length}/200
                    </span>
                  </label>
                  <textarea
                    id="maintenance-note"
                    className="textarea textarea-bordered min-h-28 w-full"
                    maxLength={200}
                    placeholder="Add a note for maintenance personnel..."
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                  ></textarea>
                </div>

                <button
                  type="button"
                  className="btn btn-warning h-12 w-full"
                  disabled={
                    isSubmitting || devicesLoading || devices.length === 0
                  }
                  onClick={openConfirmModal}
                >
                  {isSubmitting ? (
                    <>
                      <span className="loading loading-spinner loading-sm"></span>
                      Assigning Task...
                    </>
                  ) : (
                    <>
                      <BrushCleaning className="h-4 w-4" />
                      Assign Task
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <div className="card border border-base-200 bg-base-100 shadow-xl">
          <div className="card-body p-6">
            <div className="mb-6 flex items-center justify-between gap-4 border-b border-base-200 pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <ClipboardList className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="card-title text-xl">Maintenance Tasks</h2>
                    <span className="relative flex h-3 w-3 items-center justify-center">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75"></span>
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-success"></span>
                    </span>
                    <span className="text-xs font-semibold uppercase tracking-wider text-success">
                      Live
                    </span>
                  </div>
                  <p className="text-sm text-base-content/60">
                    Latest mobile maintenance tasks and acknowledgments.
                  </p>
                </div>
              </div>

              {tasksLoading ? (
                <div className="skeleton h-8 w-24 rounded-full"></div>
              ) : (
                <div className="badge badge-outline gap-2 px-3 py-3 text-xs font-semibold uppercase tracking-wide">
                  Pending
                  <span className="font-bold text-warning">{pendingCount}</span>
                </div>
              )}
            </div>

            {tasksLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((item) => (
                  <div
                    key={item}
                    className="rounded-2xl border border-base-200 bg-base-100 p-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="w-full space-y-3">
                        <div className="skeleton h-4 w-28"></div>
                        <div className="skeleton h-3 w-40"></div>
                      </div>
                      <div className="skeleton h-7 w-24 rounded-full"></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : recentTasks.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-base-300 bg-base-200/30 px-6 py-12 text-center text-base-content/55">
                <p className="font-medium">No tasks assigned yet</p>
              </div>
            ) : (
              <div className="space-y-4">
                {recentTasks.map((task) => (
                  <div
                    key={task.id}
                    className="rounded-2xl border border-base-200 bg-base-100 p-4 shadow-sm transition-colors hover:bg-base-200/30"
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="font-semibold text-base-content">
                          {task.toiletId}
                        </p>
                        <p className="mt-1 text-sm text-base-content/65">
                          Time sent{' '}
                          {formatDistanceToNow(new Date(task.triggeredAt), {
                            addSuffix: true,
                          })}
                        </p>
                      </div>
                      <div
                        className={`badge gap-1 border-0 px-3 py-3 font-semibold ${getStatusBadgeClassName(
                          task.status,
                        )}`}
                      >
                        {getStatusLabel(task.status)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <dialog
        ref={confirmDialogRef}
        className="modal modal-bottom sm:modal-middle"
      >
        <div className="modal-box">
          <h3 className="flex items-center gap-2 text-lg font-bold text-warning">
            <BrushCleaning className="h-5 w-5" />
            Confirm Cleaning Task
          </h3>
          <p className="py-4">
            Assign a cleaning task to maintenance personnel for{' '}
            <span className="font-semibold">{selectedDeviceLabel}</span>?
          </p>
          <div className="modal-action">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={closeConfirmModal}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-warning"
              onClick={() => void handleAssignTask()}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <span className="loading loading-spinner loading-sm"></span>
                  Assigning...
                </>
              ) : (
                'Confirm'
              )}
            </button>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button disabled={isSubmitting}>close</button>
        </form>
      </dialog>
    </>
  );
}
