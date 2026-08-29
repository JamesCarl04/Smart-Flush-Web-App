'use client';

import { useActivityFeed, ActivityEvent } from '@/hooks/useActivityFeed';
import { format, formatDistanceToNow } from 'date-fns';
import { Droplets, Sparkles, UserCheck, Activity, ShieldCheck } from 'lucide-react';

function getEventDetails(event: ActivityEvent) {
  switch (event.type) {
    case 'flushEvent':
      return {
        title: 'Flush Completed',
        badgeLabel: 'Flush',
        badgeStyle: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20',
        iconBg: 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30',
        icon: <Droplets className="w-4 h-4" />,
      };
    case 'uvCycle':
      return {
        title: 'UV Cleaning Completed',
        badgeLabel: 'Disinfection',
        badgeStyle: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20',
        iconBg: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30',
        icon: <Sparkles className="w-4 h-4" />,
      };
    case 'lidEvent':
      return {
        title: 'Restroom Activity Detected',
        badgeLabel: 'Sensor',
        badgeStyle: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
        iconBg: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30',
        icon: <Activity className="w-4 h-4" />,
      };
    default:
      return {
        title: 'System Activity',
        badgeLabel: 'Event',
        badgeStyle: 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20',
        iconBg: 'bg-slate-500/15 text-slate-600 dark:text-slate-400 border border-slate-500/30',
        icon: <ShieldCheck className="w-4 h-4" />,
      };
  }
}

function formatRelativeTime(date: Date): string {
  try {
    return formatDistanceToNow(date, { addSuffix: true });
  } catch {
    return 'Just now';
  }
}

function formatExactTime(date: Date): string {
  try {
    return format(date, 'HH:mm:ss');
  } catch {
    return '';
  }
}

export function ActivityFeed() {
  const { events, loading } = useActivityFeed();

  return (
    <div className="card bg-base-100 border border-base-200 shadow-xl mb-8">
      <div className="card-body p-6">
        <div className="flex items-center justify-between border-b border-base-200 pb-4 mb-4">
          <div className="flex items-center gap-2">
            <h2 className="card-title text-xl font-bold tracking-tight">
              Activity Feed
            </h2>
            <div className="flex items-center gap-1.5 ml-1">
              <span className="relative flex h-2.5 w-2.5 items-center justify-center">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
                <span className="relative inline-flex h-2 w-2 rounded-full bg-success"></span>
              </span>
              <span className="text-xs font-semibold text-success uppercase tracking-wider">
                Live
              </span>
            </div>
          </div>
          {!loading && events.length > 0 && (
            <span className="text-xs font-medium text-base-content/50 bg-base-200 px-2.5 py-1 rounded-full">
              {events.length} events
            </span>
          )}
        </div>

        {loading ? (
          <div className="space-y-4 py-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex gap-4 items-center">
                <div className="skeleton w-9 h-9 rounded-full shrink-0"></div>
                <div className="flex flex-col gap-2 w-full">
                  <div className="skeleton h-4 w-1/3"></div>
                  <div className="skeleton h-3 w-2/3"></div>
                </div>
              </div>
            ))}
          </div>
        ) : events.length === 0 ? (
          <div className="text-center py-10 px-4 text-base-content/50">
            <Activity className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="font-medium text-sm">No recent events recorded</p>
            <p className="text-xs text-base-content/40 mt-0.5">
              Recent flushes, cleaning cycles, and restroom activity will appear here.
            </p>
          </div>
        ) : (
          <div className="relative pl-2 sm:pl-3">
            {/* Timeline vertical bar */}
            <div className="absolute left-6 top-3 bottom-3 w-[2px] bg-base-200 dark:bg-base-300 -z-0"></div>

            <ul className="space-y-4 animate-fade-in">
              {events.map((event) => {
                const config = getEventDetails(event);
                const relTime = formatRelativeTime(new Date(event.timestamp));
                const exactTime = formatExactTime(new Date(event.timestamp));

                return (
                  <li
                    key={event.id}
                    className="group relative flex items-start gap-3.5 p-2 rounded-xl transition-colors hover:bg-base-200/50"
                  >
                    {/* Event Icon Node */}
                    <div
                      className={`relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl shadow-xs transition-transform group-hover:scale-105 ${config.iconBg}`}
                    >
                      {config.icon}
                    </div>

                    {/* Event Details */}
                    <div className="flex flex-col min-w-0 flex-1 pt-0.5">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm text-base-content group-hover:text-primary transition-colors">
                            {config.title}
                          </span>
                          <span
                            className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider border ${config.badgeStyle}`}
                          >
                            {config.badgeLabel}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 text-xs text-base-content/50">
                          <span className="font-medium whitespace-nowrap bg-base-200/70 dark:bg-base-300/60 px-2 py-0.5 rounded-md">
                            {relTime}
                          </span>
                        </div>
                      </div>

                      <div className="mt-1 flex items-center justify-between gap-2 text-xs text-base-content/70">
                        <span className="font-mono text-xs bg-base-200/50 px-2 py-0.5 rounded text-base-content/80 font-medium truncate">
                          {event.details}
                        </span>
                        {exactTime && (
                          <span className="text-[11px] text-base-content/40 font-mono shrink-0">
                            {exactTime}
                          </span>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
