'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { formatDistanceToNow } from 'date-fns';
import {
  ClipboardList,
  Clock,
  UserCheck,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  Wrench,
  Droplets,
  Plus,
} from 'lucide-react';
import { useTasks } from '@/hooks/useTasks';
import type { TaskTriggerType } from '@/types';

function getPriorityBadge(triggerType?: TaskTriggerType) {
  switch (triggerType) {
    case 'maintenance':
      return {
        label: 'Scheduled Maintenance',
        className:
          'bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/30',
        icon: <Wrench className="w-3 h-3" aria-hidden="true" />,
      };
    case 'uv_complete':
      return {
        label: 'Sanitation Check',
        className:
          'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30',
        icon: <Sparkles className="w-3 h-3" aria-hidden="true" />,
      };
    case 'flush_count':
      return {
        label: 'High Usage Check',
        className:
          'bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border border-cyan-500/30',
        icon: <Droplets className="w-3 h-3" aria-hidden="true" />,
      };
    case 'manual':
    default:
      return {
        label: 'Standard Request',
        className:
          'bg-slate-500/10 text-slate-700 dark:text-slate-300 border border-slate-500/30',
        icon: <Clock className="w-3 h-3" aria-hidden="true" />,
      };
  }
}

function resolveDeviceLabel(deviceId: string): string {
  if (deviceId === 'toilet-01') return "4F Men's Restroom - Stall 1";
  if (deviceId === 'toilet-02') return "4F Men's Restroom - Stall 2";
  if (deviceId === 'toilet-03') return "4F Women's Restroom - Stall 1";
  if (deviceId === 'toilet-04') return "4F Women's Restroom - Stall 2";
  return deviceId.replace(/[-_]/g, ' ');
}

function formatRelativeTimestamp(value: number | null): string {
  if (!value) return 'Just now';
  return formatDistanceToNow(new Date(value), { addSuffix: true });
}

export function ActiveTasksSummary() {
  const { tasks, loading } = useTasks();

  const stats = useMemo(() => {
    const pending = tasks.filter((t) => t.status === 'pending').length;
    const acknowledged = tasks.filter((t) => t.status === 'acknowledged').length;
    const completed = tasks.filter((t) => t.status === 'completed').length;
    return { pending, acknowledged, completed, totalActive: pending + acknowledged };
  }, [tasks]);

  const activeTasks = useMemo(() => {
    return tasks
      .filter((t) => t.status === 'pending' || t.status === 'acknowledged')
      .slice(0, 3);
  }, [tasks]);

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white/95 p-6 shadow-sm backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/90">
      {/* Header Row */}
      <div className="flex flex-col gap-3 pb-5 border-b border-slate-200 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary dark:bg-primary/20 dark:text-rose-400 border border-primary/20 shadow-sm">
            <ClipboardList className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100">
                Active Maintenance Tasks
              </h2>
              {stats.totalActive > 0 && (
                <span className="relative flex h-2 w-2 items-center justify-center">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Live work orders assigned to facilities and sanitation technicians.
            </p>
          </div>
        </div>

        {/* Quick Stat Badges & View All Link */}
        <div className="flex flex-wrap items-center gap-2">
          {!loading && (
            <div className="flex items-center gap-1.5 mr-1">
              <span className="inline-flex items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-800 dark:text-amber-300 tabular-nums">
                <Clock className="w-3 h-3" />
                <span>{stats.pending} Pending</span>
              </span>
              <span className="inline-flex items-center gap-1 rounded-lg border border-sky-500/30 bg-sky-500/10 px-2.5 py-1 text-xs font-semibold text-sky-800 dark:text-sky-300 tabular-nums">
                <UserCheck className="w-3 h-3" />
                <span>{stats.acknowledged} In Progress</span>
              </span>
            </div>
          )}

          <Link
            href="/tasks"
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-primary/90 transition-all active:translate-y-0.5 min-h-[34px]"
          >
            <span>Task Operations</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      {/* Body: Active Task Cards or Empty State */}
      <div className="mt-5">
        {loading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded-xl border border-slate-100 p-4 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-800/40"
              >
                <div className="space-y-2 w-2/3">
                  <div className="skeleton h-4 w-1/3 rounded" />
                  <div className="skeleton h-3 w-3/4 rounded" />
                </div>
                <div className="skeleton h-6 w-20 rounded-lg" />
              </div>
            ))}
          </div>
        ) : activeTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400 mb-3 border border-emerald-500/20">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
              All Maintenance Tasks Resolved
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm">
              There are no pending or unacknowledged work orders at this time.
            </p>
            <Link
              href="/tasks"
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition-colors"
            >
              <Plus className="h-3.5 w-3.5 text-primary" />
              <span>Dispatch New Task</span>
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {activeTasks.map((task) => {
              const priority = getPriorityBadge(task.triggerType);
              const isPending = task.status === 'pending';

              return (
                <div
                  key={task.id}
                  className="group flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-slate-200/90 bg-white p-4 transition-all hover:border-slate-300 hover:shadow-xs dark:border-slate-800 dark:bg-slate-800/50 dark:hover:border-slate-700"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1.5">
                      <span className="font-bold text-[11px] text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2 py-0.5 rounded-md whitespace-nowrap">
                        {resolveDeviceLabel(task.deviceId)}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${priority.className}`}
                      >
                        {priority.icon}
                        <span>{priority.label}</span>
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-bold whitespace-nowrap ${
                          isPending
                            ? 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30'
                            : 'bg-sky-500/15 text-sky-800 dark:text-sky-300 border border-sky-500/30'
                        }`}
                      >
                        {isPending ? (
                          <Clock className="w-3 h-3" />
                        ) : (
                          <UserCheck className="w-3 h-3" />
                        )}
                        <span>{isPending ? 'Pending' : 'Acknowledged'}</span>
                      </span>
                    </div>

                    <p className="truncate text-xs font-medium text-slate-900 dark:text-slate-100">
                      {task.message || 'No task instructions provided'}
                    </p>

                    <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                      <span>
                        Assigned to{' '}
                        <span className="font-semibold text-slate-700 dark:text-slate-300">
                          {task.assignedTo || 'Unassigned'}
                        </span>
                      </span>
                      <span>·</span>
                      <span>{formatRelativeTimestamp(task.createdAt)}</span>
                    </div>
                  </div>

                  <Link
                    href={`/tasks?taskId=${encodeURIComponent(task.id)}`}
                    className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline self-end sm:self-center"
                  >
                    <span>Manage</span>
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
