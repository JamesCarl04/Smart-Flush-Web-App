import { StatCards } from '@/components/dashboard/StatCards';
import { ActivityFeed } from '@/components/dashboard/ActivityFeed';
import { ControlPanel } from '@/components/dashboard/ControlPanel';

export default function DashboardPage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl animate-fade-in">
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-secondary">
            System Overview
          </h1>
          <p className="text-base-content/60 mt-1">
            Real-time status and manual controls.
          </p>
        </div>
      </div>

      {/* ROW 1 */}
      <StatCards />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* ROW 2 (Left col on desktop) */}
        <div className="lg:col-span-1">
          <ActivityFeed />
        </div>

        {/* ROW 3 (Right col on desktop) */}
        <div className="lg:col-span-2">
          <ControlPanel />
        </div>
      </div>

    </div>
  );
}
