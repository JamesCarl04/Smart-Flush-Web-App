'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { formatDistanceToNow } from 'date-fns';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  User,
  UserPlus,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useMaintenancePersonnel } from '@/hooks/useMaintenancePersonnel';
import { useTasks } from '@/hooks/useTasks';
import { apiFetch } from '@/lib/api-client';
import { db } from '@/lib/firebase';
import { getErrorMessage } from '@/lib/error-utils';
import type { Task } from '@/types';

type UserRole = 'admin' | 'supervisor' | 'maintenance' | 'viewer' | 'user' | null;

interface UpdateTaskResponse {
  success: boolean;
  data?: Task;
  error?: string;
}

function getStatusBadge(task: Task) {
  const isUnassigned =
    task.status !== 'completed' &&
    (!task.assignedTo || task.assignedTo.trim() === '') &&
    (!task.assignedToIds || task.assignedToIds.length === 0);

  if (isUnassigned) {
    return {
      label: 'UNASSIGNED',
      className: 'bg-red-500/10 text-red-600 border-red-500/20',
    };
  }

  switch (task.status) {
    case 'pending':
      return {
        label: 'Pending',
        className: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
      };
    case 'acknowledged':
      return {
        label: 'Acknowledged',
        className: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
      };
    case 'completed':
      return {
        label: 'Completed',
        className: 'bg-green-500/10 text-green-600 border-green-500/20',
      };
    default:
      return {
        label: task.status,
        className: 'bg-base-200 text-base-content/60',
      };
  }
}

function isTaskUnassigned(task: Task): boolean {
  return (
    task.status !== 'completed' &&
    (!task.assignedTo || task.assignedTo.trim() === '') &&
    (!task.assignedToIds || task.assignedToIds.length === 0)
  );
}

