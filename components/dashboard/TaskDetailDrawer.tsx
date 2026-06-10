'use client';

import { useEffect } from 'react';
import { 
  X, 
  AlertTriangle, 
  ShieldCheck, 
  CloudLightning, 
  Calendar, 
  User, 
  Clock, 
  MapPin, 
  Layers, 
  Building2, 
  Settings, 
  FileText, 
  Check, 
  Minus 
} from 'lucide-react';
import type { Task } from '@/types';
import { BeforeAfterPhotoViewer } from './BeforeAfterPhotoViewer';
import { format } from 'date-fns';
import { formatDurationMs } from '@/lib/format-utils';

interface TaskDetailDrawerProps {
  task: Task | null;
  isOpen: boolean;
  onClose: () => void;
  personnelById: Record<string, { displayName?: string | null; email?: string | null }>;
}

const SDCA_CHECKLIST_ITEMS = [
  'Replenish soap, sanitizer, and paper towel consumables',
  'Empty, clean, and disinfect trash receptacles',
  'Disinfect high-touch areas (door handles, buttons, switches)',
  'Thoroughly scrub and sanitize toilets and urinal bowls',
  'Wipe down and disinfect countertops, faucets, and sink basins',
  'Clean and polish mirrors and other glass surfaces',
  'Sweep, mop, and sanitize floors; verify safety/wet signs are out',
  'Check exhaust ventilation flow and air quality/odor control',
  'Clear and sanitize floor/sink drain grills and traps',
  'Perform final safety & cleanliness check; sign inspection record',
];



