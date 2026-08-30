'use client';

import Link from 'next/link';
import { useMemo, useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { useAlerts, AlertSeverity } from '@/hooks/useAlerts';
import { useTasks } from '@/hooks/useTasks';
import { formatDistanceToNow } from 'date-fns';
import {
  Bell,
  CheckCircle2,
  AlertTriangle,
  Info,
  AlertOctagon,
  CheckSquare,
  AlertCircle,
  Clock,
  ExternalLink,
  ShieldCheck,
  Check,
  X,
} from 'lucide-react';

type AlertFilter = 'all' | 'critical_high' | 'unread' | 'tasks';

type DashboardAlert =
  | {
      id: string;
      title: string;
      description: string;
      severity: AlertSeverity;
      timestamp: Date;
      acknowledged: boolean;
      source: 'system';
    }
  | {
      id: string;
      title: string;
      description: string;
      severity: 'medium';
      timestamp: Date;
      acknowledged: false;
      source: 'task';
      taskId: string;
      deviceId: string;
    };

const OVERDUE_TASK_THRESHOLD_MS = 30 * 60 * 1000;

export default function AlertsPage() {
  const {
    alerts,
    loading: alertsLoading,
    acknowledgeAlert,
    acknowledgeAlerts,
    refresh,
  } = useAlerts();
  const { tasks, loading: tasksLoading } = useTasks(50);
  const [filter, setFilter] = useState<AlertFilter>('all');
  const [dismissingIds, setDismissingIds] = useState<string[]>([]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNow(Date.now());
    }, 60_000);

    return () => window.clearInterval(intervalId);
  }, []);

  const dashboardAlerts = useMemo<DashboardAlert[]>(() => {
    const systemAlerts: DashboardAlert[] = alerts.map((alert) => ({
      ...alert,
      source: 'system',
    }));

    const overdueTaskAlerts: DashboardAlert[] = tasks
      .filter(
        (task) =>
          task.createdAt > 0 &&
          task.status === 'pending' &&
          now - task.createdAt > OVERDUE_TASK_THRESHOLD_MS,
      )
      .map((task) => {
        const pendingMinutes = Math.floor((now - task.createdAt) / 60_000);

        return {
          id: `task-overdue-${task.id}`,
          title: 'Maintenance Task Overdue',
          description: `Cleaning task for ${task.deviceId} has been pending for ${pendingMinutes} minutes without acknowledgment.`,
          severity: 'medium' as const,
          timestamp: new Date(task.createdAt + OVERDUE_TASK_THRESHOLD_MS),
          acknowledged: false,
          source: 'task' as const,
          taskId: task.id,
          deviceId: task.deviceId,
        };
      });

    return [...systemAlerts, ...overdueTaskAlerts].sort(
      (left, right) => right.timestamp.getTime() - left.timestamp.getTime(),
    );
  }, [alerts, now, tasks]);

  const loading = alertsLoading || tasksLoading;
  const unreadCount = dashboardAlerts.filter((alert) => !alert.acknowledged).length;
  const criticalHighCount = dashboardAlerts.filter(
    (a) => a.severity === 'critical' || a.severity === 'high',
  ).length;
  const taskAlertsCount = dashboardAlerts.filter((a) => a.source === 'task').length;

  const filteredAlerts = useMemo(
    () =>
      dashboardAlerts.filter((alert) => {
        if (filter === 'tasks') {
          return alert.source === 'task';
        }

        if (filter === 'unread') {
          return !alert.acknowledged;
        }

        if (filter === 'critical_high') {
          return alert.severity === 'critical' || alert.severity === 'high';
        }

        return true;
      }),
    [dashboardAlerts, filter],
  );

  const getSeverityBadge = (severity: AlertSeverity) => {
    switch (severity) {
      case 'critical':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-700 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-300">
            <AlertOctagon className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" />
            Critical
          </span>
        );
      case 'high':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
            Warning (High)
          </span>
        );
      case 'medium':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
            <AlertCircle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
            Warning
          </span>
        );
      case 'low':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-xs font-semibold text-sky-700 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-300">
            <Info className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
            Info
          </span>
        );
    }
  };

  const handleAcknowledge = async (id: string | 'ALL') => {
    const idsToDismiss =
      id === 'ALL'
        ? filteredAlerts
            .filter((alert) => alert.source === 'system' && !alert.acknowledged)
            .map((alert) => alert.id)
        : [id];

    if (idsToDismiss.length === 0) {
      return;
    }

    setDismissingIds((current) =>
      Array.from(new Set([...current, ...idsToDismiss])),
    );
    await new Promise((resolve) => window.setTimeout(resolve, 220));

    const success =
      id === 'ALL'
        ? await acknowledgeAlerts(idsToDismiss)
        : await acknowledgeAlert(id);
    if (success) {
      toast.success(
        id === 'ALL' ? 'All alerts acknowledged' : 'Alert acknowledged',
      );
    } else {
      toast.error('Failed to acknowledge alert');
    }

    setDismissingIds((current) =>
      current.filter((dismissedId) => !idsToDismiss.includes(dismissedId)),
    );
  };

  const handleDismiss = async (alertId: string) => {
    // Acknowledge single alert as dismiss action
    await handleAcknowledge(alertId);
  };

  return (
    <div className="container mx-auto max-w-5xl animate-fade-in p-4 pb-24 md:p-8">
      {/* Modern Clean Headline (Slate typography) */}
      <div className="mb-8 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl">
            System Alerts
          </h1>
          <span className="sr-only">
            Monitor restroom equipment notifications, maintenance tasks, and system alerts.
          </span>
        </div>

        {/* Quick Triage Actions */}
        <div className="flex items-center gap-3">
          <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Unread</span>
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#B5121B] px-1.5 text-xs font-bold text-white tabular-nums">
              {unreadCount}
            </span>
          </div>

          <button
            type="button"
            className="tactile-btn inline-flex min-h-[40px] items-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm transition-all hover:bg-slate-50 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
            onClick={() => handleAcknowledge('ALL')}
            disabled={
              loading ||
              filteredAlerts.every(
                (alert) => alert.source !== 'system' || alert.acknowledged,
              )
            }
          >
            Mark All as Read
          </button>
        </div>
      </div>

      {/* Main Alert Container */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        {/* Triage Tab Bar (*All Alerts*, *Critical & High*, *Unread*, *Tasks*) */}
        <div className="flex flex-wrap items-center gap-1 border-b border-slate-100 p-2 dark:border-slate-800 sm:gap-2 sm:p-3">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-medium transition-all ${
              filter === 'all'
                ? 'bg-slate-100 font-semibold text-slate-900 shadow-sm dark:bg-slate-800 dark:text-slate-100'
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-200'
            }`}
          >
            <span>All Alerts</span>
            <span className="rounded-full bg-slate-200/80 px-1.5 py-0.5 text-[10px] font-bold text-slate-700 dark:bg-slate-700 dark:text-slate-300 tabular-nums">
              {dashboardAlerts.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setFilter('critical_high')}
            className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-medium transition-all ${
              filter === 'critical_high'
                ? 'bg-rose-50 font-semibold text-rose-800 shadow-sm dark:bg-rose-950/50 dark:text-rose-300'
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-200'
            }`}
          >
            <span>Critical & High</span>
            {criticalHighCount > 0 && (
              <span className="rounded-full bg-rose-200 px-1.5 py-0.5 text-[10px] font-bold text-rose-900 dark:bg-rose-900 dark:text-rose-200 tabular-nums">
                {criticalHighCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setFilter('unread')}
            className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-medium transition-all ${
              filter === 'unread'
                ? 'bg-red-50 font-semibold text-[#B5121B] shadow-sm dark:bg-red-950/50 dark:text-red-300'
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-200'
            }`}
          >
            <span>Unread</span>
            {unreadCount > 0 && (
              <span className="rounded-full bg-red-200 px-1.5 py-0.5 text-[10px] font-bold text-red-900 dark:bg-red-900 dark:text-red-200 tabular-nums">
                {unreadCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setFilter('tasks')}
            className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-medium transition-all ${
              filter === 'tasks'
                ? 'bg-amber-50 font-semibold text-amber-800 shadow-sm dark:bg-amber-950/50 dark:text-amber-300'
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-200'
            }`}
          >
            <span>Tasks</span>
            {taskAlertsCount > 0 && (
              <span className="rounded-full bg-amber-200 px-1.5 py-0.5 text-[10px] font-bold text-amber-900 dark:bg-amber-900 dark:text-amber-200 tabular-nums">
                {taskAlertsCount}
              </span>
            )}
          </button>
        </div>

        {/* Content List / Calm Empty State */}
        <div className="p-4 sm:p-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-center" role="status">
              <span className="h-6 w-6 animate-spin rounded-full border-2 border-[#B5121B] border-t-transparent mb-3" aria-hidden="true" />
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Loading alerts...</p>
            </div>
          ) : filteredAlerts.length === 0 ? (
            /* Illustrated Calm Empty State */
            <div className="flex flex-col items-center justify-center py-16 text-center px-4">
              <div className="relative mb-5 flex h-20 w-20 items-center justify-center rounded-3xl bg-emerald-50 text-emerald-600 shadow-inner dark:bg-emerald-950/50 dark:text-emerald-400">
                <div className="absolute inset-0 rounded-3xl bg-emerald-400/20 blur-xl"></div>
                <ShieldCheck className="relative h-10 w-10" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                All Systems Normal
              </h3>
              <p className="mt-1 max-w-sm text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                You&apos;re completely caught up. No active warnings or unresolved alerts matching the selected filter.
              </p>
              <button
                type="button"
                onClick={() => {
                  setFilter('all');
                  void refresh();
                }}
                className="mt-6 inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm transition-all hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                Reset Filter
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredAlerts.map((alert) => {
                const isDismissing = dismissingIds.includes(alert.id);

                return (
                  <div
                    key={alert.id}
                    className={`group relative flex flex-col justify-between gap-4 rounded-2xl border p-5 transition-all duration-200 sm:flex-row sm:items-center ${
                      isDismissing
                        ? 'translate-x-2 scale-[0.98] opacity-0'
                        : alert.acknowledged
                          ? 'border-slate-100 bg-slate-50/60 opacity-75 dark:border-slate-800/60 dark:bg-slate-800/30'
                          : 'border-slate-200 bg-white shadow-sm hover:border-slate-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-start gap-4 flex-1 min-w-0">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1.5">
                          <h3
                            className={`font-semibold text-sm sm:text-base ${
                              alert.acknowledged
                                ? 'text-slate-600 dark:text-slate-400'
                                : 'text-slate-900 dark:text-slate-100'
                            }`}
                          >
                            {alert.title}
                          </h3>
                          {getSeverityBadge(alert.severity)}
                        </div>

                        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl">
                          {alert.description}
                        </p>

                        {/* Timestamp Chip */}
                        <div className="mt-3 flex items-center gap-2">
                          <span className="inline-flex items-center gap-1 rounded-md border border-slate-100 bg-slate-50 px-2 py-0.5 font-mono text-[11px] text-slate-500 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-400">
                            <Clock className="h-3 w-3 text-slate-400" />
                            {formatDistanceToNow(new Date(alert.timestamp), {
                              addSuffix: true,
                            })}
                          </span>

                          {alert.source === 'task' && (
                            <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                              Facility Task
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Quick Action Triggers */}
                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                      {alert.source === 'task' ? (
                        <Link
                          href={`/tasks?taskId=${encodeURIComponent(alert.taskId)}`}
                          className="tactile-btn inline-flex items-center rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2 text-xs font-semibold text-amber-800 shadow-sm transition-all hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300 dark:hover:bg-amber-900/50"
                        >
                          View Task
                        </Link>
                      ) : !alert.acknowledged ? (
                        <div className="flex items-center gap-2">
                          {/* Dismiss Button */}
                          <button
                            type="button"
                            className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300 transition-colors"
                            title="Dismiss Alert"
                            onClick={() => handleDismiss(alert.id)}
                          >
                            <X className="h-4 w-4" />
                          </button>

                          {/* Acknowledge Button */}
                          <button
                            type="button"
                            className="tactile-btn inline-flex min-h-[40px] items-center rounded-xl bg-[#B5121B] px-4 py-2 text-xs font-semibold text-white shadow-sm transition-all hover:bg-[#8F0D16] focus:outline-none"
                            disabled={isDismissing}
                            data-loading={isDismissing}
                            onClick={() => handleAcknowledge(alert.id)}
                          >
                            {isDismissing ? (
                              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent mr-1.5"></span>
                            ) : null}
                            Acknowledge
                          </button>
                        </div>
                      ) : (
                        <div className="inline-flex items-center rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400">
                          Acknowledged
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
