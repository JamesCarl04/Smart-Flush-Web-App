'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  collection,
  query,
  where,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useTasks } from '@/hooks/useTasks';
import { ChevronDown, ChevronUp, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { formatDurationMs } from '@/lib/format-utils';
import type { Task } from '@/types';

interface PersonnelDoc {
  id: string;
  displayName: string;
  email: string | null;
  shift?: string;
  isAvailable?: boolean;
}

type PersonnelStatus = 'available' | 'on_task' | 'offline';

interface PersonnelRow {
  id: string;
  displayName: string;
  email: string | null;
  shift: string;
  status: PersonnelStatus;
  currentTask: string | null;
  avgResponseTime: string;
}

function getStatusConfig(status: PersonnelStatus) {
  switch (status) {
    case 'available':
      return {
        emoji: '🟢',
        label: 'Available',
        badgeClass: 'bg-green-500/10 text-green-600 border-green-500/20',
      };
    case 'on_task':
      return {
        emoji: '🔴',
        label: 'On Task',
        badgeClass: 'bg-red-500/10 text-red-600 border-red-500/20',
      };
    case 'offline':
      return {
        emoji: '🟡',
        label: 'Offline',
        badgeClass: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
      };
  }
}

function computeAvgResponseTime(
  personnelId: string,
  tasks: Task[],
): string {
  const responded = tasks.filter(
    (t) =>
      t.status !== 'pending' &&
      (t.assignedTo === personnelId ||
        (t.assignedToIds && t.assignedToIds.includes(personnelId))),
  );

  if (responded.length === 0) return '—';

  let totalMs = 0;
  let count = 0;

  for (const task of responded) {
    const ackTime =
      task.acknowledgedBy?.[personnelId] ?? task.acknowledgedAt;
    if (ackTime && task.createdAt) {
      totalMs += ackTime - task.createdAt;
      count++;
    }
  }

  if (count === 0) return '—';

  const avgMs = totalMs / count;
  return formatDurationMs(avgMs);
}

function determinePersonnelStatus(
  person: PersonnelDoc,
  activeTasks: Task[],
): { status: PersonnelStatus; currentTask: string | null } {
  // If the doc has an explicit isAvailable field set to false, mark offline
  if (person.isAvailable === false) {
    return { status: 'offline', currentTask: null };
  }

  // Check if the person is currently on an active (non-completed) task
  const activeTask = activeTasks.find(
    (t) =>
      t.status !== 'completed' &&
      (t.assignedTo === person.id ||
        (t.assignedToIds && t.assignedToIds.includes(person.id))),
  );

  if (activeTask) {
    return { status: 'on_task', currentTask: activeTask.message };
  }

  return { status: 'available', currentTask: null };
}

export function TeamAvailabilityTable() {
  const [personnel, setPersonnel] = useState<PersonnelDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const { tasks, loading: tasksLoading } = useTasks();

  // Real-time Firestore listener on users with role == 'maintenance'
  useEffect(() => {
    const q = query(
      collection(db, 'users'),
      where('role', '==', 'maintenance'),
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const docs: PersonnelDoc[] = snapshot.docs
          .map((doc) => {
            const data = doc.data();
            const email =
              typeof data.email === 'string' && data.email.trim()
                ? data.email
                : null;
            return {
              id: doc.id,
              displayName: data.displayName || email || doc.id,
              email,
              shift: typeof data.shift === 'string' ? data.shift : '—',
              isAvailable:
                typeof data.isAvailable === 'boolean'
                  ? data.isAvailable
                  : undefined,
            };
          })
          .sort((a, b) => a.displayName.localeCompare(b.displayName));
        setPersonnel(docs);
        setLoading(false);
      },
      (error) => {
        console.error('[TeamAvailabilityTable] Firestore error:', error);
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, []);

  const rows: PersonnelRow[] = useMemo(() => {
    return personnel.map((person) => {
      const { status, currentTask } = determinePersonnelStatus(
        person,
        tasks,
      );
      return {
        id: person.id,
        displayName: person.displayName,
        email: person.email,
        shift: person.shift ?? '—',
        status,
        currentTask,
        avgResponseTime: computeAvgResponseTime(person.id, tasks),
      };
    });
  }, [personnel, tasks]);

  const isLoading = loading || tasksLoading;

  return (
    <div className="card bg-base-100 shadow-xl border border-base-200 mb-8">
      <div className="card-body p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="card-title text-lg font-semibold">
            Team Availability
          </h2>
          <div className="flex items-center gap-2 text-xs text-base-content/50">
            <span className="inline-block h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            Real-time
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="skeleton h-14 w-full rounded-lg" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex items-center justify-center min-h-[200px]">
            <p className="text-base-content/40 text-sm">
              No maintenance personnel found.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table table-zebra w-full">
              <thead>
                <tr className="text-base-content/60">
                  <th className="font-semibold">Name</th>
                  <th className="font-semibold">Shift</th>
                  <th className="font-semibold">Status</th>
                  <th className="font-semibold">Current Task</th>
                  <th className="font-semibold">
                    <div className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      Avg Response
                    </div>
                  </th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const statusConfig = getStatusConfig(row.status);
                  const isExpanded = expandedRow === row.id;
                  return (
                    <>
                      <tr
                        key={row.id}
                        className="cursor-pointer hover:bg-base-200/50 transition-colors duration-150"
                        onClick={() =>
                          setExpandedRow(isExpanded ? null : row.id)
                        }
                      >
                        <td>
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-bold">
                              {row.displayName
                                .split(' ')
                                .map((n) => n[0])
                                .join('')
                                .slice(0, 2)
                                .toUpperCase()}
                            </div>
                            <div>
                              <div className="font-medium">
                                {row.displayName}
                              </div>
                              {row.email && (
                                <div className="text-xs text-base-content/50">
                                  {row.email}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className="badge badge-ghost badge-sm">
                            {row.shift}
                          </span>
                        </td>
                        <td>
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${statusConfig.badgeClass}`}
                          >
                            <span>{statusConfig.emoji}</span>
                            {statusConfig.label}
                          </span>
                        </td>
                        <td>
                          {row.currentTask ? (
                            <span className="text-sm max-w-[200px] truncate block">
                              {row.currentTask}
                            </span>
                          ) : (
                            <span className="text-base-content/30">—</span>
                          )}
                        </td>
                        <td>
                          <span className="text-sm font-mono">
                            {row.avgResponseTime}
                          </span>
                        </td>
                        <td>
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4 text-base-content/40" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-base-content/40" />
                          )}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr key={`${row.id}-details`}>
                          <td
                            colSpan={6}
                            className="bg-base-200/30 px-6 py-4"
                          >
                            <ExpandedPersonnelDetails
                              row={row}
                              tasks={tasks}
                            />
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function ExpandedPersonnelDetails({
  row,
  tasks,
}: {
  row: PersonnelRow;
  tasks: Task[];
}) {
  const assignedTasks = useMemo(
    () =>
      tasks.filter(
        (t) =>
          t.assignedTo === row.id ||
          (t.assignedToIds && t.assignedToIds.includes(row.id)),
      ),
    [row.id, tasks],
  );

  const completedToday = useMemo(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    return assignedTasks.filter(
      (t) =>
        t.status === 'completed' &&
        t.completedAt &&
        t.completedAt >= todayStart.getTime(),
    ).length;
  }, [assignedTasks]);

  const totalCompleted = assignedTasks.filter(
    (t) => t.status === 'completed',
  ).length;
  const activeTasks = assignedTasks.filter(
    (t) => t.status !== 'completed',
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-base-content/50">
          Performance
        </h4>
        <div className="text-sm space-y-1">
          <p>
            <span className="text-base-content/60">Completed today:</span>{' '}
            <span className="font-semibold">{completedToday}</span>
          </p>
          <p>
            <span className="text-base-content/60">Total completed:</span>{' '}
            <span className="font-semibold">{totalCompleted}</span>
          </p>
          <p>
            <span className="text-base-content/60">Avg response:</span>{' '}
            <span className="font-semibold font-mono">
              {row.avgResponseTime}
            </span>
          </p>
        </div>
      </div>
      <div className="md:col-span-2 space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-base-content/50">
          Active Tasks ({activeTasks.length})
        </h4>
        {activeTasks.length === 0 ? (
          <p className="text-sm text-base-content/40">
            No active tasks assigned.
          </p>
        ) : (
          <div className="space-y-1.5">
            {activeTasks.slice(0, 3).map((task) => (
              <div
                key={task.id}
                className="flex items-center justify-between rounded-lg bg-base-100 px-3 py-2 text-sm border border-base-200"
              >
                <span className="truncate max-w-[300px]">
                  {task.message}
                </span>
                <span className="text-xs text-base-content/50 whitespace-nowrap ml-2">
                  {formatDistanceToNow(new Date(task.createdAt), {
                    addSuffix: true,
                  })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
