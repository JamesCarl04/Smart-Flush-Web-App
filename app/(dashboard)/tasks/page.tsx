'use client';

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
      <MaintenanceTaskPanel />
    </div>
  );
}
