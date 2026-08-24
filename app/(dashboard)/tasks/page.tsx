'use client';

import { Suspense } from 'react';
import { MaintenanceTaskPanel } from '@/components/dashboard/MaintenanceTaskPanel';

export default function TasksPage() {
  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl animate-fade-in space-y-6">
      {/* Page Header */}
      <div className="pb-2 border-b border-slate-200 dark:border-slate-800">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          Maintenance Tasks
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Dispatch cleaning and repair tasks, track technician status, and monitor response times.
        </p>
      </div>

      {/* Main Full-Width Maintenance Task Operations Panel */}
      <Suspense
        fallback={
          <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-800/80 dark:bg-slate-900">
            <div className="space-y-4">
              <div className="h-6 w-48 animate-pulse rounded bg-slate-200 dark:bg-slate-700"></div>
              <div className="h-4 w-72 animate-pulse rounded bg-slate-100 dark:bg-slate-800"></div>
              <div className="h-32 w-full animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800"></div>
            </div>
          </div>
        }
      >
        <MaintenanceTaskPanel />
      </Suspense>
    </div>
  );
}

