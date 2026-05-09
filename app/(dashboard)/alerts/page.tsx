'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import toast, { Toaster } from 'react-hot-toast';
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
      toiletId: string;
    };

const OVERDUE_TASK_THRESHOLD_MS = 30 * 60 * 1000;

export default function AlertsPage() {
  const {
    alerts,
    loading: alertsLoading,
    acknowledgeAlert,
    acknowledgeAlerts,
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
          task.triggeredAt > 0 &&
          task.status === 'pending' &&
          now - task.triggeredAt > OVERDUE_TASK_THRESHOLD_MS,
      )
      .map((task) => {
        const pendingMinutes = Math.floor((now - task.triggeredAt) / 60_000);

        return {
          id: `task-overdue-${task.id}`,
          title: 'Maintenance Task Overdue',
          description: `Cleaning task for ${task.toiletId} has been pending for ${pendingMinutes} minutes without acknowledgment.`,
          severity: 'medium',
          timestamp: new Date(task.triggeredAt + OVERDUE_TASK_THRESHOLD_MS),
          acknowledged: false,
          source: 'task',
          taskId: task.id,
          toiletId: task.toiletId,
        };
      });

    return [...systemAlerts, ...overdueTaskAlerts].sort(
      (left, right) => right.timestamp.getTime() - left.timestamp.getTime(),
    );
  }, [alerts, now, tasks]);

  const loading = alertsLoading || tasksLoading;
  const unreadCount = dashboardAlerts.filter(
    (alert) => !alert.acknowledged,
  ).length;

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

  const getSeverityMeta = (severity: AlertSeverity) => {
    switch (severity) {
      case 'critical':
        return {
          badgeClassName: 'badge-error text-white',
          icon: <AlertOctagon className="h-4 w-4 text-error" />,
          rowIcon: <AlertOctagon className="h-5 w-5 text-error" />,
        };
      case 'high':
        return {
          badgeClassName: 'border-orange-200 bg-orange-100 text-orange-700',
          icon: <AlertTriangle className="h-4 w-4 text-orange-500" />,
          rowIcon: <AlertTriangle className="h-5 w-5 text-orange-500" />,
        };
      case 'medium':
        return {
          badgeClassName: 'border-amber-200 bg-amber-100 text-amber-700',
          icon: <AlertCircle className="h-4 w-4 text-amber-500" />,
          rowIcon: <AlertCircle className="h-5 w-5 text-amber-500" />,
        };
      case 'low':
        return {
          badgeClassName: 'badge-info badge-outline',
          icon: <Info className="h-4 w-4 text-info" />,
          rowIcon: <Info className="h-5 w-5 text-info" />,
        };
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

  return (
    <div className="container mx-auto max-w-5xl animate-fade-in p-4 md:p-8">
      <div className="mb-8 flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h1 className="flex items-center gap-3 bg-gradient-to-r from-primary to-secondary bg-clip-text text-3xl font-bold text-transparent">
            <Bell className="h-8 w-8 text-primary" />
            System Alerts
          </h1>
          <p className="mt-2 text-base-content/60">
            Monitor critical hardware deviations and system notifications.
          </p>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 rounded-lg border border-base-300 bg-base-200 px-4 py-2 shadow-sm">
            <span className="text-sm font-medium">Unread</span>
            <div className="badge badge-primary">{unreadCount}</div>
          </div>
          <button
            className="btn btn-neutral btn-sm"
            onClick={() => handleAcknowledge('ALL')}
            disabled={
              loading ||
              filteredAlerts.every(
                (alert) => alert.source !== 'system' || alert.acknowledged,
              )
            }
          >
            <CheckSquare className="h-4 w-4" /> Ack All
          </button>
        </div>
      </div>

      <div className="card border border-base-200 bg-base-100 shadow-xl">
        <div className="card-body p-0">
          <div className="tabs tabs-bordered border-b border-base-200 p-4">
            <button
              className={`tab tab-lg ${filter === 'all' ? 'tab-active font-bold' : ''}`}
              onClick={() => setFilter('all')}
            >
              All Alerts
            </button>
            <button
              className={`tab tab-lg ${filter === 'critical_high' ? 'tab-active font-bold' : ''}`}
              onClick={() => setFilter('critical_high')}
            >
              Critical & High
            </button>
            <button
              className={`tab tab-lg ${filter === 'unread' ? 'tab-active font-bold' : ''}`}
              onClick={() => setFilter('unread')}
            >
              Unacknowledged
            </button>
            <button
              className={`tab tab-lg ${filter === 'tasks' ? 'tab-active font-bold' : ''}`}
              onClick={() => setFilter('tasks')}
            >
              Tasks
            </button>
          </div>

          <div className="bg-base-100/50 p-4">
            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((item) => (
                  <div key={item} className="skeleton h-24 w-full"></div>
                ))}
              </div>
            ) : filteredAlerts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center text-base-content/50">
                <CheckCircle2 className="mb-4 h-16 w-16 text-success/20" />
                <h3 className="mb-2 text-xl font-semibold">
                  You&apos;re all caught up!
                </h3>
                <p>No alerts found matching the current filter.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredAlerts.map((alert) => {
                  const severityMeta = getSeverityMeta(alert.severity);
                  const isDismissing = dismissingIds.includes(alert.id);

                  return (
                    <div
                      key={alert.id}
                      className={`rounded-xl border p-4 transition-all duration-200 ${
                        isDismissing
                          ? 'translate-x-2 scale-[0.99] opacity-0'
                          : alert.acknowledged
                            ? 'border-base-200 bg-base-200/30 opacity-70'
                            : 'border-base-300 bg-base-100 shadow-sm hover:bg-base-200/40 hover:shadow-md'
                      }`}
                    >
                      <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
                        <div className="mt-1 flex items-start gap-4">
                          <div className="mt-1 shrink-0">
                            {severityMeta.rowIcon}
                          </div>
                          <div>
                            <div className="mb-1 flex items-center gap-3">
                              <h3
                                className={`font-bold ${alert.acknowledged ? 'text-base-content/70' : ''}`}
                              >
                                {alert.title}
                              </h3>
                              <div
                                className={`badge badge-sm gap-1 border uppercase tracking-wider text-[10px] ${severityMeta.badgeClassName}`}
                              >
                                {severityMeta.icon}
                                {alert.severity}
                              </div>
                            </div>
                            <p className="w-full text-sm text-base-content/70 md:max-w-xl">
                              {alert.description}
                            </p>
                            <div className="mt-2 font-mono text-xs text-base-content/40">
                              {formatDistanceToNow(new Date(alert.timestamp), {
                                addSuffix: true,
                              })}
                            </div>
                          </div>
                        </div>
                        <div className="flex w-full shrink-0 justify-end md:w-auto">
                          {alert.source === 'task' ? (
                            <Link
                              href="/dashboard#maintenance-task-panel"
                              className="btn btn-warning btn-sm w-full md:w-auto"
                            >
                              View Task
                            </Link>
                          ) : !alert.acknowledged ? (
                            <button
                              className="btn btn-outline btn-primary btn-sm w-full md:w-auto"
                              onClick={() => handleAcknowledge(alert.id)}
                            >
                              <CheckCircle2 className="h-4 w-4" /> Acknowledge
                            </button>
                          ) : (
                            <div className="badge badge-success badge-sm gap-1 px-3 py-3 text-white">
                              <CheckCircle2 className="h-4 w-4" /> Acknowledged
                            </div>
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
      </div>
      <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
    </div>
  );
}
