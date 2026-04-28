'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { useAlerts, AlertSeverity } from '@/hooks/useAlerts';
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

export default function AlertsPage() {
  const { alerts, unreadCount, loading, acknowledgeAlert } = useAlerts();
  const [filter, setFilter] = useState<'all' | 'critical_high' | 'unread'>(
    'all',
  );
  const [dismissingIds, setDismissingIds] = useState<string[]>([]);

  const filteredAlerts = alerts.filter((alert) => {
    if (filter === 'unread') return !alert.acknowledged;
    if (filter === 'critical_high')
      return alert.severity === 'critical' || alert.severity === 'high';
    return true;
  });

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
            .filter((alert) => !alert.acknowledged)
            .map((alert) => alert.id)
        : [id];

    setDismissingIds((current) =>
      Array.from(new Set([...current, ...idsToDismiss])),
    );
    await new Promise((resolve) => window.setTimeout(resolve, 220));

    const success = await acknowledgeAlert(id);
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
            disabled={unreadCount === 0 || loading}
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
                          {!alert.acknowledged ? (
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
    </div>
  );
}
