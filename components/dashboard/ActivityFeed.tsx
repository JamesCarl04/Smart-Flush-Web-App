'use client';

import { useActivityFeed, ActivityEvent } from '@/hooks/useActivityFeed';
import { formatDistanceToNow } from 'date-fns';
import { Droplets, Power, Sun } from 'lucide-react';

export function ActivityFeed() {
  const { events, loading } = useActivityFeed();

  const getEventIcon = (type: ActivityEvent['type']) => {
    switch (type) {
      case 'flushEvent':
        return <Droplets className="w-4 h-4 text-info" />;
      case 'uvCycle':
        return <Sun className="w-4 h-4 text-accent" />;
      case 'lidEvent':
        return <Power className="w-4 h-4 text-secondary" />;
      default:
        return <div className="w-2 h-2 rounded-full bg-neutral"></div>;
    }
  };

  const getEventBadgeColor = (type: ActivityEvent['type']) => {
    switch (type) {
      case 'flushEvent':
        return 'badge-info badge-outline';
      case 'uvCycle':
        return 'badge-accent badge-outline';
      case 'lidEvent':
        return 'badge-secondary badge-outline';
      default:
        return 'badge-neutral outline';
    }
  };

  return (
    <div className="card bg-base-100 shadow-xl mb-8">
      <div className="card-body">
        <div className="flex items-center justify-between border-b border-base-200 pb-4 mb-4">
          <h2 className="card-title flex items-center gap-2">
            Activity Feed
            <span className="relative ml-2 flex h-3 w-3 items-center justify-center">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
              <span className="relative inline-flex h-2 w-2 animate-pulse rounded-full bg-success"></span>
            </span>
            <span className="text-xs font-normal text-success uppercase tracking-wider ml-1">
              Live
            </span>
          </h2>
        </div>

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex gap-4 items-center">
                <div className="skeleton w-10 h-10 rounded-full shrink-0"></div>
                <div className="flex flex-col gap-2 w-full">
                  <div className="skeleton h-4 w-1/3"></div>
                  <div className="skeleton h-3 w-2/3"></div>
                </div>
              </div>
            ))}
          </div>
        ) : events.length === 0 ? (
          <div className="text-center py-8 text-base-content/50">
            <p>No recent events recorded in the system.</p>
          </div>
        ) : (
          <div className="relative">
            <div className="absolute left-5 top-2 bottom-2 w-px bg-base-200 -z-10"></div>
            <ul className="space-y-6 animate-fade-in-down">
              {events.map((event) => (
                <li
                  key={event.id}
                  className="flex items-start gap-4 hover:bg-base-200/50 p-2 rounded-lg transition-colors overflow-hidden"
                >
                  <div className="bg-base-100 rounded-full p-2 border border-base-200 shadow-sm shrink-0 mt-0.5 z-10 block">
                    {getEventIcon(event.type)}
                  </div>
                  <div className="flex flex-col min-w-0 flex-1">
                    <div className="flex justify-between items-center sm:items-start flex-col sm:flex-row gap-1 sm:gap-4 mb-1">
                      <span className="font-semibold text-sm truncate">
                        {event.details}
                      </span>
                      <span className="text-xs text-base-content/50 whitespace-nowrap bg-base-200 px-2 py-0.5 rounded-full border border-base-300">
                        {formatDistanceToNow(new Date(event.timestamp), {
                          addSuffix: true,
                        })}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span
                        className={`badge badge-sm ${getEventBadgeColor(event.type)} text-[10px] uppercase font-bold tracking-wider`}
                      >
                        {event.type.replace(/Cycle|Event/g, '')}
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
