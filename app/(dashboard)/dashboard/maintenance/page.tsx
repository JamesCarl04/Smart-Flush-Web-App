'use client';

import { MaintenanceSummaryCards } from '@/components/dashboard/MaintenanceSummaryCards';
import { TeamAvailabilityTable } from '@/components/dashboard/TeamAvailabilityTable';
import { ActiveTasksList } from '@/components/dashboard/ActiveTasksList';

export default function MaintenanceOverviewPage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl animate-fade-in">
      <div className="flex justify-between items-end mb-8">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-secondary">
              Maintenance Overview
            </h1>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-success/10 border border-success/20 text-success text-xs font-semibold shadow-sm animate-pulse">
              <div className="w-1.5 h-1.5 rounded-full bg-success"></div>
              Live
            </div>
          </div>
          <p className="text-base-content/60 mt-1">
            Monitor maintenance status and scheduling across all restrooms.
          </p>
        </div>
      </div>

      {/* Summary Cards Row */}
      <MaintenanceSummaryCards />

      {/* Team Availability Table */}
      <TeamAvailabilityTable />

      {/* Active Tasks List */}
      <ActiveTasksList />
    </div>
  );
}
