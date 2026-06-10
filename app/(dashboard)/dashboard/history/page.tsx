'use client';

import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import {
  Filter,
  Image as ImageIcon,
  Search,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useTasks } from '@/hooks/useTasks';
import { useMaintenancePersonnel } from '@/hooks/useMaintenancePersonnel';
import { useAuth } from '@/hooks/useAuth';
import type { Task } from '@/types';
import { TaskDetailDrawer } from '@/components/dashboard/TaskDetailDrawer';
import { formatDurationMs } from '@/lib/format-utils';



export default function TaskHistoryPage() {
  const { user } = useAuth();
  const { tasks, loading: tasksLoading } = useTasks();
  const { personnel, personnelById, loading: personnelLoading } = useMaintenancePersonnel();

  // Drawer States
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Filters
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    return format(d, 'yyyy-MM-dd');
  });
  const [dateTo, setDateTo] = useState(() => {
    const d = new Date();
    return format(d, 'yyyy-MM-dd');
  });
  const [buildingFilter, setBuildingFilter] = useState('All');
  const [floorFilter, setFloorFilter] = useState('All');
  const [personnelFilter, setPersonnelFilter] = useState('All');
  const [componentFilter, setComponentFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Derive unique filter options from data
  const { buildingOptions, floorOptions, componentOptions } = useMemo(() => {
    const buildings = new Set<string>();
    const floors = new Set<string>();
    const components = new Set<string>();

    // We'll extract mock building/floor data from deviceId for demo purposes
    // since the data schema doesn't have these explicitly yet
    tasks.forEach(task => {
      if (task.deviceId.includes('GB3')) buildings.add('GB3');
      if (task.deviceId.includes('Main')) buildings.add('Main Bldg');
      
      if (task.deviceId.includes('G/F') || task.deviceId.includes('GF')) floors.add('Ground Floor');
      if (task.deviceId.includes('2F')) floors.add('2nd Floor');
      if (task.deviceId.includes('3F')) floors.add('3rd Floor');

      components.add(
        task.triggerType === 'uv_complete' ? 'UV LED' :
        task.triggerType === 'flush_count' ? 'Valve' :
        task.triggerType === 'maintenance' ? 'General' :
        'Ultrasonic'
      );
    });

    return {
      buildingOptions: Array.from(buildings),
      floorOptions: Array.from(floors),
      componentOptions: Array.from(components),
    };
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      // Only show completed tasks in history
      if (task.status !== 'completed') return false;

      // Date range filter
      const taskDate = new Date(task.createdAt);
      taskDate.setHours(0, 0, 0, 0);
      const fromD = new Date(dateFrom);
      fromD.setHours(0, 0, 0, 0);
      const toD = new Date(dateTo);
      toD.setHours(23, 59, 59, 999);
      
      if (task.createdAt < fromD.getTime() || task.createdAt > toD.getTime()) {
        return false;
      }

      // Personnel filter
      if (personnelFilter !== 'All') {
        const assignedTo = task.assignedTo || (task.assignedToIds && task.assignedToIds[0]);
        if (assignedTo !== personnelFilter) return false;
      }

      // Component filter
      if (componentFilter !== 'All') {
        const comp = 
          task.triggerType === 'uv_complete' ? 'UV LED' :
          task.triggerType === 'flush_count' ? 'Valve' :
          task.triggerType === 'maintenance' ? 'General' :
          'Ultrasonic';
        if (comp !== componentFilter) return false;
      }

      // Building filter (mock logic based on deviceId)
      if (buildingFilter !== 'All') {
        if (buildingFilter === 'GB3' && !task.deviceId.includes('GB3')) return false;
        if (buildingFilter === 'Main Bldg' && !task.deviceId.includes('Main')) return false;
      }

      // Floor filter (mock logic based on deviceId)
      if (floorFilter !== 'All') {
        if (floorFilter === 'Ground Floor' && !task.deviceId.includes('G/F') && !task.deviceId.includes('GF')) return false;
        if (floorFilter === '2nd Floor' && !task.deviceId.includes('2F')) return false;
        if (floorFilter === '3rd Floor' && !task.deviceId.includes('3F')) return false;
      }

      // Search query (Task ID, Device, Message)
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (
          !task.id.toLowerCase().includes(q) &&
          !task.deviceId.toLowerCase().includes(q) &&
          !task.message.toLowerCase().includes(q)
        ) {
          return false;
        }
      }

      return true;
    });
  }, [tasks, dateFrom, dateTo, personnelFilter, componentFilter, buildingFilter, floorFilter, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredTasks.length / itemsPerPage));
  const paginatedTasks = filteredTasks.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [dateFrom, dateTo, personnelFilter, componentFilter, buildingFilter, floorFilter, searchQuery]);

  const resolveAssignedName = (task: Task) => {
    const assignedId = task.assignedTo || (task.assignedToIds && task.assignedToIds[0]);
    if (!assignedId) return '—';
    if (personnelLoading) return '...';
    
    // Attempt to parse first name from display name
    const fullName = personnelById[assignedId]?.displayName || assignedId;
    return fullName.split(' ')[0];
  };

  const getResponseTime = (task: Task) => {
    const ackTime = task.acknowledgedAt;
    if (!ackTime) return null;
    return ackTime - task.createdAt;
  };

  const getDuration = (task: Task) => {
    const compTime = task.completedAt;
    const startTime = task.acknowledgedAt || task.createdAt;
    if (!compTime) return null;
    return compTime - startTime;
  };

  const isLoading = tasksLoading || personnelLoading;

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl animate-fade-in">
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-secondary">
            Task History
          </h1>
          <p className="text-base-content/60 mt-1">
            Review completed tasks, performance metrics, and maintenance logs.
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="card bg-base-100 shadow-xl border border-base-200 mb-6">
        <div className="card-body p-4 md:p-6">
          <div className="flex flex-col md:flex-row items-end gap-4">
            
            <div className="flex-1 w-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Date Range */}
              <div className="form-control">
                <label className="label py-1">
                  <span className="label-text text-xs font-semibold uppercase text-base-content/60">From Date</span>
                </label>
                <input 
                  type="date" 
                  className="input input-sm input-bordered w-full" 
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </div>
              <div className="form-control">
                <label className="label py-1">
                  <span className="label-text text-xs font-semibold uppercase text-base-content/60">To Date</span>
                </label>
                <input 
                  type="date" 
                  className="input input-sm input-bordered w-full" 
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </div>

              {/* Maintenance Person Filter */}
              <div className="form-control">
                <label className="label py-1">
                  <span className="label-text text-xs font-semibold uppercase text-base-content/60">Personnel</span>
                </label>
                <select 
                  className="select select-sm select-bordered w-full"
                  value={personnelFilter}
                  onChange={(e) => setPersonnelFilter(e.target.value)}
                >
                  <option value="All">All Personnel</option>
                  {personnel.map(p => (
                    <option key={p.id} value={p.id}>{p.displayName}</option>
                  ))}
                </select>
              </div>

              {/* Component Filter */}
              <div className="form-control">
                <label className="label py-1">
                  <span className="label-text text-xs font-semibold uppercase text-base-content/60">Component</span>
                </label>
                <select 
                  className="select select-sm select-bordered w-full"
                  value={componentFilter}
                  onChange={(e) => setComponentFilter(e.target.value)}
                >
                  <option value="All">All Components</option>
                  <option value="Ultrasonic">Ultrasonic</option>
                  <option value="UV LED">UV LED</option>
                  <option value="Valve">Valve</option>
                  <option value="General">General</option>
                </select>
              </div>

              {/* Building Filter */}
              <div className="form-control">
                <label className="label py-1">
                  <span className="label-text text-xs font-semibold uppercase text-base-content/60">Building</span>
                </label>
                <select 
                  className="select select-sm select-bordered w-full"
                  value={buildingFilter}
                  onChange={(e) => setBuildingFilter(e.target.value)}
                >
                  <option value="All">All Buildings</option>
                  {buildingOptions.map(b => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>

              {/* Floor Filter */}
              <div className="form-control">
                <label className="label py-1">
                  <span className="label-text text-xs font-semibold uppercase text-base-content/60">Floor</span>
                </label>
                <select 
                  className="select select-sm select-bordered w-full"
                  value={floorFilter}
                  onChange={(e) => setFloorFilter(e.target.value)}
                >
                  <option value="All">All Floors</option>
                  {floorOptions.map(f => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </div>
              
              {/* Search */}
              <div className="form-control sm:col-span-2 lg:col-span-2">
                <label className="label py-1">
                  <span className="label-text text-xs font-semibold uppercase text-base-content/60">Search</span>
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-base-content/40" />
                  <input 
                    type="text" 
                    placeholder="Search task ID, location..." 
                    className="input input-sm input-bordered w-full pl-9"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>
            </div>
            
            <div className="shrink-0">
              <button 
                className="btn btn-sm btn-ghost gap-2"
                onClick={() => {
                  setDateFrom(format(new Date(), 'yyyy-MM-dd'));
                  setDateTo(format(new Date(), 'yyyy-MM-dd'));
                  setBuildingFilter('All');
                  setFloorFilter('All');
                  setPersonnelFilter('All');
                  setComponentFilter('All');
                  setSearchQuery('');
                }}
              >
                <Filter className="h-4 w-4" /> Clear
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* History Table */}
      <div className="card bg-base-100 shadow-xl border border-base-200">
        <div className="card-body p-0">
          <div className="overflow-x-auto">
            <table className="table table-zebra w-full">
              <thead>
                <tr className="bg-base-200/50 text-base-content/70">
                  <th className="font-semibold rounded-tl-xl">ID</th>
                  <th className="font-semibold">Component</th>
                  <th className="font-semibold">Location</th>
                  <th className="font-semibold">Completed By</th>
                  <th className="font-semibold">Response</th>
                  <th className="font-semibold">Duration</th>
                  <th className="font-semibold rounded-tr-xl">Photos</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={`skel-${i}`}>
                      <td colSpan={7} className="py-4">
                        <div className="skeleton h-8 w-full rounded-md" />
                      </td>
                    </tr>
                  ))
                ) : paginatedTasks.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12">
                      <div className="flex flex-col items-center justify-center">
                        <div className="bg-base-200 p-4 rounded-full mb-3">
                          <Search className="h-6 w-6 text-base-content/40" />
                        </div>
                        <p className="text-base-content/60">No completed tasks match your filters.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedTasks.map((task) => {
                    const comp = 
                      task.triggerType === 'uv_complete' ? 'UV LED' :
                      task.triggerType === 'flush_count' ? 'Valve' :
                      task.triggerType === 'maintenance' ? 'General' :
                      'Ultrasonic';
                      
                    return (
                      <tr 
                        key={task.id} 
                        className="hover:bg-base-200/30 transition-colors cursor-pointer"
                        onClick={() => {
                          setSelectedTask(task);
                          setIsDrawerOpen(true);
                        }}
                      >
                        <td className="font-mono text-sm text-base-content/70">
                          {task.id.slice(-6).toUpperCase()}
                        </td>
                        <td>
                          <span className="font-medium">{comp}</span>
                        </td>
                        <td>
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm">{task.deviceId}</span>
                          </div>
                        </td>
                        <td>
                          <div className="flex items-center gap-2">
                            <div className="avatar placeholder">
                              <div className="bg-neutral text-neutral-content rounded-full w-6">
                                <span className="text-[10px]">
                                  {resolveAssignedName(task)[0]?.toUpperCase() || '?'}
                                </span>
                              </div>
                            </div>
                            <span className="text-sm font-medium">{resolveAssignedName(task)}</span>
                          </div>
                        </td>
                        <td className="font-mono text-sm text-base-content/70">
                          {formatDurationMs(getResponseTime(task))}
                        </td>
                        <td className="font-mono text-sm text-base-content/70">
                          {formatDurationMs(getDuration(task))}
                        </td>
                        <td>
                          <button 
                            className="btn btn-xs btn-ghost gap-1.5"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedTask(task);
                              setIsDrawerOpen(true);
                            }}
                          >
                            <ImageIcon className="h-3.5 w-3.5" />
                            View
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {!isLoading && filteredTasks.length > 0 && (
            <div className="flex items-center justify-between border-t border-base-200 p-4 bg-base-100 rounded-b-xl">
              <span className="text-sm text-base-content/60">
                Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, filteredTasks.length)} of {filteredTasks.length} tasks
              </span>
              <div className="join">
                <button 
                  className="join-item btn btn-sm btn-outline"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(p => p - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <div className="join-item btn btn-sm btn-outline pointer-events-none px-4">
                  Page {currentPage} of {totalPages}
                </div>
                <button 
                  className="join-item btn btn-sm btn-outline"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(p => p + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      <TaskDetailDrawer 
        task={selectedTask}
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        personnelById={personnelById}
      />
    </div>
  );
}
