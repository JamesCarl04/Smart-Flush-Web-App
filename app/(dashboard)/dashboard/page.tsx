'use client';

import Link from 'next/link';
import { AlertOctagon } from 'lucide-react';
import { useAlerts } from '@/hooks/useAlerts';
import { StatCards } from '@/components/dashboard/StatCards';
import { ActivityFeed } from '@/components/dashboard/ActivityFeed';
import { ControlPanel } from '@/components/dashboard/ControlPanel';
import { MaintenanceTaskPanel } from '@/components/dashboard/MaintenanceTaskPanel';

export default function DashboardPage() {
  const { alerts } = useAlerts();
  const criticalAlerts = alerts.filter(
    (a) => !a.acknowledged && (a.severity === 'critical' || a.severity === 'high'),
  );

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl animate-fade-in space-y-8">
      {/* Crisp Slate Header */}
      <div className="pb-2 border-b border-slate-200 dark:border-slate-800">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          System Overview
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Real-time telemetry, automated disinfection status, and maintenance controls.
        </p>
      </div>

      {/* Priority Alert Callout */}
      {criticalAlerts.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-rose-500/10 border border-rose-500/30 rounded-2xl animate-fade-in text-rose-700 dark:text-rose-300 mb-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-500/20 text-rose-600 dark:text-rose-400">
              <AlertOctagon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-rose-900 dark:text-rose-100">
                {criticalAlerts.length} Unresolved Critical / High {criticalAlerts.length === 1 ? 'Alert' : 'Alerts'}
              </p>
              <p className="text-xs text-rose-700/80 dark:text-rose-300/80">
                {criticalAlerts[0]?.title}: {criticalAlerts[0]?.description}
              </p>
            </div>
          </div>
          <Link
            href="/alerts"
            className="action-btn-primary min-h-[40px] bg-rose-600 hover:bg-rose-700 text-white text-xs px-4 py-2"
          >
            Triage Alert
          </Link>
        </div>
      )}

      {/* ROW 1: Telemetry Stat Cards */}
      <StatCards />

      {/* ROW 2 & 3: Activity Feed and Control Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* Left col on desktop */}
        <div className="lg:col-span-1">
          <ActivityFeed />
        </div>

        {/* Right col on desktop */}
        <div className="lg:col-span-2">
          <ControlPanel />
        </div>
      </div>

      {/* ROW 4: Maintenance Tasks */}
      <div>
        <MaintenanceTaskPanel />
      </div>
    </div>
  );
}
