'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTasks } from '@/hooks/useTasks';
import { useMaintenancePersonnel } from '@/hooks/useMaintenancePersonnel';
import {
  ClipboardList,
  Activity,
  UserCheck,
  AlertTriangle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface StatCardConfig {
  title: string;
  value: number;
  color: string;
  bgColor: string;
  borderColor: string;
  icon: LucideIcon;
  pulse?: boolean;
}

export function MaintenanceSummaryCards() {
  const { tasks, loading: tasksLoading } = useTasks();
  const { personnel, loading: personnelLoading } = useMaintenancePersonnel();
  const [cardsVisible, setCardsVisible] = useState(false);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setCardsVisible(true);
    }, 30);
    return () => window.clearTimeout(timeoutId);
  }, []);

  const stats = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    ).getTime();
    const todayEnd = todayStart + 24 * 60 * 60 * 1000;

    const totalToday = tasks.filter(
      (t) => t.createdAt >= todayStart && t.createdAt < todayEnd,
    ).length;

    const activeTasks = tasks.filter((t) => t.status !== 'completed').length;

    // Count personnel as "available" — since the MaintenancePersonnel type
    // does not yet have an isAvailable field, we count all personnel.
    // When the field is added to the API, update this filter accordingly.
    const availableStaff = personnel.length;

    const unassignedTasks = tasks.filter(
      (t) =>
        t.status !== 'completed' &&
        (!t.assignedTo || t.assignedTo.trim() === '') &&
        (!t.assignedToIds || t.assignedToIds.length === 0),
    ).length;

    return { totalToday, activeTasks, availableStaff, unassignedTasks };
  }, [tasks, personnel]);

  const cards: StatCardConfig[] = [
    {
      title: 'Total Tasks Today',
      value: stats.totalToday,
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10',
      borderColor: 'border-blue-500/20',
      icon: ClipboardList,
    },
    {
      title: 'Active Tasks',
      value: stats.activeTasks,
      color: 'text-orange-500',
      bgColor: 'bg-orange-500/10',
      borderColor: 'border-orange-500/20',
      icon: Activity,
    },
    {
      title: 'Available Staff',
      value: stats.availableStaff,
      color: 'text-green-500',
      bgColor: 'bg-green-500/10',
      borderColor: 'border-green-500/20',
      icon: UserCheck,
    },
    {
      title: 'Unassigned Tasks',
      value: stats.unassignedTasks,
      color: 'text-red-500',
      bgColor: 'bg-red-500/10',
      borderColor: 'border-red-500/20',
      icon: AlertTriangle,
      pulse: stats.unassignedTasks > 0,
    },
  ];

  const loading = tasksLoading || personnelLoading;

  return (
    <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
      {cards.map((card, index) => (
        <AnimatedCard
          key={card.title}
          delayMs={index * 90}
          visible={cardsVisible}
        >
          <div
            className={`card bg-base-100 shadow-xl border transition-all duration-300 hover:shadow-2xl hover:-translate-y-0.5 ${
              card.pulse
                ? 'border-red-500/40 animate-[pulse-border_2s_ease-in-out_infinite]'
                : 'border-base-200'
            }`}
          >
            <div className="card-body p-6">
              <div className="mb-3 flex items-start justify-between">
                <h3 className="card-title text-sm font-medium text-base-content/70">
                  {card.title}
                </h3>
                <div
                  className={`rounded-xl p-2.5 ${card.bgColor} ${
                    card.pulse ? 'animate-pulse' : ''
                  }`}
                >
                  <card.icon className={`h-5 w-5 ${card.color}`} />
                </div>
              </div>
              {loading ? (
                <div className="mt-1 h-10 w-full rounded skeleton" />
              ) : (
                <div className="flex items-end gap-2">
                  <div className={`text-4xl font-bold tracking-tight ${card.color}`}>
                    {card.value}
                  </div>
                  {card.pulse && (
                    <span className="mb-1 inline-flex items-center gap-1 rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-xs font-semibold text-red-500">
                      <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-ping" />
                      Needs Attention
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </AnimatedCard>
      ))}
    </div>
  );
}

function AnimatedCard({
  children,
  delayMs,
  visible,
}: {
  children: React.ReactNode;
  delayMs: number;
  visible: boolean;
}) {
  return (
    <div
      className={`transform transition-all duration-500 ease-out ${
        visible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
      }`}
      style={{ transitionDelay: `${delayMs}ms` }}
    >
      {children}
    </div>
  );
}
