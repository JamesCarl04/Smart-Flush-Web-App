'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertOctagon, ArrowRight, Wrench } from 'lucide-react';
import { format, subDays } from 'date-fns';
import { useAuth } from '@/hooks/useAuth';
import { useAlerts } from '@/hooks/useAlerts';
import { apiFetch } from '@/lib/api-client';
import type { PredictiveMaintenanceSummary } from '@/types';
import { StatCards } from '@/components/dashboard/StatCards';
import { ActivityFeed } from '@/components/dashboard/ActivityFeed';
import { ControlPanel } from '@/components/dashboard/ControlPanel';

interface SystemPerfOverviewResponse {
  success: boolean;
  data?: {
    predictiveMaintenance?: PredictiveMaintenanceSummary;
  };
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { alerts } = useAlerts();
  const [predictive, setPredictive] =
    useState<PredictiveMaintenanceSummary | null>(null);

  useEffect(() => {
    if (!user) return;
    let active = true;
    const now = new Date();
    const fromStr = format(subDays(now, 7), 'yyyy-MM-dd');
    const toStr = format(now, 'yyyy-MM-dd');

    apiFetch<SystemPerfOverviewResponse>(
      `/api/analytics/system-performance?from=${fromStr}&to=${toStr}`,
      user,
      { cache: 'no-store' },
    )
      .then((res) => {
        if (active && res.success && res.data?.predictiveMaintenance) {
          setPredictive(res.data.predictiveMaintenance);
        }
      })
      .catch(() => {
        // Non-blocking overview card; full diagnostics remain on /analytics
      });

    return () => {
      active = false;
    };
  }, [user]);

  const criticalAlerts = alerts.filter(
    (a) => !a.acknowledged && (a.severity === 'critical' || a.severity === 'high'),
  );
  const topRiskRoom = predictive?.campusRisk[0] ?? null;

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl animate-fade-in space-y-8">
      {/* Crisp Slate Header */}
      <div className="pb-2 border-b border-slate-200 dark:border-slate-800">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          System Overview
        </h1>
        <span className="sr-only">
          Live restroom status, automatic cleaning progress, and quick maintenance controls.
        </span>
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
            Review Alert
          </Link>
        </div>
      )}

      {/* Predictive Maintenance Health Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-sky-500/25 bg-gradient-to-r from-sky-500/10 via-cyan-500/5 to-transparent p-4 shadow-sm dark:border-sky-500/30 dark:from-sky-500/15 dark:via-slate-900/60">
        <div className="flex items-start sm:items-center gap-3.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-600 text-white shadow-sm shadow-sky-600/30">
            <Wrench className="h-5 w-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Predictive Maintenance Health Index:{' '}
                <span className="font-mono text-sky-700 dark:text-sky-300">
                  {predictive ? `${predictive.overallHealthIndex}%` : 'Syncing...'}
                </span>
              </p>
              <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-sky-700 dark:text-sky-300">
                RUL & MTBI
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
              {predictive?.shortestRulComponent
                ? `Shortest RUL: ${predictive.shortestRulComponent.label} (~${predictive.shortestRulComponent.estimatedDaysRemaining}d left · Service by ${predictive.shortestRulComponent.predictedServiceDate})`
                : 'Monitoring cumulative hardware wear counters, pump flow drift, and 22-room MTBI risk.'}
              {topRiskRoom
                ? ` · Priority Watch: ${topRiskRoom.roomName} (${topRiskRoom.riskScore}/100 risk)`
                : ''}
            </p>
          </div>
        </div>
        <Link
          href="/analytics"
          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-sky-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-sky-700"
        >
          Predictive Analytics
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* ROW 1: Restroom Status Cards */}
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
    </div>
  );
}