export function ActiveTasksList() {
  const { user, loading: authLoading } = useAuth();
  const { tasks, loading: tasksLoading, refreshTasks } = useTasks();
  const {
    personnel,
    personnelById,
    loading: personnelLoading,
  } = useMaintenancePersonnel();
  const [role, setRole] = useState<UserRole>(null);
  const [roleLoading, setRoleLoading] = useState(true);
  const [assigningTaskId, setAssigningTaskId] = useState<string | null>(null);
  const [selectedPersonnelId, setSelectedPersonnelId] = useState('');
  const [assignError, setAssignError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const assignDialogRef = useRef<HTMLDialogElement | null>(null);

  // Load user role
  useEffect(() => {
    let cancelled = false;

    const loadRole = async () => {
      if (authLoading || !user) {
        if (!authLoading) setRoleLoading(false);
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
      } catch {
        if (!cancelled) setRole('user');
      } finally {
        if (!cancelled) setRoleLoading(false);
      }
    };

    void loadRole();
    return () => {
      cancelled = true;
    };
  }, [authLoading, user]);

  // Filter to active tasks (non-completed), sorted with unassigned first
  const activeTasks = useMemo(() => {
    const nonCompleted = tasks.filter((t) => t.status !== 'completed');
    return nonCompleted.sort((a, b) => {
      const aUnassigned = isTaskUnassigned(a);
      const bUnassigned = isTaskUnassigned(b);
      if (aUnassigned && !bUnassigned) return -1;
      if (!aUnassigned && bUnassigned) return 1;
      return b.createdAt - a.createdAt;
    });
  }, [tasks]);

  const resolveAssignedName = (task: Task): string => {
    const ids =
      task.assignedToIds && task.assignedToIds.length > 0
        ? task.assignedToIds
        : task.assignedTo
          ? [task.assignedTo]
          : [];

    if (ids.length === 0) return 'UNASSIGNED';

    if (personnelLoading) return 'Loading...';

    return ids
      .map((id) => personnelById[id]?.displayName ?? id)
      .join(', ');
  };

  const openAssignModal = (taskId: string) => {
    setAssigningTaskId(taskId);
    setSelectedPersonnelId(personnel[0]?.id ?? '');
    setAssignError(null);
    assignDialogRef.current?.showModal();
  };

  const closeAssignModal = () => {
    assignDialogRef.current?.close();
    setAssigningTaskId(null);
    setSelectedPersonnelId('');
    setAssignError(null);
  };

  const handleAssign = async () => {
    if (!user || !assigningTaskId || !selectedPersonnelId) return;

    setIsSubmitting(true);
    setAssignError(null);

    try {
      await apiFetch<UpdateTaskResponse>(
        `/api/tasks/${assigningTaskId}`,
        user,
        {
          method: 'PATCH',
          body: JSON.stringify({
            assignedTo: selectedPersonnelId,
            assignedToIds: [selectedPersonnelId],
          }),
        },
      );

      closeAssignModal();
      await refreshTasks();
    } catch (error) {
      setAssignError(getErrorMessage(error) ?? 'Failed to assign task');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isLoading = tasksLoading || roleLoading;
  const isAdminOrSupervisor = role === 'admin' || role === 'supervisor';

  return (
    <>
      <div className="card bg-base-100 shadow-xl border border-base-200">
        <div className="card-body p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="card-title text-lg font-semibold">Active Tasks</h2>
            <span className="badge badge-ghost badge-sm">
              {activeTasks.length} task{activeTasks.length !== 1 ? 's' : ''}
            </span>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="skeleton h-20 w-full rounded-lg" />
              ))}
            </div>
          ) : activeTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center min-h-[200px] gap-3">
              <CheckCircle2 className="h-12 w-12 text-green-500/30" />
              <p className="text-base-content/40 text-sm">
                All tasks are completed. Great work!
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {activeTasks.map((task) => {
                const unassigned = isTaskUnassigned(task);
                const badge = getStatusBadge(task);

                return (
                  <div
                    key={task.id}
                    className={`rounded-xl border bg-base-100 p-4 transition-all duration-200 hover:shadow-md ${
                      unassigned
                        ? 'border-l-4 border-l-red-500 border-t-base-200 border-r-base-200 border-b-base-200 bg-red-500/[0.02]'
                        : 'border-base-200'
                    }`}
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                      {/* Left info */}
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs bg-base-200 px-2 py-0.5 rounded text-base-content/60">
                            #{task.id.slice(-6).toUpperCase()}
                          </span>
                          <span
                            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${badge.className}`}
                          >
                            {badge.label}
                          </span>
                        </div>

                        {/* Component / message */}
                        <p className="text-sm font-medium truncate max-w-md">
                          {task.message || 'No description'}
                        </p>

                        {/* Location = deviceId */}
                        <div className="flex items-center gap-4 text-xs text-base-content/50">
                          <span className="inline-flex items-center gap-1">
                            📍 {task.deviceId}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatDistanceToNow(new Date(task.createdAt), {
                              addSuffix: true,
                            })}
                          </span>
                        </div>
                      </div>

                      {/* Right info */}
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right">
                          <div className="text-xs text-base-content/50 mb-0.5">
                            Assigned to
                          </div>
                          {unassigned ? (
                            <span className="inline-flex items-center gap-1 text-sm font-bold text-red-500">
                              <AlertTriangle className="h-3.5 w-3.5" />
                              UNASSIGNED
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-sm font-medium">
                              <User className="h-3.5 w-3.5 text-base-content/40" />
                              {resolveAssignedName(task)}
                            </span>
                          )}
                        </div>

                        {unassigned && isAdminOrSupervisor && (
                          <button
                            className="btn btn-sm btn-primary gap-1.5"
                            onClick={() => openAssignModal(task.id)}
                          >
                            <UserPlus className="h-3.5 w-3.5" />
                            Assign
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Assign Modal */}
      <dialog ref={assignDialogRef} className="modal">
        <div className="modal-box">
          <h3 className="text-lg font-bold mb-1">Assign Task</h3>
          <p className="text-sm text-base-content/60 mb-4">
            Select a staff member to assign this task to.
          </p>

          {personnelLoading ? (
            <div className="skeleton h-12 w-full rounded-lg" />
          ) : personnel.length === 0 ? (
            <div className="alert alert-warning text-sm">
              No maintenance personnel available.
            </div>
          ) : (
            <div className="form-control w-full">
              <label className="label" htmlFor="assign-personnel-select">
                <span className="label-text font-medium">
                  Available Personnel
                </span>
              </label>
              <select
                id="assign-personnel-select"
                className="select select-bordered w-full"
                value={selectedPersonnelId}
                onChange={(e) => setSelectedPersonnelId(e.target.value)}
              >
                {personnel.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.displayName}
                    {person.email ? ` (${person.email})` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {assignError && (
            <div className="alert alert-error text-sm mt-3">
              {assignError}
            </div>
          )}

          <div className="modal-action">
            <button
              className="btn btn-ghost"
              onClick={closeAssignModal}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              className="btn btn-primary gap-1.5"
              onClick={handleAssign}
              disabled={
                isSubmitting || !selectedPersonnelId || personnel.length === 0
              }
            >
              {isSubmitting ? (
                <span className="loading loading-spinner loading-sm" />
              ) : (
                <UserPlus className="h-4 w-4" />
              )}
              Assign
            </button>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button>close</button>
        </form>
      </dialog>
    </>
  );
}