export function TaskDetailDrawer({
  task,
  isOpen,
  onClose,
  personnelById,
}: TaskDetailDrawerProps) {
  // Lock body scroll when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!task) return null;

  const resolveName = (uid?: string | null) => {
    if (!uid) return '—';
    return personnelById[uid]?.displayName || uid.split('@')[0] || uid;
  };

  const getAssignedName = () => {
    if (task.assignedToIds && task.assignedToIds.length > 0) {
      return task.assignedToIds.map(uid => resolveName(uid)).join(', ');
    }
    return resolveName(task.assignedTo);
  };

  const getCompletedByName = () => {
    const completedByUserIds = task.completedBy ? Object.keys(task.completedBy) : [];
    if (completedByUserIds.length > 0) {
      return completedByUserIds.map(uid => resolveName(uid)).join(', ');
    }
    return resolveName(task.assignedTo); // Fallback
  };

  // Metrics
  const responseTimeMs = task.acknowledgedAt && task.createdAt ? task.acknowledgedAt - task.createdAt : null;
  const startWorkTime = task.acknowledgedAt || task.createdAt;
  const workDurationMs = task.completedAt && startWorkTime ? task.completedAt - startWorkTime : null;
  const totalTimeMs = task.completedAt && task.createdAt ? task.completedAt - task.createdAt : null;

  // Format full date
  const formatDateTime = (ts?: number | null) => {
    if (!ts) return '—';
    return format(new Date(ts), 'dd MMM yyyy HH:mm:ss');
  };

  // Safe checklist checker
  const isChecklistItemDone = (index: number) => {
    if (!task.checklist) return false;
    const itemId = (index + 1).toString().padStart(2, '0'); // '01', '02' etc
    if (Array.isArray(task.checklist)) {
      return task.checklist.includes(itemId);
    }
    return !!task.checklist[itemId];
  };

  return (
    <>
      {/* Backdrop overlay */}
      <div 
        className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div 
        className={`fixed right-0 top-0 bottom-0 z-50 w-full max-w-xl bg-base-100 shadow-2xl border-l border-base-200 flex flex-col transition-transform duration-300 transform ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Banner at top if Flagged */}
        {task.flagged && (
          <div className="bg-warning/15 border-b border-warning/20 px-6 py-3 flex items-center gap-2 text-warning-content shrink-0 animate-pulse">
            <AlertTriangle className="h-5 w-5 text-warning shrink-0" />
            <div className="text-xs sm:text-sm font-semibold">
              Re-inspection Flagged by Supervisor
            </div>
          </div>
        )}

        {/* Drawer Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-base-200 bg-base-50 shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-base-content font-mono uppercase">
                Task #{task.id.slice(-6).toUpperCase()}
              </h2>
              <span className={`badge badge-sm font-semibold py-2 px-2.5 ${
                task.status === 'completed' ? 'badge-success text-white' : 
                task.status === 'acknowledged' ? 'badge-info text-white' : 'badge-warning text-white'
              }`}>
                {task.status.toUpperCase()}
              </span>
            </div>
            <p className="text-xs text-base-content/50 mt-0.5">
              Ref: {task.id}
            </p>
          </div>
          <button 
            onClick={onClose}
            className="btn btn-circle btn-sm btn-ghost text-base-content/60 hover:text-base-content"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* Biometric & Synced Badges */}
          {(task.biometricVerified || task.offlineSynced) && (
            <div className="flex flex-wrap gap-2">
              {task.biometricVerified && (
                <span className="badge badge-success gap-1.5 py-3 px-3.5 text-xs text-white font-semibold shadow-sm">
                  <ShieldCheck className="h-3.5 w-3.5 stroke-[2.5]" /> Biometric Verified
                </span>
              )}
              {task.offlineSynced && (
                <span className="badge badge-info gap-1.5 py-3 px-3.5 text-xs text-white font-semibold shadow-sm">
                  <CloudLightning className="h-3.5 w-3.5 stroke-[2.5]" /> Offline Synced
                </span>
              )}
            </div>
          )}

          {/* Details Metadata Card */}
          <div className="bg-base-200/30 border border-base-200/60 rounded-2xl p-4 sm:p-5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-base-content/40 mb-3.5">
              Task Properties
            </h3>
            <div className="grid grid-cols-2 gap-y-4 gap-x-6 text-sm">
              <div className="flex flex-col">
                <span className="text-xs text-base-content/50 flex items-center gap-1"><Settings className="h-3 w-3" /> Component</span>
                <span className="font-semibold text-base-content mt-0.5">{task.component || 'General'}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-base-content/50 flex items-center gap-1"><Layers className="h-3 w-3" /> Device ID</span>
                <span className="font-semibold text-base-content mt-0.5">{task.deviceId}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-base-content/50 flex items-center gap-1"><Building2 className="h-3 w-3" /> Building</span>
                <span className="font-semibold text-base-content mt-0.5">{task.building || '—'}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-base-content/50 flex items-center gap-1"><Layers className="h-3 w-3" /> Floor</span>
                <span className="font-semibold text-base-content mt-0.5">{task.floor || '—'}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-base-content/50 flex items-center gap-1"><MapPin className="h-3 w-3" /> Location</span>
                <span className="font-semibold text-base-content mt-0.5">{task.location || '—'}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-base-content/50 flex items-center gap-1"><Calendar className="h-3 w-3" /> Shift</span>
                <span className="font-semibold text-base-content mt-0.5">{task.shift || '—'}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-base-content/50 flex items-center gap-1"><User className="h-3 w-3" /> Assigned To</span>
                <span className="font-semibold text-base-content mt-0.5 truncate" title={getAssignedName()}>{getAssignedName()}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-base-content/50 flex items-center gap-1"><User className="h-3 w-3" /> Completed By</span>
                <span className="font-semibold text-base-content mt-0.5 truncate" title={getCompletedByName()}>{getCompletedByName()}</span>
              </div>
            </div>
            
            {/* Description/Message inside Card */}
            <div className="border-t border-base-200/60 mt-4 pt-4">
              <span className="text-xs text-base-content/50">Instruction:</span>
              <p className="text-sm text-base-content mt-1 italic">
                "{task.message}"
              </p>
            </div>
          </div>

          {/* Timeline Section */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-base-content/40">
              Task Timeline
            </h3>
            
            <div className="relative pl-6 space-y-4">
              {/* Vertical line connecting nodes */}
              <div className="absolute left-2.5 top-2.5 bottom-2.5 w-0.5 bg-base-200" />

              {/* Node 1: Created */}
              <div className="relative flex items-start gap-4">
                <div className="absolute -left-6 mt-1 flex h-5 w-5 items-center justify-center rounded-full bg-success text-white">
                  <Check className="h-3 w-3 stroke-[3]" />
                </div>
                <div className="text-xs">
                  <div className="font-bold text-base-content">Created</div>
                  <div className="font-mono text-base-content/60 mt-0.5">{formatDateTime(task.createdAt)}</div>
                </div>
              </div>

              {/* Node 2: Assigned */}
              <div className="relative flex items-start gap-4">
                <div className="absolute -left-6 mt-1 flex h-5 w-5 items-center justify-center rounded-full bg-success text-white">
                  <Check className="h-3 w-3 stroke-[3]" />
                </div>
                <div className="text-xs">
                  <div className="font-bold text-base-content">Assigned to Personnel</div>
                  <div className="font-mono text-base-content/60 mt-0.5">
                    {formatDateTime(task.assignedAt || task.createdAt)}
                  </div>
                </div>
              </div>

              {/* Node 3: Acknowledged */}
              <div className="relative flex items-start gap-4">
                {task.acknowledgedAt ? (
                  <>
                    <div className="absolute -left-6 mt-1 flex h-5 w-5 items-center justify-center rounded-full bg-success text-white">
                      <Check className="h-3 w-3 stroke-[3]" />
                    </div>
                    <div className="text-xs">
                      <div className="font-bold text-base-content">Acknowledged by Personnel</div>
                      <div className="font-mono text-base-content/60 mt-0.5">{formatDateTime(task.acknowledgedAt)}</div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="absolute -left-6 mt-1 flex h-5 w-5 items-center justify-center rounded-full bg-base-300 text-base-content/30">
                      <Minus className="h-3 w-3" />
                    </div>
                    <div className="text-xs text-base-content/40">
                      <div className="font-bold">Pending Acknowledgement</div>
                      <div className="mt-0.5">—</div>
                    </div>
                  </>
                )}
              </div>

              {/* Node 4: Completed */}
              <div className="relative flex items-start gap-4">
                {task.completedAt ? (
                  <>
                    <div className="absolute -left-6 mt-1 flex h-5 w-5 items-center justify-center rounded-full bg-success text-white">
                      <Check className="h-3 w-3 stroke-[3]" />
                    </div>
                    <div className="text-xs">
                      <div className="font-bold text-base-content">Completed & Verified</div>
                      <div className="font-mono text-base-content/60 mt-0.5">{formatDateTime(task.completedAt)}</div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="absolute -left-6 mt-1 flex h-5 w-5 items-center justify-center rounded-full bg-base-300 text-base-content/30">
                      <Minus className="h-3 w-3" />
                    </div>
                    <div className="text-xs text-base-content/40">
                      <div className="font-bold">Pending Completion</div>
                      <div className="mt-0.5">—</div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Performance Duration Metrics */}
          {task.completedAt && (
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-base-200/25 border border-base-200/50 rounded-xl p-3 flex flex-col items-center text-center">
                <span className="text-[10px] uppercase font-bold text-base-content/50 flex items-center gap-1"><Clock className="h-3 w-3" /> Response Time</span>
                <span className="text-xs font-semibold text-base-content mt-1">
                  {formatDurationMs(responseTimeMs)}
                </span>
              </div>
              <div className="bg-base-200/25 border border-base-200/50 rounded-xl p-3 flex flex-col items-center text-center">
                <span className="text-[10px] uppercase font-bold text-base-content/50 flex items-center gap-1"><Clock className="h-3 w-3" /> Work Duration</span>
                <span className="text-xs font-semibold text-base-content mt-1">
                  {formatDurationMs(workDurationMs)}
                </span>
              </div>
              <div className="bg-base-200/25 border border-base-200/50 rounded-xl p-3 flex flex-col items-center text-center">
                <span className="text-[10px] uppercase font-bold text-base-content/50 flex items-center gap-1"><Clock className="h-3 w-3" /> Total Time</span>
                <span className="text-xs font-semibold text-base-content mt-1">
                  {formatDurationMs(totalTimeMs)}
                </span>
              </div>
            </div>
          )}

          {/* Before & After Photo Viewer */}
          <div className="border-t border-base-200 pt-6">
            <BeforeAfterPhotoViewer 
              photos={task.photos} 
              beforeTimestamp={task.createdAt} 
              afterTimestamp={task.completedAt} 
            />
          </div>

          {/* SDCA Checklist Section */}
          <div className="border-t border-base-200 pt-6 space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-base-content/60">
              SDCA Cleaning Checklist
            </h3>
            <div className="rounded-xl border border-base-300 divide-y divide-base-200 overflow-hidden bg-base-50/50">
              {SDCA_CHECKLIST_ITEMS.map((item, idx) => {
                const done = isChecklistItemDone(idx);
                return (
                  <div key={idx} className="flex items-center gap-3 p-3 text-xs sm:text-sm">
                    <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                      done ? 'bg-success text-white' : 'bg-base-300 text-base-content/40 font-mono text-[9px] font-bold'
                    }`}>
                      {done ? <Check className="h-3.5 w-3.5 stroke-[2.5]" /> : 'N/A'}
                    </div>
                    <span className={`leading-tight ${done ? 'text-base-content font-medium' : 'text-base-content/45'}`}>
                      {item}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Remarks Section */}
          <div className="border-t border-base-200 pt-6 space-y-2">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-base-content/60 flex items-center gap-1.5">
              <FileText className="h-4 w-4 stroke-[2]" /> Remarks / Notes
            </h3>
            <div className="bg-base-200/35 border border-base-200 rounded-xl p-4 text-sm text-base-content/85 min-h-16">
              {task.remarks ? task.remarks : (
                <span className="text-base-content/40 italic">No supervisor or personnel remarks submitted for this task.</span>
              )}
            </div>
          </div>

        </div>
      </div>
    </>
  );
}
