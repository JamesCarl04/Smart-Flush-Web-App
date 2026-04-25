'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import toast, { Toaster } from 'react-hot-toast';
import {
  AlertTriangle,
  Clock,
  Plus,
  RefreshCw,
  Save,
  Settings2,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import { useSensorData } from '@/hooks/useSensorData';
import { useAuth } from '@/hooks/useAuth';
import { useDeviceStatus } from '@/hooks/useDeviceStatus';
import { apiFetch } from '@/lib/api-client';
import { DEFAULT_DEVICE_ID } from '@/lib/device-constants';
import { getErrorMessage } from '@/lib/error-utils';

type TimingConfig = {
  pumpDuration: number;
  uvDuration: number;
  personGoneConfirm: number;
};

type RuleGroup = 'alerts' | 'maintenance';

type Rule = {
  id: string;
  group: RuleGroup;
  name: string;
  trigger: string;
  threshold: number;
  basis: string;
  action: string;
  enabled: boolean;
};

type RuleFormState = {
  name: string;
  group: RuleGroup;
  trigger: string;
  threshold: string;
  action: string;
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

interface DeviceDoc {
  id?: string;
  name?: string;
  config?: Partial<TimingConfig & { threshold: number }>;
}

interface DeviceResponse {
  success: boolean;
  data?: DeviceDoc;
  warning?: string;
}

interface ConfigSaveResponse {
  success: boolean;
  data?: {
    deviceId: string;
    config: TimingConfig & { threshold: number };
  };
  warning?: string;
}

interface RulesResponse {
  success: boolean;
  data: RuleDoc[];
}

const DEFAULT_DEVICE_NAME = "Men's Restroom - Stall 1";
const DEFAULT_THRESHOLD = 30;
const DEFAULT_TIMING: TimingConfig = {
  pumpDuration: 8,
  uvDuration: 45,
  personGoneConfirm: 3,
};

const RULE_ACTION_OPTIONS = [
  'Send Warning Email',
  'Disable Subsystem',
  'Create Maintenance Ticket',
] as const;

const RULE_TRIGGER_OPTIONS = [
  { value: 'flush_count_exceeded', label: 'Flush Count Exceeded' },
  { value: 'water_overuse', label: 'Water Overuse' },
  { value: 'uv_cycle_failed', label: 'UV Cycle Failed' },
  { value: 'maintenance_due', label: 'Maintenance Due' },
] as const;

const DEFAULT_RULE_FORM: RuleFormState = {
  name: '',
  group: 'alerts',
  trigger: 'flush_count_exceeded',
  threshold: '100',
  action: RULE_ACTION_OPTIONS[0],
};

function toUiRuleGroup(group: string): RuleGroup {
  return group === 'maintenance' ? 'maintenance' : 'alerts';
}

function toBackendRuleGroup(group: RuleGroup): string {
  return group === 'maintenance' ? 'maintenance' : 'system_alert';
}

function getRuleTriggerLabel(trigger: string): string {
  return (
    RULE_TRIGGER_OPTIONS.find((option) => option.value === trigger)?.label ??
    trigger.replaceAll('_', ' ')
  );
}

function getRuleBasis(trigger: string, threshold: number): string {
  if (trigger === 'uv_cycle_failed') {
    return 'Triggers when a UV cycle fails to complete';
  }

  if (trigger === 'maintenance_due') {
    return `Maintenance threshold: ${threshold}`;
  }

  return `Threshold: ${threshold}`;
}

function validateDeviceName(name: string): string | null {
  if (!name.trim()) {
    return 'Device name is required.';
  }

  return null;
}

function validateThresholdValue(value: number): string | null {
  if (!Number.isFinite(value) || value < 10 || value > 100) {
    return 'Occupancy threshold must be between 10 and 100 cm.';
  }

  return null;
}

function validateTimingConfig(timing: TimingConfig): string | null {
  if (
    !Number.isFinite(timing.pumpDuration) ||
    timing.pumpDuration < 1 ||
    timing.pumpDuration > 30
  ) {
    return 'Pump duration must be between 1 and 30 seconds.';
  }

  if (
    !Number.isFinite(timing.uvDuration) ||
    timing.uvDuration < 10 ||
    timing.uvDuration > 120
  ) {
    return 'UV duration must be between 10 and 120 seconds.';
  }

  if (
    !Number.isFinite(timing.personGoneConfirm) ||
    timing.personGoneConfirm < 1 ||
    timing.personGoneConfirm > 10
  ) {
    return 'Departure confirm duration must be between 1 and 10 seconds.';
  }

  return null;
}

function validateRuleForm(ruleForm: RuleFormState): string | null {
  if (!ruleForm.name.trim()) {
    return 'Rule name is required.';
  }

  const threshold = Number(ruleForm.threshold);
  if (!Number.isFinite(threshold) || threshold < 0) {
    return 'Rule threshold must be a valid number greater than or equal to 0.';
  }

  return null;
}

function getRuleModal(): HTMLDialogElement | null {
  return document.getElementById('add_rule_modal') as HTMLDialogElement | null;
}

export default function ConfigurationPage() {
  const { user } = useAuth();
  const { ultrasonicDistance } = useSensorData();
  const {
    status: deviceStatus,
    connected,
    reason: deviceReason,
    lastSeen,
    loading: deviceLoading,
  } = useDeviceStatus(DEFAULT_DEVICE_ID);

  const [deviceName, setDeviceName] = useState(DEFAULT_DEVICE_NAME);
  const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD);
  const [timing, setTiming] = useState<TimingConfig>(DEFAULT_TIMING);
  const [rules, setRules] = useState<Rule[]>([]);
  const [ruleForm, setRuleForm] = useState<RuleFormState>(DEFAULT_RULE_FORM);
  const [isDirty, setIsDirty] = useState(false);
  const [savingSection, setSavingSection] = useState<string | null>(null);
  const [loadingConfiguration, setLoadingConfiguration] = useState(true);
  const [loadingRules, setLoadingRules] = useState(true);
  const [creatingRule, setCreatingRule] = useState(false);
  const [ruleMutationId, setRuleMutationId] = useState<string | null>(null);

  const markDirty = () => setIsDirty(true);

  const fetchConfiguration = useCallback(async () => {
    if (!user) {
      setLoadingConfiguration(false);
      return;
    }

    try {
      setLoadingConfiguration(true);
      const response = await apiFetch<DeviceResponse>(
        `/api/devices/${DEFAULT_DEVICE_ID}`,
        user,
      );
      const config = response.data?.config ?? {};

      setDeviceName(response.data?.name?.trim() || DEFAULT_DEVICE_NAME);
      setThreshold(
        typeof config.threshold === 'number'
          ? config.threshold
          : DEFAULT_THRESHOLD,
      );
      setTiming({
        pumpDuration:
          typeof config.pumpDuration === 'number'
            ? config.pumpDuration
            : DEFAULT_TIMING.pumpDuration,
        uvDuration:
          typeof config.uvDuration === 'number'
            ? config.uvDuration
            : DEFAULT_TIMING.uvDuration,
        personGoneConfirm:
          typeof config.personGoneConfirm === 'number'
            ? config.personGoneConfirm
            : DEFAULT_TIMING.personGoneConfirm,
      });
      setIsDirty(false);
    } catch (error) {
      const message = getErrorMessage(error);
      if (message !== 'Device not found') {
        toast.error(message ?? 'Failed to load device configuration.');
      }

      setDeviceName(DEFAULT_DEVICE_NAME);
      setThreshold(DEFAULT_THRESHOLD);
      setTiming(DEFAULT_TIMING);
      setIsDirty(false);
    } finally {
      setLoadingConfiguration(false);
    }
  }, [user]);

  const fetchRules = useCallback(async () => {
    if (!user) {
      setRules([]);
      setLoadingRules(false);
      return;
    }

    try {
      setLoadingRules(true);
      const response = await apiFetch<RulesResponse>(
        '/api/automation-rules',
        user,
      );
      setRules(
        (response.data ?? []).map((rule) => ({
          id: rule.id,
          group: toUiRuleGroup(rule.group),
          name: rule.name,
          trigger: rule.trigger,
          threshold: rule.threshold,
          basis: getRuleBasis(rule.trigger, rule.threshold),
          action: rule.action,
          enabled: rule.enabled,
        })),
      );
    } catch (error) {
      console.error('[Configuration] fetch rules error:', error);
      toast.error(getErrorMessage(error) ?? 'Failed to load automation rules.');
    } finally {
      setLoadingRules(false);
    }
  }, [user]);

  useEffect(() => {
    void fetchConfiguration();
    void fetchRules();
  }, [fetchConfiguration, fetchRules]);

  const handleConfigWarning = (warning?: string) => {
    if (warning) {
      toast(warning, { duration: 4500 });
    }
  };

  const handleDeviceSave = async () => {
    if (!user) {
      toast.error('You must be logged in to save device settings.');
      return;
    }

    const validationError = validateDeviceName(deviceName);
    if (validationError) {
      toast.error(validationError);
      return;
    }

    setSavingSection('device');
    try {
      await apiFetch<DeviceResponse>(
        `/api/devices/${DEFAULT_DEVICE_ID}`,
        user,
        {
          method: 'PUT',
          body: JSON.stringify({ name: deviceName.trim() }),
        },
      );
      toast.success('Device settings saved.');
      await fetchConfiguration();
    } catch (error) {
      toast.error(getErrorMessage(error) ?? 'Failed to save device settings.');
    } finally {
      setSavingSection(null);
    }
  };

  const handleCalibrationSave = async () => {
    if (!user) {
      toast.error('You must be logged in to save calibration values.');
      return;
    }

    const validationError = validateThresholdValue(threshold);
    if (validationError) {
      toast.error(validationError);
      return;
    }

    setSavingSection('calibration');
    try {
      const response = await apiFetch<ConfigSaveResponse>(
        `/api/sensors/${DEFAULT_DEVICE_ID}/config`,
        user,
        {
          method: 'PUT',
          body: JSON.stringify({ threshold }),
        },
      );
      toast.success('Sensor calibration saved.');
      handleConfigWarning(response.warning);
      await fetchConfiguration();
    } catch (error) {
      toast.error(getErrorMessage(error) ?? 'Failed to save calibration.');
    } finally {
      setSavingSection(null);
    }
  };

  const handleTimingSave = async () => {
    if (!user) {
      toast.error('You must be logged in to save timing parameters.');
      return;
    }

    const validationError = validateTimingConfig(timing);
    if (validationError) {
      toast.error(validationError);
      return;
    }

    setSavingSection('timing');
    try {
      const response = await apiFetch<ConfigSaveResponse>(
        `/api/sensors/${DEFAULT_DEVICE_ID}/config`,
        user,
        {
          method: 'PUT',
          body: JSON.stringify(timing),
        },
      );
      toast.success('Timing parameters updated.');
      handleConfigWarning(response.warning);
      await fetchConfiguration();
    } catch (error) {
      toast.error(
        getErrorMessage(error) ?? 'Failed to update timing parameters.',
      );
    } finally {
      setSavingSection(null);
    }
  };

  const openRuleModal = (group: RuleGroup = 'alerts') => {
    setRuleForm({
      ...DEFAULT_RULE_FORM,
      group,
      action:
        group === 'maintenance'
          ? RULE_ACTION_OPTIONS[2]
          : RULE_ACTION_OPTIONS[0],
    });
    getRuleModal()?.showModal();
  };

  const closeRuleModal = () => {
    getRuleModal()?.close();
  };

  const handleCreateRule = async () => {
    if (!user) {
      toast.error('You must be logged in to create automation rules.');
      return;
    }

    const validationError = validateRuleForm(ruleForm);
    if (validationError) {
      toast.error(validationError);
      return;
    }

    setCreatingRule(true);
    try {
      await apiFetch('/api/automation-rules', user, {
        method: 'POST',
        body: JSON.stringify({
          name: ruleForm.name.trim(),
          group: toBackendRuleGroup(ruleForm.group),
          trigger: ruleForm.trigger,
          threshold: Number(ruleForm.threshold),
          action: ruleForm.action,
          enabled: true,
        }),
      });
      await fetchRules();
      toast.success('Rule added successfully.');
      closeRuleModal();
    } catch (error) {
      toast.error(getErrorMessage(error) ?? 'Failed to add rule.');
    } finally {
      setCreatingRule(false);
    }
  };

  const toggleRule = async (rule: Rule) => {
    if (!user) {
      toast.error('You must be logged in to update automation rules.');
      return;
    }

    setRuleMutationId(rule.id);
    try {
      await apiFetch(`/api/automation-rules/${rule.id}`, user, {
        method: 'PUT',
        body: JSON.stringify({ enabled: !rule.enabled }),
      });
      setRules((currentRules) =>
        currentRules.map((currentRule) =>
          currentRule.id === rule.id
            ? { ...currentRule, enabled: !currentRule.enabled }
            : currentRule,
        ),
      );
      toast.success(
        `Rule ${rule.enabled ? 'disabled' : 'enabled'} successfully.`,
      );
    } catch (error) {
      toast.error(getErrorMessage(error) ?? 'Failed to update rule.');
    } finally {
      setRuleMutationId(null);
    }
  };

  const deleteRuleConfirm = async (ruleId: string) => {
    if (!user) {
      toast.error('You must be logged in to delete automation rules.');
      return;
    }

    const shouldDelete = window.confirm(
      'Are you sure you want to delete this rule?',
    );
    if (!shouldDelete) {
      return;
    }

    setRuleMutationId(ruleId);
    try {
      await apiFetch(`/api/automation-rules/${ruleId}`, user, {
        method: 'DELETE',
      });
      setRules((currentRules) =>
        currentRules.filter((rule) => rule.id !== ruleId),
      );
      toast.success('Rule deleted successfully.');
    } catch (error) {
      toast.error(getErrorMessage(error) ?? 'Failed to delete rule.');
    } finally {
      setRuleMutationId(null);
    }
  };

  return (
    <div className="container mx-auto relative max-w-4xl animate-fade-in p-4 pb-24 md:p-8">
      {isDirty && (
        <div className="alert alert-warning sticky top-4 z-50 mb-8 shadow-lg animate-in slide-in-from-top-4">
          <AlertTriangle className="h-5 w-5 flex-shrink-0" />
          <div>
            <h3 className="font-bold">Unsaved Changes</h3>
            <div className="text-xs">
              You have modified configuration parameters. Remember to save your
              changes.
            </div>
          </div>
        </div>
      )}

      <div className="mb-8">
        <h1 className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-3xl font-bold text-transparent">
          System Configuration
        </h1>
        <p className="mt-1 text-base-content/60">
          Manage hardware settings, calibration, and automation logic.
        </p>
      </div>

      <div className="flex flex-col gap-8">
        <div className="card border border-base-200 bg-base-100 shadow-xl">
          <div className="card-body">
            <h2 className="card-title mb-4 flex items-center gap-2 border-b border-base-200 pb-4">
              <Settings2 className="h-5 w-5 text-primary" />
              Device Profile
            </h2>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="form-control w-full">
                <label className="label">
                  <span className="label-text font-medium">Device Name</span>
                </label>
                <input
                  type="text"
                  className="input input-bordered w-full"
                  value={deviceName}
                  disabled={loadingConfiguration}
                  onChange={(event) => {
                    setDeviceName(event.target.value);
                    markDirty();
                  }}
                />
              </div>
              <div className="flex flex-col justify-center gap-2 pt-2">
                <div className="text-sm">
                  <span className="inline-block w-24 text-base-content/50">
                    Status:
                  </span>
                  {deviceLoading ? (
                    <span className="ml-2 inline-block h-4 w-12 skeleton"></span>
                  ) : (
                    <span
                      className={`badge badge-sm ml-2 gap-1 ${
                        connected ? 'badge-success' : 'badge-error'
                      }`}
                      title={deviceReason}
                    >
                      {connected ? 'Connected' : 'Disconnected'}
                    </span>
                  )}
                </div>
                <div className="text-sm">
                  <span className="inline-block w-24 text-base-content/50">
                    Last Seen:
                  </span>
                  <span className="ml-2">
                    {deviceLoading ? (
                      <span className="inline-block h-4 w-20 skeleton"></span>
                    ) : lastSeen ? (
                      formatDistanceToNow(new Date(lastSeen), {
                        addSuffix: true,
                      })
                    ) : (
                      'Never'
                    )}
                  </span>
                </div>
                {!deviceLoading && (
                  <div className="text-xs text-base-content/50">
                    {deviceStatus === 'online'
                      ? 'ESP32 heartbeat is active.'
                      : deviceReason}
                  </div>
                )}
              </div>
            </div>
            <div className="card-actions mt-4 justify-end">
              <button
                className={`btn btn-primary btn-sm ${savingSection === 'device' ? 'btn-disabled' : ''}`}
                disabled={loadingConfiguration || savingSection !== null}
                onClick={handleDeviceSave}
              >
                {savingSection === 'device' ? (
                  <span className="loading loading-spinner loading-xs"></span>
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save Profile
              </button>
            </div>
          </div>
        </div>

        <div className="card border border-base-200 bg-base-100 shadow-xl">
          <div className="card-body">
            <h2 className="card-title mb-4 flex items-center gap-2 border-b border-base-200 pb-4">
              <SlidersHorizontal className="h-5 w-5 text-info" />
              Sensor Calibration
            </h2>
            <div className="flex flex-col items-center gap-8 md:flex-row">
              <div className="form-control w-full flex-1">
                <label className="label">
                  <span className="label-text font-medium">
                    Occupancy Detection Threshold
                  </span>
                  <span className="label-text-alt font-bold text-info">
                    {threshold} cm
                  </span>
                </label>
                <input
                  type="range"
                  min="10"
                  max="100"
                  value={threshold}
                  disabled={loadingConfiguration}
                  className="range range-info range-sm mt-2"
                  onChange={(event) => {
                    setThreshold(Number(event.target.value));
                    markDirty();
                  }}
                />
                <div className="mt-2 flex w-full justify-between px-2 text-xs text-base-content/50">
                  <span>10cm</span>
                  <span>Max sensitivity (100cm)</span>
                </div>
              </div>
              <div className="w-full shrink-0 rounded-xl border border-base-300 bg-base-200 p-4 text-center md:w-48">
                <div className="mb-1 text-xs font-semibold uppercase tracking-widest text-base-content/60">
                  Live Reading
                </div>
                <div className="font-mono text-3xl font-bold">
                  {ultrasonicDistance !== undefined ? ultrasonicDistance : '--'}{' '}
                  <span className="font-sans text-sm text-base-content/50">
                    cm
                  </span>
                </div>
              </div>
            </div>
            <div className="card-actions mt-4 justify-end">
              <button
                className={`btn btn-info btn-sm text-white ${
                  savingSection === 'calibration' ? 'btn-disabled' : ''
                }`}
                disabled={loadingConfiguration || savingSection !== null}
                onClick={handleCalibrationSave}
              >
                {savingSection === 'calibration' ? (
                  <span className="loading loading-spinner loading-xs"></span>
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Apply Calibration
              </button>
            </div>
          </div>
        </div>

        <div className="card border border-base-200 bg-base-100 shadow-xl">
          <div className="card-body">
            <h2 className="card-title mb-4 flex items-center gap-2 border-b border-base-200 pb-4">
              <Clock className="h-5 w-5 text-accent" />
              Timing Parameters
            </h2>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              <div className="form-control w-full">
                <label className="label">
                  <span className="label-text font-medium">
                    Pump Duration (sec)
                  </span>
                </label>
                <input
                  type="number"
                  min="1"
                  max="30"
                  className="input input-bordered w-full"
                  value={timing.pumpDuration}
                  disabled={loadingConfiguration}
                  onChange={(event) => {
                    setTiming((currentTiming) => ({
                      ...currentTiming,
                      pumpDuration: Number(event.target.value),
                    }));
                    markDirty();
                  }}
                />
              </div>
              <div className="form-control w-full">
                <label className="label">
                  <span className="label-text font-medium">
                    UV Duration (sec)
                  </span>
                </label>
                <input
                  type="number"
                  min="10"
                  max="120"
                  className="input input-bordered w-full"
                  value={timing.uvDuration}
                  disabled={loadingConfiguration}
                  onChange={(event) => {
                    setTiming((currentTiming) => ({
                      ...currentTiming,
                      uvDuration: Number(event.target.value),
                    }));
                    markDirty();
                  }}
                />
              </div>
              <div className="form-control w-full">
                <label className="label">
                  <span className="label-text font-medium">
                    Departure Confirm (sec)
                  </span>
                </label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  className="input input-bordered w-full"
                  value={timing.personGoneConfirm}
                  disabled={loadingConfiguration}
                  onChange={(event) => {
                    setTiming((currentTiming) => ({
                      ...currentTiming,
                      personGoneConfirm: Number(event.target.value),
                    }));
                    markDirty();
                  }}
                />
              </div>
            </div>
            <div className="card-actions mt-4 justify-end">
              <button
                className={`btn btn-accent btn-sm text-white ${
                  savingSection === 'timing' ? 'btn-disabled' : ''
                }`}
                disabled={loadingConfiguration || savingSection !== null}
                onClick={handleTimingSave}
              >
                {savingSection === 'timing' ? (
                  <span className="loading loading-spinner loading-xs"></span>
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save Timings
              </button>
            </div>
          </div>
        </div>

        <div className="card border border-base-200 bg-base-100 shadow-xl">
          <div className="card-body">
            <div className="mb-4 flex items-center justify-between border-b border-base-200 pb-4">
              <h2 className="card-title flex items-center gap-2">
                <Settings2 className="h-5 w-5 text-secondary" />
                Automation Rules
              </h2>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => openRuleModal()}
              >
                <Plus className="h-4 w-4" /> Add Rule
              </button>
            </div>

            <div className="mt-2 space-y-6">
              {(['alerts', 'maintenance'] as RuleGroup[]).map((group) => {
                const groupRules = rules.filter((rule) => rule.group === group);

                return (
                  <div key={group}>
                    <div className="mb-3 ml-1 flex items-center justify-between">
                      <h3 className="text-sm font-semibold uppercase tracking-widest text-base-content/50">
                        {group === 'alerts' ? 'Alerts' : 'Maintenance'}
                      </h3>
                      <button
                        className="btn btn-ghost btn-xs text-secondary"
                        onClick={() => openRuleModal(group)}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add
                      </button>
                    </div>
                    <div className="space-y-3">
                      {loadingRules &&
                        [0, 1].map((index) => (
                          <div
                            key={`${group}-skeleton-${index}`}
                            className="rounded-xl border border-base-200 bg-base-100 p-4 shadow-sm"
                          >
                            <div className="mb-3 h-5 w-40 skeleton"></div>
                            <div className="mb-2 h-4 w-2/3 skeleton"></div>
                            <div className="h-4 w-1/2 skeleton"></div>
                          </div>
                        ))}

                      {!loadingRules && groupRules.length === 0 && (
                        <div className="rounded-xl border border-dashed border-base-300 bg-base-200/40 p-6 text-center">
                          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-base-100 text-base-content/50 shadow-sm">
                            <Settings2 className="h-5 w-5" />
                          </div>
                          <p className="text-sm font-medium text-base-content/70">
                            No rules configured in this group.
                          </p>
                          <p className="mt-1 text-xs text-base-content/45">
                            Add a rule using the + Add Rule button above.
                          </p>
                        </div>
                      )}

                      {!loadingRules &&
                        groupRules.map((rule) => {
                          const isMutatingRule = ruleMutationId === rule.id;

                          return (
                            <div
                              key={rule.id}
                              className="flex flex-col justify-between gap-4 rounded-xl border border-base-200 bg-base-100 p-4 shadow-sm transition-colors hover:border-primary/50 md:flex-row md:items-center"
                            >
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-3 mb-1">
                                  <h4 className="font-semibold truncate">
                                    {rule.name}
                                  </h4>
                                  <span
                                    className={`badge badge-sm badge-outline ${rule.enabled ? 'badge-success' : 'badge-neutral'}`}
                                  >
                                    {rule.enabled ? 'Active' : 'Disabled'}
                                  </span>
                                </div>
                                <div className="text-sm">
                                  <span className="font-medium text-base-content/80">
                                    Trigger:
                                  </span>{' '}
                                  {getRuleTriggerLabel(rule.trigger)}
                                  <span className="ml-2 text-xs italic text-base-content/50">
                                    ({rule.basis})
                                  </span>
                                </div>
                                <div className="text-sm mt-1">
                                  <span className="font-medium text-base-content/80">
                                    Action:
                                  </span>{' '}
                                  <span className="text-primary">
                                    {rule.action}
                                  </span>
                                </div>
                              </div>
                              <div className="flex items-center gap-3 shrink-0">
                                {group === 'maintenance' && (
                                  <button
                                    className="btn btn-ghost btn-xs text-base-content/60 hover:text-warning"
                                    title="Reset Counter"
                                    disabled={isMutatingRule}
                                  >
                                    <RefreshCw className="h-3.5 w-3.5" />
                                  </button>
                                )}
                                <input
                                  type="checkbox"
                                  className="toggle toggle-sm toggle-success"
                                  checked={rule.enabled}
                                  disabled={isMutatingRule}
                                  onChange={() => void toggleRule(rule)}
                                />
                                <button
                                  className="btn btn-ghost btn-xs text-error ml-2"
                                  disabled={isMutatingRule}
                                  onClick={() =>
                                    void deleteRuleConfirm(rule.id)
                                  }
                                  title="Delete Rule"
                                >
                                  {isMutatingRule ? (
                                    <span className="loading loading-spinner loading-xs"></span>
                                  ) : (
                                    <Trash2 className="h-4 w-4" />
                                  )}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Add Rule Modal */}
      <dialog
        id="add_rule_modal"
        className="modal modal-bottom sm:modal-middle"
      >
        <div className="modal-box">
          <h3 className="font-bold text-lg mb-4">Create Automation Rule</h3>
          <div className="space-y-4">
            <div className="form-control w-full">
              <label className="label">
                <span className="label-text">Rule Name</span>
              </label>
              <input
                type="text"
                placeholder="e.g. Max Daily Limit"
                className="input input-bordered w-full"
                value={ruleForm.name}
                onChange={(event) =>
                  setRuleForm((currentForm) => ({
                    ...currentForm,
                    name: event.target.value,
                  }))
                }
              />
            </div>
            <div className="form-control w-full">
              <label className="label">
                <span className="label-text">Group</span>
              </label>
              <select
                className="select select-bordered w-full"
                value={ruleForm.group}
                onChange={(event) =>
                  setRuleForm((currentForm) => ({
                    ...currentForm,
                    group: event.target.value as RuleGroup,
                    action:
                      event.target.value === 'maintenance'
                        ? RULE_ACTION_OPTIONS[2]
                        : currentForm.action === RULE_ACTION_OPTIONS[2]
                          ? RULE_ACTION_OPTIONS[0]
                          : currentForm.action,
                  }))
                }
              >
                <option value="alerts">System Alerts</option>
                <option value="maintenance">Hardware Maintenance</option>
              </select>
            </div>
            <div className="form-control w-full">
              <label className="label">
                <span className="label-text">Trigger Condition</span>
              </label>
              <select
                className="select select-bordered w-full"
                value={ruleForm.trigger}
                onChange={(event) =>
                  setRuleForm((currentForm) => ({
                    ...currentForm,
                    trigger: event.target.value,
                  }))
                }
              >
                {RULE_TRIGGER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-control w-full">
              <label className="label">
                <span className="label-text">Threshold / Limit</span>
              </label>
              <input
                type="number"
                min="0"
                className="input input-bordered w-full"
                value={ruleForm.threshold}
                onChange={(event) =>
                  setRuleForm((currentForm) => ({
                    ...currentForm,
                    threshold: event.target.value,
                  }))
                }
              />
            </div>
            <div className="form-control w-full">
              <label className="label">
                <span className="label-text">Action to Perform</span>
              </label>
              <select
                className="select select-bordered w-full"
                value={ruleForm.action}
                onChange={(event) =>
                  setRuleForm((currentForm) => ({
                    ...currentForm,
                    action: event.target.value,
                  }))
                }
              >
                {RULE_ACTION_OPTIONS.map((action) => (
                  <option key={action} value={action}>
                    {action}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="modal-action">
            <button
              className="btn btn-ghost"
              type="button"
              onClick={closeRuleModal}
            >
              Cancel
            </button>
            <button
              className={`btn btn-primary ${creatingRule ? 'btn-disabled' : ''}`}
              type="button"
              disabled={creatingRule}
              onClick={() => void handleCreateRule()}
            >
              {creatingRule ? (
                <span className="loading loading-spinner loading-xs"></span>
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Create Rule
            </button>
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
