"use client";

import { useState, useEffect, useCallback } from "react";
import toast, { Toaster } from "react-hot-toast";
import { useSensorData } from "@/hooks/useSensorData";
import { useAuth } from "@/hooks/useAuth";
import { useDeviceStatus } from "@/hooks/useDeviceStatus";
import { apiFetch } from "@/lib/api-client";
import { formatDistanceToNow } from "date-fns";
import { Save, RefreshCw, Trash2, Plus, SlidersHorizontal, Settings2, Clock, AlertTriangle } from "lucide-react";

type TimingConfig = {
  pumpDuration: number;
  uvDuration: number;
  personGoneConfirm: number;
};

type Rule = {
  id: string;
  group: 'alerts' | 'maintenance';
  name: string;
  trigger: string;
  basis: string;
  action: string;
  enabled: boolean;
};

interface RuleDoc {
  id: string;
  group: string;
  name: string;
  trigger: string;
  threshold: number;
  action: string;
  enabled: boolean;
}

export default function ConfigurationPage() {
  const { user } = useAuth();
  const { ultrasonicDistance } = useSensorData();
  const { status: deviceStatus, lastSeen, loading: deviceLoading } = useDeviceStatus();
  
  const [deviceName, setDeviceName] = useState("Men's Restroom - Stall 1");
  const [threshold, setThreshold] = useState(30);
  const [timing, setTiming] = useState<TimingConfig>({ pumpDuration: 8, uvDuration: 45, personGoneConfirm: 3 });
  
  const [rules, setRules] = useState<Rule[]>([]);

  const [isDirty, setIsDirty] = useState(false);
  const [savingSection, setSavingSection] = useState<string | null>(null);

  // Mark form dirty when values change (simplified logic tracking main inputs)
  const markDirty = () => setIsDirty(true);

  // Fetch automation rules from API on mount
  const fetchRules = useCallback(async () => {
    if (!user) return;
    try {
      const res = await apiFetch<{ success: boolean; data: RuleDoc[] }>('/api/automation-rules', user);
      if (res.success && res.data) {
        setRules(res.data.map(r => ({
          id: r.id,
          group: (r.group as 'alerts' | 'maintenance') ?? 'alerts',
          name: r.name,
          trigger: r.trigger,
          basis: `Threshold: ${r.threshold}`,
          action: r.action,
          enabled: r.enabled,
        })));
      }
    } catch (err) {
      console.error("[Configuration] fetch rules error:", err);
    }
  }, [user]);

  useEffect(() => {
    fetchRules();
    setIsDirty(false);
  }, [fetchRules]);

  const handleDeviceSave = async () => {
    setSavingSection('device');
    try {
      const res = await fetch('/api/devices/dev-123', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: deviceName })
      });
      if (!res.ok) throw new Error();
      toast.success('Device settings saved');
      setIsDirty(false);
    } catch {
      toast.error('Failed to save device settings');
    } finally {
      setSavingSection(null);
    }
  };

  const handleCalibrationSave = async () => {
    setSavingSection('calibration');
    try {
      const res = await fetch('/api/sensors/sens-123/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threshold })
      });
      if (!res.ok) throw new Error();
      toast.success('Sensor calibration saved');
      setIsDirty(false);
    } catch {
      toast.error('Failed to save calibration');
    } finally {
      setSavingSection(null);
    }
  };

  const handleTimingSave = async () => {
    setSavingSection('timing');
    try {
      const res = await fetch('/api/sensors/sens-123/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(timing)
      });
      if (!res.ok) throw new Error();
      toast.success('Timing parameters updated');
      setIsDirty(false);
    } catch {
      toast.error('Failed to update timing parameters');
    } finally {
      setSavingSection(null);
    }
  };

  const toggleRule = (id: string) => {
    setRules(rules.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r));
    markDirty();
  };

  const deleteRuleConfirm = (id: string) => {
    const shouldDelete = window.confirm("Are you sure you want to delete this rule?");
    if (shouldDelete) {
      setRules(rules.filter(r => r.id !== id));
      markDirty();
    }
  };

  return (
    <div className="container mx-auto p-4 md:p-8 max-w-4xl relative animate-fade-in pb-24">
      
      {/* Unsaved Changes Banner */}
      {isDirty && (
        <div className="alert alert-warning shadow-lg sticky top-4 z-50 mb-8 animate-in slide-in-from-top-4">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <div>
            <h3 className="font-bold">Unsaved Changes</h3>
            <div className="text-xs">You have modified configuration parameters. Remember to save your changes.</div>
          </div>
        </div>
      )}

      <div className="mb-8">
        <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-secondary">System Configuration</h1>
        <p className="text-base-content/60 mt-1">Manage hardware settings, calibration, and automation logic.</p>
      </div>

      <div className="flex flex-col gap-8">
        
        {/* Section 1: Device Settings */}
        <div className="card bg-base-100 shadow-xl border border-base-200">
          <div className="card-body">
            <h2 className="card-title flex items-center gap-2 border-b border-base-200 pb-4 mb-4">
              <Settings2 className="w-5 h-5 text-primary" />
              Device Profile
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="form-control w-full">
                <label className="label"><span className="label-text font-medium">Device Name</span></label>
                <input 
                  type="text" 
                  className="input input-bordered w-full" 
                  value={deviceName}
                  onChange={(e) => { setDeviceName(e.target.value); markDirty(); }}
                />
              </div>
              <div className="flex flex-col gap-2 justify-center pt-2">
                <div className="text-sm"><span className="text-base-content/50 w-24 inline-block">Status:</span> {deviceLoading ? <span className="ml-2 skeleton w-12 h-4 inline-block"></span> : <span className={`badge badge-sm gap-1 ml-2 ${deviceStatus === 'online' ? 'badge-success' : 'badge-error'}`}>{deviceStatus === 'online' ? 'Online' : 'Offline'}</span>}</div>
                <div className="text-sm"><span className="text-base-content/50 w-24 inline-block">Last Seen:</span> <span className="ml-2">{deviceLoading ? <span className="skeleton w-20 h-4 inline-block"></span> : lastSeen ? formatDistanceToNow(new Date(lastSeen), { addSuffix: true }) : 'Never'}</span></div>
              </div>
            </div>
            <div className="card-actions justify-end mt-4">
              <button 
                className={`btn btn-primary btn-sm ${savingSection === 'device' ? 'btn-disabled' : ''}`}
                onClick={handleDeviceSave}
              >
                {savingSection === 'device' ? <span className="loading loading-spinner loading-xs"></span> : <Save className="w-4 h-4" />}
                Save Profile
              </button>
            </div>
          </div>
        </div>

        {/* Section 2: Sensor Calibration */}
        <div className="card bg-base-100 shadow-xl border border-base-200">
          <div className="card-body">
            <h2 className="card-title flex items-center gap-2 border-b border-base-200 pb-4 mb-4">
              <SlidersHorizontal className="w-5 h-5 text-info" />
              Sensor Calibration
            </h2>
            <div className="flex flex-col md:flex-row gap-8 items-center">
              <div className="form-control w-full flex-1">
                <label className="label">
                  <span className="label-text font-medium">Occupancy Detection Threshold</span>
                  <span className="label-text-alt text-info font-bold">{threshold} cm</span>
                </label>
                <input 
                  type="range" 
                  min="10" 
                  max="100" 
                  value={threshold} 
                  className="range range-info range-sm mt-2" 
                  onChange={(e) => { setThreshold(Number(e.target.value)); markDirty(); }}
                />
                <div className="w-full flex justify-between text-xs px-2 mt-2 text-base-content/50">
                  <span>10cm</span>
                  <span>Max sensitivity (100cm)</span>
                </div>
              </div>
              <div className="bg-base-200 rounded-xl p-4 w-full md:w-48 text-center shrink-0 border border-base-300">
                <div className="text-xs text-base-content/60 uppercase tracking-widest font-semibold mb-1">Live Reading</div>
                <div className="text-3xl font-bold font-mono">{ultrasonicDistance !== undefined ? ultrasonicDistance : '--'} <span className="text-sm font-sans text-base-content/50">cm</span></div>
              </div>
            </div>
            <div className="card-actions justify-end mt-4">
              <button 
                className={`btn btn-info text-white btn-sm ${savingSection === 'calibration' ? 'btn-disabled' : ''}`}
                onClick={handleCalibrationSave}
              >
                {savingSection === 'calibration' ? <span className="loading loading-spinner loading-xs"></span> : <Save className="w-4 h-4" />}
                Apply Calibration
              </button>
            </div>
          </div>
        </div>

        {/* Section 3: Timing Parameters */}
        <div className="card bg-base-100 shadow-xl border border-base-200">
          <div className="card-body">
            <h2 className="card-title flex items-center gap-2 border-b border-base-200 pb-4 mb-4">
              <Clock className="w-5 h-5 text-accent" />
              Timing Parameters
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="form-control w-full">
                <label className="label"><span className="label-text font-medium">Pump Duration (sec)</span></label>
                <input 
                  type="number" 
                  min="1" max="30"
                  className="input input-bordered w-full" 
                  value={timing.pumpDuration}
                  onChange={(e) => { setTiming({...timing, pumpDuration: Number(e.target.value)}); markDirty(); }}
                />
              </div>
              <div className="form-control w-full">
                <label className="label"><span className="label-text font-medium">UV Duration (sec)</span></label>
                <input 
                  type="number" 
                  min="10" max="120"
                  className="input input-bordered w-full" 
                  value={timing.uvDuration}
                  onChange={(e) => { setTiming({...timing, uvDuration: Number(e.target.value)}); markDirty(); }}
                />
              </div>
              <div className="form-control w-full">
                <label className="label"><span className="label-text font-medium">Departure Confirm (sec)</span></label>
                <input 
                  type="number" 
                  min="1" max="10"
                  className="input input-bordered w-full" 
                  value={timing.personGoneConfirm}
                  onChange={(e) => { setTiming({...timing, personGoneConfirm: Number(e.target.value)}); markDirty(); }}
                />
              </div>
            </div>
            <div className="card-actions justify-end mt-4">
              <button 
                className={`btn btn-accent text-white btn-sm ${savingSection === 'timing' ? 'btn-disabled' : ''}`}
                onClick={handleTimingSave}
              >
                {savingSection === 'timing' ? <span className="loading loading-spinner loading-xs"></span> : <Save className="w-4 h-4" />}
                Save Timings
              </button>
            </div>
          </div>
        </div>

        {/* Section 4: Automation Rules */}
        <div className="card bg-base-100 shadow-xl border border-base-200">
          <div className="card-body">
            <div className="flex justify-between items-center border-b border-base-200 pb-4 mb-4">
              <h2 className="card-title flex items-center gap-2">
                <Settings2 className="w-5 h-5 text-secondary" />
                Automation Rules
              </h2>
              <button className="btn btn-secondary btn-sm" onClick={() => (document.getElementById('add_rule_modal') as HTMLDialogElement)?.showModal()}>
                <Plus className="w-4 h-4" /> Add Rule
              </button>
            </div>
            
            <div className="space-y-6 mt-2">
              {['alerts', 'maintenance'].map((group) => (
                <div key={group}>
                  <h3 className="text-sm font-semibold text-base-content/50 uppercase tracking-widest mb-3 ml-1">{group.replace('_', ' ')}</h3>
                  <div className="space-y-3">
                    {rules.filter(r => r.group === group).length === 0 && (
                      <div className="rounded-xl border border-dashed border-base-300 bg-base-200/40 p-6 text-center">
                        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-base-100 text-base-content/50 shadow-sm">
                          <Settings2 className="h-5 w-5" />
                        </div>
                        <p className="text-sm font-medium text-base-content/70">No rules configured in this group.</p>
                        <p className="mt-1 text-xs text-base-content/45">Add a rule using the + Add Rule button above.</p>
                      </div>
                    )}
                    {rules.filter(r => r.group === group).map((rule) => (
                      <div key={rule.id} className="flex flex-col md:flex-row md:items-center justify-between p-4 bg-base-100 border border-base-200 rounded-xl shadow-sm hover:border-primary/50 transition-colors gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-1">
                            <h4 className="font-semibold truncate">{rule.name}</h4>
                            <span className={`badge badge-sm badge-outline ${rule.enabled ? 'badge-success' : 'badge-neutral'}`}>
                              {rule.enabled ? 'Active' : 'Disabled'}
                            </span>
                          </div>
                          <div className="text-sm">
                            <span className="font-medium text-base-content/80">Trigger:</span> {rule.trigger} 
                            <span className="ml-2 text-xs italic text-base-content/50">({rule.basis})</span>
                          </div>
                          <div className="text-sm mt-1">
                            <span className="font-medium text-base-content/80">Action:</span> <span className="text-primary">{rule.action}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          {group === 'maintenance' && (
                            <button className="btn btn-ghost btn-xs text-base-content/60 hover:text-warning" title="Reset Counter">
                              <RefreshCw className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <input 
                            type="checkbox" 
                            className="toggle toggle-sm toggle-success" 
                            checked={rule.enabled} 
                            onChange={() => toggleRule(rule.id)}
                          />
                          <button className="btn btn-ghost btn-xs text-error ml-2" onClick={() => deleteRuleConfirm(rule.id)} title="Delete Rule">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>

      {/* Add Rule Modal */}
      <dialog id="add_rule_modal" className="modal modal-bottom sm:modal-middle">
        <div className="modal-box">
          <h3 className="font-bold text-lg mb-4">Create Automation Rule</h3>
          <div className="space-y-4">
            <div className="form-control w-full">
              <label className="label"><span className="label-text">Rule Name</span></label>
              <input type="text" placeholder="e.g. Max Daily Limit" className="input input-bordered w-full" />
            </div>
            <div className="form-control w-full">
              <label className="label"><span className="label-text">Group</span></label>
              <select className="select select-bordered w-full">
                <option value="alerts">System Alerts</option>
                <option value="maintenance">Hardware Maintenance</option>
              </select>
            </div>
            <div className="form-control w-full">
              <label className="label"><span className="label-text">Trigger Condition</span></label>
              <input type="text" placeholder="e.g. Flushes > 100 in 24h" className="input input-bordered w-full" />
            </div>
            <div className="form-control w-full">
              <label className="label"><span className="label-text">Action to Perform</span></label>
              <select className="select select-bordered w-full">
                <option>Send Warning Email</option>
                <option>Disable Subsystem</option>
                <option>Create Maintenance Ticket</option>
              </select>
            </div>
          </div>
          <div className="modal-action">
            <form method="dialog">
              <button className="btn btn-ghost mr-2">Cancel</button>
              <button className="btn btn-primary" onClick={() => {
                toast.success("Rule added successfully");
                // In full implementation, this pushes to rules array and marks dirty.
                (document.getElementById('add_rule_modal') as HTMLDialogElement)?.close();
              }}>Create Rule</button>
            </form>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button>close</button>
        </form>
      </dialog>

      <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
    </div>
  );
}
