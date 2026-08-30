'use client';

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock,
  Cpu,
  Droplets,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  MapPin,
  Plus,
  Pencil,
  Radio,
  RefreshCw,
  Save,
  Sliders,
  Sparkles,
  Sun,
  Trash2,
  UserCheck,
  Zap,
} from 'lucide-react';
import { reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth';
import { useSensorData } from '@/hooks/useSensorData';
import { useAuth } from '@/hooks/useAuth';
import { useDeviceStatus } from '@/hooks/useDeviceStatus';
import { apiFetch } from '@/lib/api-client';
import { DEFAULT_DEVICE_ID } from '@/lib/device-constants';
import { getErrorMessage } from '@/lib/error-utils';
import { PublicReportingControls } from '@/components/configuration/PublicReportingControls';
import { getSiteUrl } from '@/lib/site-url';
import {
  AUTOMATION_ACTIONS,
  AUTOMATION_RULE_CONFIG,
  getAutomationRuleDefinition,
  type AutomationRuleDefinition,
  type AutomationRuleTrigger,
  validateAutomationRule,
} from '@/lib/automation-rule-config';

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
  waterWaitSeconds?: number;
  repeatIntervalMinutes: number;
  basis: string;
  action: string;
  enabled: boolean;
};

type RuleFormState = {
  name: string;
  trigger: AutomationRuleTrigger;
  threshold: string;
  waterWaitSeconds: string;
  repeatIntervalMinutes: string;
  action: string;
};

interface RuleDoc {
  id: string;
  group: string;
  name: string;
  trigger: string;
  threshold: number;
  waterWaitSeconds?: number;
  repeatIntervalMinutes?: number;
  action: string;
  enabled: boolean;
}

interface DeviceDoc {
  id?: string;
  name?: string;
  building?: string;
  floor?: string;
  location?: string;
  config?: Partial<TimingConfig & { threshold: number }>;
  publicReportingEnabled?: boolean;
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
const SDCA_BUILDING = 'SDCA Annex Building';
const DEFAULT_FLOOR = '4th Floor';
const DEFAULT_LOCATION = '4th Floor Restroom Zone';
const DEFAULT_THRESHOLD = 30;
const DEFAULT_TIMING: TimingConfig = {
  pumpDuration: 8,
  uvDuration: 45,
  personGoneConfirm: 3,
};

const SDCA_FLOORS = [
  '1st Floor',
  '2nd Floor',
  '3rd Floor',
  '4th Floor',
] as const;

const SDCA_FLOOR_RESTROOMS: Record<string, string[]> = {
  '1st Floor': [
    '1F Canteen Female Restroom',
    '1F Canteen Male Restroom',
    '1F Faculty Female Restroom',
    '1F Faculty Male Restroom',
    '1st Floor Testing Lab',
  ],
  '2nd Floor': [
    '2F Female Restroom 1',
    '2F Female Restroom 2',
    '2F Male Restroom 1',
    '2F Male Restroom 2',
    '2F PWD Restroom',
  ],
  '3rd Floor': [
    '3F Female Restroom 1',
    '3F Female Restroom 2',
    '3F Male Restroom 1',
    '3F Male Restroom 2',
    '3F PWD Restroom',
  ],
  '4th Floor': [
    '4F Female Restroom 1',
    '4F Female Restroom 2',
    '4F Male Restroom 1',
    '4F Male Restroom 2',
    '4F PWD Restroom',
    '4th Floor Restroom Zone',
  ],
};

const RULE_ACTION_OPTIONS = AUTOMATION_ACTIONS;

const RULE_TRIGGER_OPTIONS = (
  Object.entries(AUTOMATION_RULE_CONFIG) as [
    AutomationRuleTrigger,
    AutomationRuleDefinition,
  ][]
).map(([value, config]) => ({ value, label: config.label }));

const DEFAULT_RULE_FORM: RuleFormState = {
  name: '',
  trigger: 'ultrasonic_sensor_fault',
  threshold: '10',
  waterWaitSeconds: '',
  repeatIntervalMinutes: '10',
  action: RULE_ACTION_OPTIONS[0],
};

function toUiRuleGroup(group: string): RuleGroup {
  return group === 'maintenance' ? 'maintenance' : 'alerts';
}

function getRuleActionLabel(action: string): string {
  if (action === 'Create Maintenance Ticket') {
    return 'Send Task to Available Maintenance';
  }
  return action;
}

function getRuleTriggerLabel(trigger: string): string {
  return getAutomationRuleDefinition(trigger)?.label ?? trigger.replaceAll('_', ' ');
}

function getRuleBasis(
  trigger: string,
  threshold: number,
  waterWaitSeconds?: number,
  repeatIntervalMinutes = 10,
): string {
  const config = getAutomationRuleDefinition(trigger);
  if (config) {
    const thresholdBasis = `${config.threshold.label}: ${threshold} ${config.threshold.unit}`;
    const basis = waterWaitSeconds === undefined
      ? thresholdBasis
      : `${thresholdBasis}; water wait: ${waterWaitSeconds} seconds`;
    return `${basis}; repeats: ${repeatIntervalMinutes} minutes`;
  }

  if (trigger === 'uv_cycle_failed') {
    return 'Triggers when a UV cycle fails to complete';
  }

  if (trigger === 'maintenance_due') {
    return `Maintenance threshold: ${threshold} cycles`;
  }

  return `Threshold: ${threshold}`;
}

function getRuleSettingConstraint(setting: AutomationRuleDefinition['threshold']): string {
  if (setting.positive) {
    return `Enter a positive value in ${setting.unit}.`;
  }

  if (setting.max === undefined) {
    return `Minimum: ${setting.min} ${setting.unit}.`;
  }

  return `Allowed range: ${setting.min}–${setting.max} ${setting.unit}.`;
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

  const config = getAutomationRuleDefinition(ruleForm.trigger);
  if (!config) return 'Rule trigger is not supported.';

  const validation = validateAutomationRule({
    group: config.group,
    trigger: ruleForm.trigger,
    threshold: Number(ruleForm.threshold),
    waterWaitSeconds:
      ruleForm.trigger === 'no_water_after_flush'
        ? Number(ruleForm.waterWaitSeconds)
        : undefined,
    repeatIntervalMinutes: Number(ruleForm.repeatIntervalMinutes),
    action: ruleForm.action,
  });

  return validation.success ? null : validation.error;
}

function getRuleModal(): HTMLDialogElement | null {
  return typeof document !== 'undefined'
    ? (document.getElementById('add_rule_modal') as HTMLDialogElement | null)
    : null;
}

export default function ConfigurationPage() {
  const { user, role } = useAuth();
  const { ultrasonicDistance } = useSensorData();
  const { connected, loading: deviceLoading } = useDeviceStatus(DEFAULT_DEVICE_ID);

  const [mounted, setMounted] = useState(false);
  const [deviceName, setDeviceName] = useState(DEFAULT_DEVICE_NAME);
  const [deviceFloor, setDeviceFloor] = useState<string>(DEFAULT_FLOOR);
  const [deviceLocation, setDeviceLocation] = useState<string>(DEFAULT_LOCATION);
  const [savedFloor, setSavedFloor] = useState<string>(DEFAULT_FLOOR);
  const [savedLocation, setSavedLocation] = useState<string>(DEFAULT_LOCATION);
  const [publicReportingEnabled, setPublicReportingEnabled] = useState(true);

  // Password confirmation modal state
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isVerifyingPassword, setIsVerifyingPassword] = useState(false);

  const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD);
  const [timing, setTiming] = useState<TimingConfig>(DEFAULT_TIMING);
  const [rules, setRules] = useState<Rule[]>([]);
  const [activeRuleTab, setActiveRuleTab] = useState<RuleGroup>('alerts');
  const [ruleForm, setRuleForm] = useState<RuleFormState>(DEFAULT_RULE_FORM);
  const [isDirty, setIsDirty] = useState(false);
  const [savingSection, setSavingSection] = useState<string | null>(null);
  const [loadingConfiguration, setLoadingConfiguration] = useState(true);
  const [loadingRules, setLoadingRules] = useState(true);
  const [creatingRule, setCreatingRule] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [ruleMutationId, setRuleMutationId] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Lock background scrolling when password modal is open
  useEffect(() => {
    if (isPasswordModalOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isPasswordModalOpen]);

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

      const loadedName = response.data?.name?.trim() || DEFAULT_DEVICE_NAME;
      const loadedFloor = response.data?.floor?.trim() || DEFAULT_FLOOR;
      const loadedLocation =
        response.data?.location?.trim() || DEFAULT_LOCATION;

      setDeviceName(loadedName);
      setDeviceFloor(loadedFloor);
      setDeviceLocation(loadedLocation);
      setSavedFloor(loadedFloor);
      setSavedLocation(loadedLocation);
      setPublicReportingEnabled(response.data?.publicReportingEnabled !== false);

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
      setDeviceFloor(DEFAULT_FLOOR);
      setDeviceLocation(DEFAULT_LOCATION);
      setSavedFloor(DEFAULT_FLOOR);
      setSavedLocation(DEFAULT_LOCATION);
      setThreshold(DEFAULT_THRESHOLD);
      setTiming(DEFAULT_TIMING);
      setPublicReportingEnabled(true);
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
          waterWaitSeconds: rule.waterWaitSeconds,
          repeatIntervalMinutes: rule.repeatIntervalMinutes ?? 10,
          basis: getRuleBasis(
            rule.trigger,
            rule.threshold,
            rule.waterWaitSeconds,
            rule.repeatIntervalMinutes ?? 10,
          ),
          action: getRuleActionLabel(rule.action),
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

  const executeDeviceSave = async () => {
    if (!user) {
      toast.error('You must be logged in to save device settings.');
      return;
    }

    setSavingSection('device');
    try {
      await apiFetch<DeviceResponse>(
        `/api/devices/${DEFAULT_DEVICE_ID}`,
        user,
        {
          method: 'PUT',
          body: JSON.stringify({
            name: deviceName.trim(),
            building: SDCA_BUILDING,
            floor: deviceFloor.trim(),
            location: deviceLocation.trim(),
          }),
        },
      );
      setSavedFloor(deviceFloor.trim());
      setSavedLocation(deviceLocation.trim());
      setIsPasswordModalOpen(false);
      setConfirmPassword('');
      toast.success('Device profile and facility location updated.');
      await fetchConfiguration();
    } catch (error) {
      toast.error(getErrorMessage(error) ?? 'Failed to save device profile.');
    } finally {
      setSavingSection(null);
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

    const locationChanged =
      deviceFloor.trim() !== savedFloor.trim() ||
      deviceLocation.trim() !== savedLocation.trim();

    if (locationChanged) {
      setPasswordError(null);
      setConfirmPassword('');
      setIsPasswordModalOpen(true);
      return;
    }

    await executeDeviceSave();
  };

  const handleConfirmPasswordSave = async () => {
    if (!user || !user.email) {
      toast.error('User authentication session is invalid.');
      return;
    }

    if (!confirmPassword) {
      setPasswordError('Please enter your account password.');
      return;
    }

    setIsVerifyingPassword(true);
    setPasswordError(null);

    try {
      const credential = EmailAuthProvider.credential(
        user.email,
        confirmPassword,
      );
      await reauthenticateWithCredential(user, credential);
      await executeDeviceSave();
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (
        code === 'auth/wrong-password' ||
        code === 'auth/invalid-credential'
      ) {
        setPasswordError(
          'Incorrect password. Location change was not authorized.',
        );
      } else {
        setPasswordError(
          err instanceof Error
            ? err.message
            : 'Authentication verification failed.',
        );
      }
    } finally {
      setIsVerifyingPassword(false);
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
      toast.success('Sensor calibration applied.');
      handleConfigWarning(response.warning);
      await fetchConfiguration();
    } catch (error) {
      toast.error(getErrorMessage(error) ?? 'Failed to apply calibration.');
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

  const openRuleModal = (group: RuleGroup = activeRuleTab) => {
    const trigger: AutomationRuleTrigger =
      group === 'maintenance'
        ? 'maintenance_due'
        : 'ultrasonic_sensor_fault';
    const config = AUTOMATION_RULE_CONFIG[trigger];
    setRuleForm({
      ...DEFAULT_RULE_FORM,
      trigger,
      threshold: String(config.threshold.default ?? ''),
      waterWaitSeconds: String(config.waterWaitSeconds?.default ?? ''),
      repeatIntervalMinutes: '10',
      action:
        group === 'maintenance'
          ? RULE_ACTION_OPTIONS[2]
          : RULE_ACTION_OPTIONS[0],
    });
    setEditingRuleId(null);
    getRuleModal()?.showModal?.();
  };

  const openRuleEditor = (rule: Rule) => {
    const config = getAutomationRuleDefinition(rule.trigger);
    if (!config) {
      toast.error('This legacy rule cannot be edited in the configuration form.');
      return;
    }

    setRuleForm({
      name: rule.name,
      trigger: rule.trigger as AutomationRuleTrigger,
      threshold: String(rule.threshold),
      waterWaitSeconds: String(rule.waterWaitSeconds ?? config.waterWaitSeconds?.default ?? ''),
      repeatIntervalMinutes: String(rule.repeatIntervalMinutes),
      action: rule.action,
    });
    setEditingRuleId(rule.id);
    getRuleModal()?.showModal?.();
  };

  const closeRuleModal = () => {
    getRuleModal()?.close?.();
    setEditingRuleId(null);
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

    const config = getAutomationRuleDefinition(ruleForm.trigger);
    if (!config) {
      toast.error('Rule trigger is not supported.');
      return;
    }

    setCreatingRule(true);
    try {
      await apiFetch(
        editingRuleId
          ? `/api/automation-rules/${editingRuleId}`
          : '/api/automation-rules',
        user,
        {
          method: editingRuleId ? 'PUT' : 'POST',
          body: JSON.stringify({
            name: ruleForm.name.trim(),
            group: config.group,
            trigger: ruleForm.trigger,
            threshold: Number(ruleForm.threshold),
            ...(ruleForm.trigger === 'no_water_after_flush'
              ? { waterWaitSeconds: Number(ruleForm.waterWaitSeconds) }
              : {}),
            repeatIntervalMinutes: Number(ruleForm.repeatIntervalMinutes),
            action: ruleForm.action,
            ...(editingRuleId ? {} : { enabled: true }),
          }),
        },
      );
      await fetchRules();
      toast.success(editingRuleId ? 'Rule updated successfully.' : 'Rule added successfully.');
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

  const handleResetCounter = async (ruleId: string) => {
    if (!user) {
      toast.error('You must be logged in to reset counters.');
      return;
    }

    setRuleMutationId(ruleId);
    try {
      await apiFetch(`/api/automation-rules/${ruleId}/reset-counter`, user, {
        method: 'POST',
      });
      toast.success('Maintenance counter reset to 0.');
    } catch (error) {
      toast.error(getErrorMessage(error) ?? 'Failed to reset counter.');
    } finally {
      setRuleMutationId(null);
    }
  };

  const isLiveInRange =
    ultrasonicDistance !== undefined &&
    ultrasonicDistance > 0 &&
    ultrasonicDistance <= threshold;

  const selectedRuleConfig = AUTOMATION_RULE_CONFIG[ruleForm.trigger];

  const currentGroupRules = rules.filter(
    (rule) => rule.group === activeRuleTab,
  );

  return (
    <div className="container mx-auto relative max-w-5xl animate-fade-in p-4 pb-24 md:p-8">
      {/* Unsaved Changes Alert Bar */}
      {isDirty && (
        <div className="sticky top-4 z-50 mb-6 flex items-center justify-between rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900 shadow-lg dark:border-amber-800/60 dark:bg-amber-950/70 dark:text-amber-200">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
            <div>
              <p className="text-sm font-semibold">Unsaved Configuration Changes</p>
              <p className="text-xs text-amber-700/80 dark:text-amber-300/80">
                You have modified parameters. Remember to apply or save your changes.
              </p>
            </div>
          </div>
          <span className="text-xs font-mono font-medium uppercase tracking-wider px-2 py-1 rounded bg-amber-200/60 dark:bg-amber-900/60">
            Pending Save
          </span>
        </div>
      )}

      {/* Clean Slate Typography Headline */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl">
          System Configuration
        </h1>
        <span className="sr-only">
          Adjust user detection sensitivity, flush and cleaning timers, and automatic maintenance rules.
        </span>
      </div>

      <div className="flex flex-col gap-8">
        {/* CARD 1: Unit Information */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary dark:bg-primary/20 dark:text-rose-400 border border-primary/20 shadow-xs">
                <Cpu className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Restroom Unit Information
                </h2>
                <span className="sr-only">
                  Unit name, restroom location, and device connection details.
                </span>
              </div>
            </div>

            {/* Device ID Badge */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 dark:text-slate-500 font-medium">Device ID:</span>
              <span className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-100 px-2.5 py-1 font-mono text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                {DEFAULT_DEVICE_ID}
              </span>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Left Column: Editable Identity */}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-2">
                  Unit Display Name
                </label>
                <input
                  type="text"
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 transition-colors focus:border-primary focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-primary"
                  value={deviceName}
                  disabled={loadingConfiguration}
                  placeholder="e.g. 4F Men's Restroom - Stall 1"
                  onChange={(event) => {
                    setDeviceName(event.target.value);
                    markDirty();
                  }}
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-2">
                  Assigned Facility Location
                </label>

                <div className="space-y-2.5">
                  {/* Campus Building Fixed Badge */}
                  <div className="flex items-center gap-2.5 rounded-xl border border-slate-200/80 bg-slate-50/70 p-3 text-xs text-slate-700 dark:border-slate-800/80 dark:bg-slate-800/40 dark:text-slate-300">
                    <Building2 className="h-4 w-4 text-slate-400 shrink-0" />
                    <span className="font-semibold text-slate-900 dark:text-slate-100">
                      {SDCA_BUILDING}
                    </span>
                    <span className="text-slate-400">·</span>
                    <span className="text-slate-500 dark:text-slate-400">Main Campus Facility</span>
                  </div>

                  {/* Floor and Restroom / Zone Selection */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                        Building Floor
                      </label>
                      <select
                        className="w-full rounded-xl border border-slate-300 bg-white py-2.5 px-3 text-xs font-medium text-slate-900 transition-colors focus:border-primary focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                        value={deviceFloor}
                        disabled={loadingConfiguration}
                        onChange={(e) => {
                          const nextFloor = e.target.value;
                          setDeviceFloor(nextFloor);
                          markDirty();
                          const restrooms = SDCA_FLOOR_RESTROOMS[nextFloor] || [];
                          if (restrooms.length > 0 && !restrooms.includes(deviceLocation)) {
                            setDeviceLocation(restrooms[0]);
                          }
                        }}
                      >
                        {SDCA_FLOORS.map((floor) => (
                          <option key={floor} value={floor}>
                            {floor}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                        Restroom / Zone Location
                      </label>
                      <div className="relative">
                        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                          <MapPin className="h-3.5 w-3.5" />
                        </div>
                        <select
                          className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-8 pr-8 text-xs font-medium text-slate-900 transition-colors focus:border-primary focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                          value={deviceLocation}
                          disabled={loadingConfiguration}
                          onChange={(e) => {
                            setDeviceLocation(e.target.value);
                            markDirty();
                          }}
                        >
                          {(SDCA_FLOOR_RESTROOMS[deviceFloor] || []).map((loc) => (
                            <option key={loc} value={loc}>
                              {loc}
                            </option>
                          ))}
                          {!(SDCA_FLOOR_RESTROOMS[deviceFloor] || []).includes(deviceLocation) &&
                            deviceLocation && (
                              <option value={deviceLocation}>
                                {deviceLocation} (Custom)
                              </option>
                            )}
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Hardware & Connection Specs */}
            <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-4.5 dark:border-slate-800/80 dark:bg-slate-800/40 space-y-3">
              <div className="flex items-center justify-between text-xs pb-2 border-b border-slate-200/60 dark:border-slate-700/60">
                <span className="font-medium text-slate-500 dark:text-slate-400">
                  Cloud Connection:
                </span>
                {deviceLoading ? (
                  <span className="h-5 w-20 animate-pulse rounded-full bg-slate-200 dark:bg-slate-700" />
                ) : connected ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Connected (Secure Cloud)
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/30 bg-rose-500/10 px-2.5 py-0.5 text-xs font-semibold text-rose-700 dark:text-rose-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                    Unit Offline
                  </span>
                )}
              </div>

              <div className="flex items-center justify-between text-xs pb-2 border-b border-slate-200/60 dark:border-slate-700/60">
                <span className="font-medium text-slate-500 dark:text-slate-400">
                  Controller Model:
                </span>
                <span className="font-mono text-slate-800 dark:text-slate-200 font-semibold">
                  ESP32-WROOM-32D
                </span>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-500 dark:text-slate-400">
                  Connected Sensors:
                </span>
                <span className="text-slate-800 dark:text-slate-200 font-medium">
                  Occupancy Sensor &amp; Water Flow Meter
                </span>
              </div>
            </div>
          </div>

          <div className="mt-6 flex justify-end border-t border-slate-100 pt-4 dark:border-slate-800">
            <button
              className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-primary px-6 py-2.5 text-sm font-bold text-white shadow-sm transition-all hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/40 active:translate-y-0.5"
              disabled={loadingConfiguration || savingSection !== null}
              onClick={handleDeviceSave}
            >
              {savingSection === 'device' ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent mr-2" />
              ) : null}
              <span>Save Unit Profile</span>
            </button>
          </div>
        </div>

        {user ? (
          <PublicReportingControls
            user={user}
            role={role}
            device={{ id: DEFAULT_DEVICE_ID, name: deviceName, location: deviceLocation, publicReportingEnabled }}
            siteUrl={getSiteUrl()}
            onUpdated={setPublicReportingEnabled}
          />
        ) : null}

        {/* CARD 2: User Detection Range */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-[#B5121B] dark:bg-red-950/60 dark:text-red-400">
                <Radio className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  User Detection Range
                </h2>
                <span className="sr-only">
                  Set how close a person must be for the stall to detect them.
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 dark:text-slate-500 font-medium">Current Threshold:</span>
              <span className="inline-flex items-center rounded-md border border-cyan-200 bg-cyan-50 px-2.5 py-1 font-mono text-xs font-bold text-cyan-700 dark:border-cyan-800 dark:bg-cyan-950/50 dark:text-cyan-300">
                {threshold} cm
              </span>
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-6 lg:flex-row lg:items-center">
            {/* Range Slider Section */}
            <div className="flex-1 space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Occupancy Detection Range
                </label>
              </div>

              {/* Styled Range Slider */}
              <div className="relative py-2">
                <input
                  type="range"
                  min="10"
                  max="100"
                  step="1"
                  value={threshold}
                  disabled={loadingConfiguration}
                  className="w-full h-2.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[#B5121B] dark:bg-slate-700"
                  onChange={(event) => {
                    setThreshold(Number(event.target.value));
                    markDirty();
                  }}
                />
                <div className="mt-2 flex justify-between text-xs text-slate-400 dark:text-slate-500 font-medium">
                  <span>10 (Close)</span>
                  <span>50</span>
                  <span>100 (Far)</span>
                </div>
              </div>
            </div>

            {/* Live Distance Feedback Badge */}
            <div className="shrink-0 rounded-2xl border border-slate-200 bg-slate-50/80 p-5 text-center shadow-inner dark:border-slate-800 dark:bg-slate-800/50 w-full sm:w-60">
              <div className="flex items-center justify-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
                </span>
                Live Sensor Reading
              </div>

              <div className="my-2 font-mono text-4xl font-bold tracking-tight text-slate-900 dark:text-slate-100 tabular-nums">
                {ultrasonicDistance !== undefined ? ultrasonicDistance : '--'}
                <span className="ml-1 text-sm font-normal text-slate-400 dark:text-slate-500">cm</span>
              </div>

              {/* Visual Zone Indicator */}
              <div className="mt-2">
                {ultrasonicDistance === undefined ? (
                  <span className="inline-flex items-center rounded-full bg-slate-200 px-2.5 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                    Awaiting Signal
                  </span>
                ) : isLiveInRange ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-100 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                    <UserCheck className="h-3 w-3" /> Person Detected
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
                    Stall Vacant
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Unified Primary Action: Save Detection Range */}
          <div className="mt-6 flex justify-end border-t border-slate-100 pt-4 dark:border-slate-800">
            <button
              className="tactile-btn inline-flex min-h-[48px] items-center justify-center rounded-xl bg-[#B5121B] px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#8F0D16] focus:outline-none focus:ring-2 focus:ring-[#B5121B]/40"
              disabled={loadingConfiguration || savingSection !== null}
              data-loading={savingSection === 'calibration'}
              onClick={handleCalibrationSave}
            >
              {savingSection === 'calibration' ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent mr-2"></span>
              ) : null}
              Save Detection Range
            </button>
          </div>
        </div>

        {/* CARD 3: Flush & Cleaning Timers */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-[#B5121B] dark:bg-red-950/60 dark:text-red-400">
                <Clock className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Flush &amp; Cleaning Timers
                </h2>
                <span className="sr-only">
                  Set how long the system flushes water and runs UV cleaning.
                </span>
              </div>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-3">
            {/* Input 1: Pump Duration */}
            <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4 dark:border-slate-800/80 dark:bg-slate-800/40">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-2">
                <Droplets className="h-4 w-4 text-sky-500" />
                Flush Duration
              </div>
              <div className="relative">
                <input
                  type="number"
                  min="1"
                  max="30"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 pr-14 text-sm font-semibold text-slate-900 tabular-nums transition-colors focus:border-[#B5121B] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
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
                <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400 dark:text-slate-500">
                  sec
                </span>
              </div>
              <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
                How long water flushes (1 - 30s).
              </p>
            </div>

            {/* Input 2: UV Duration */}
            <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4 dark:border-slate-800/80 dark:bg-slate-800/40">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-2">
                <Sun className="h-4 w-4 text-amber-500" />
                UV Cleaning Duration
              </div>
              <div className="relative">
                <input
                  type="number"
                  min="10"
                  max="120"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 pr-14 text-sm font-semibold text-slate-900 tabular-nums transition-colors focus:border-[#B5121B] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
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
                <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400 dark:text-slate-500">
                  sec
                </span>
              </div>
              <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
                How long UV cleaning runs (10 - 120s).
              </p>
            </div>

            {/* Input 3: Departure Confirmation */}
            <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4 dark:border-slate-800/80 dark:bg-slate-800/40">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-2">
                <Sparkles className="h-4 w-4 text-emerald-500" />
                Departure Delay
              </div>
              <div className="relative">
                <input
                  type="number"
                  min="1"
                  max="10"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 pr-14 text-sm font-semibold text-slate-900 tabular-nums transition-colors focus:border-[#B5121B] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
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
                <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400 dark:text-slate-500">
                  sec
                </span>
              </div>
              <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
                Seconds after user leaves before flush starts (1 - 10s).
              </p>
            </div>
          </div>

          {/* Unified Primary Action: Save Timers */}
          <div className="mt-6 flex justify-end border-t border-slate-100 pt-4 dark:border-slate-800">
            <button
              className="tactile-btn inline-flex min-h-[48px] items-center justify-center rounded-xl bg-[#B5121B] px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#8F0D16] focus:outline-none focus:ring-2 focus:ring-[#B5121B]/40"
              disabled={loadingConfiguration || savingSection !== null}
              data-loading={savingSection === 'timing'}
              onClick={handleTimingSave}
            >
              {savingSection === 'timing' ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent mr-2"></span>
              ) : null}
              Save Timers
            </button>
          </div>
        </div>

        {/* CARD 4: Automatic Alerts & Rules */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-[#B5121B] dark:bg-red-950/60 dark:text-red-400">
                <Sliders className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Automatic Alerts &amp; Rules
                </h2>
                <span className="sr-only">
                  Set automatic alerts and maintenance notifications when thresholds are reached.
                </span>
              </div>
            </div>

            {/* Add Rule Button */}
            <button
              type="button"
              className="tactile-btn inline-flex items-center rounded-xl bg-[#B5121B] px-4 py-2 text-xs font-semibold text-white shadow-sm transition-all hover:bg-[#8F0D16] focus:outline-none"
              onClick={() => openRuleModal(activeRuleTab)}
            >
              Add Rule
            </button>
          </div>

          {/* Group Segmented Tabs */}
          <div className="mt-6 flex items-center gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setActiveRuleTab('alerts')}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors ${
                activeRuleTab === 'alerts'
                  ? 'bg-red-50 text-[#B5121B] dark:bg-red-950/60 dark:text-red-300 font-semibold'
                  : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              System Alerts ({rules.filter((r) => r.group === 'alerts').length})
            </button>
            <button
              type="button"
              onClick={() => setActiveRuleTab('maintenance')}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors ${
                activeRuleTab === 'maintenance'
                  ? 'bg-red-50 text-[#B5121B] dark:bg-red-950/60 dark:text-red-300 font-semibold'
                  : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              Maintenance Rules ({rules.filter((r) => r.group === 'maintenance').length})
            </button>
          </div>

          {/* Rules List / Table */}
          <div className="mt-4 space-y-3">
            {loadingRules ? (
              <div className="space-y-3 py-2">
                {[1, 2].map((idx) => (
                  <div
                    key={idx}
                    className="h-20 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800/60"
                  ></div>
                ))}
              </div>
            ) : currentGroupRules.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 py-12 text-center dark:border-slate-800 dark:bg-slate-800/40">
                <Sliders className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600 mb-2" />
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  No {activeRuleTab === 'alerts' ? 'alert' : 'maintenance'} rules configured yet
                </p>
                <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                  Click the &quot;Add Rule&quot; button above to create an automated workflow.
                </p>
              </div>
            ) : (
              currentGroupRules.map((rule) => {
                const isMutatingRule = ruleMutationId === rule.id;

                return (
                  <div
                    key={rule.id}
                    className="flex flex-col justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 transition-all hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700 sm:flex-row sm:items-center"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <h4 className="font-semibold text-sm text-slate-900 dark:text-slate-100 truncate">
                          {rule.name}
                        </h4>
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                            rule.enabled
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800'
                              : 'bg-slate-100 text-slate-500 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
                          }`}
                        >
                          {rule.enabled ? 'Active' : 'Disabled'}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                        <span>
                          <strong className="text-slate-700 dark:text-slate-300">Trigger:</strong>{' '}
                          {getRuleTriggerLabel(rule.trigger)}
                        </span>
                        <span className="font-mono text-slate-400 dark:text-slate-500">
                          ({rule.basis})
                        </span>
                      </div>

                      <div className="mt-1.5 flex items-center gap-1.5">
                        <span className="text-xs text-slate-500 dark:text-slate-400">Action:</span>
                        <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-300">
                          {rule.action}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                      {rule.group === 'maintenance' && (
                        <button
                          type="button"
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-amber-600 dark:hover:bg-slate-800 transition-colors"
                          title="Reset Trigger Counter"
                          disabled={isMutatingRule}
                          onClick={() => void handleResetCounter(rule.id)}
                        >
                          {isMutatingRule ? (
                            <span className="h-4 w-4 animate-spin rounded-full border-2 border-amber-500 border-t-transparent inline-block" />
                          ) : (
                            <RefreshCw className="h-4 w-4" />
                          )}
                        </button>
                      )}

                      {getAutomationRuleDefinition(rule.trigger) && (
                        <button
                          type="button"
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-colors"
                          disabled={isMutatingRule}
                          onClick={() => openRuleEditor(rule)}
                          title="Edit Rule"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                      )}

                      {/* Clean Toggle Switch */}
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          className="sr-only peer"
                          checked={rule.enabled}
                          disabled={isMutatingRule}
                          onChange={() => void toggleRule(rule)}
                        />
                        <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#B5121B]"></div>
                      </label>

                      {/* Delete Rule Button */}
                      <button
                        type="button"
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-400 transition-colors"
                        disabled={isMutatingRule}
                        onClick={() => void deleteRuleConfirm(rule.id)}
                        title="Delete Rule"
                      >
                        {isMutatingRule ? (
                          <span className="h-4 w-4 animate-spin rounded-full border-2 border-rose-500 border-t-transparent"></span>
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Clean Slide-Over / Modal to Add New Rules */}
      <dialog id="add_rule_modal" className="modal modal-bottom sm:modal-middle">
        <div className="modal-box rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900 max-w-lg">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-slate-800 mb-5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-50 text-[#B5121B] dark:bg-red-950/60 dark:text-red-400">
                <Plus className="h-4 w-4" />
              </div>
              <h3 className="font-bold text-base text-slate-900 dark:text-slate-100">
                {editingRuleId ? 'Edit Automation Rule' : 'Create Automation Rule'}
              </h3>
            </div>
            <button
              type="button"
              className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              onClick={closeRuleModal}
            >
              Esc
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                Rule Name
              </label>
              <input
                type="text"
                placeholder="e.g. Daily Flush Threshold Alert"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm text-slate-900 focus:border-[#B5121B] focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                value={ruleForm.name}
                onChange={(event) =>
                  setRuleForm((currentForm) => ({
                    ...currentForm,
                    name: event.target.value,
                  }))
                }
              />
            </div>

            <div>
              <label
                htmlFor="rule-trigger"
                className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5"
              >
                Trigger Condition
              </label>
              <select
                id="rule-trigger"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-[#B5121B] focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                value={ruleForm.trigger}
                onChange={(event) => {
                  const trigger = event.target.value as AutomationRuleTrigger;
                  const config = AUTOMATION_RULE_CONFIG[trigger];
                  setRuleForm((currentForm) => ({
                    ...currentForm,
                    trigger,
                    threshold: String(config.threshold.default ?? ''),
                    waterWaitSeconds: String(
                      config.waterWaitSeconds?.default ?? '',
                    ),
                    repeatIntervalMinutes: '10',
                  }));
                }}
              >
                {RULE_TRIGGER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                Category: {selectedRuleConfig.group === 'maintenance' ? 'Hardware Maintenance' : 'System Alerts'}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="rule-threshold"
                  className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5"
                >
                  {selectedRuleConfig.threshold.label}
                </label>
                <input
                  id="rule-threshold"
                  type="number"
                  min={selectedRuleConfig.threshold.min}
                  max={selectedRuleConfig.threshold.max}
                  step={selectedRuleConfig.threshold.integer ? 1 : 'any'}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm font-semibold text-slate-900 focus:border-[#B5121B] focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  value={ruleForm.threshold}
                  onChange={(event) =>
                    setRuleForm((currentForm) => ({
                      ...currentForm,
                      threshold: event.target.value,
                    }))
                  }
                />
                <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                  {selectedRuleConfig.threshold.helperText} {getRuleSettingConstraint(selectedRuleConfig.threshold)}
                  {selectedRuleConfig.threshold.default !== undefined &&
                    ` Default: ${selectedRuleConfig.threshold.default} ${selectedRuleConfig.threshold.unit}.`}
                </p>
              </div>

              {selectedRuleConfig.waterWaitSeconds && (
                <div>
                  <label
                    htmlFor="rule-water-wait-seconds"
                    className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5"
                  >
                    {selectedRuleConfig.waterWaitSeconds.label}
                  </label>
                  <input
                    id="rule-water-wait-seconds"
                    type="number"
                    min={selectedRuleConfig.waterWaitSeconds.min}
                    max={selectedRuleConfig.waterWaitSeconds.max}
                    step={1}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm font-semibold text-slate-900 focus:border-[#B5121B] focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    value={ruleForm.waterWaitSeconds}
                    onChange={(event) =>
                      setRuleForm((currentForm) => ({
                        ...currentForm,
                        waterWaitSeconds: event.target.value,
                      }))
                    }
                  />
                  <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                    {selectedRuleConfig.waterWaitSeconds.helperText} {getRuleSettingConstraint(selectedRuleConfig.waterWaitSeconds)} Default: {selectedRuleConfig.waterWaitSeconds.default} {selectedRuleConfig.waterWaitSeconds.unit}.
                  </p>
                </div>
              )}

              <div>
                <label
                  htmlFor="rule-repeat-interval"
                  className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5"
                >
                  Repeat interval
                </label>
                <select
                  id="rule-repeat-interval"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-[#B5121B] focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  value={
                    ruleForm.repeatIntervalMinutes === '1' ||
                    ruleForm.repeatIntervalMinutes === '10'
                      ? ruleForm.repeatIntervalMinutes
                      : 'custom'
                  }
                  onChange={(event) =>
                    setRuleForm((currentForm) => ({
                      ...currentForm,
                      repeatIntervalMinutes:
                        event.target.value === 'custom'
                          ? currentForm.repeatIntervalMinutes === '1' ||
                            currentForm.repeatIntervalMinutes === '10'
                            ? ''
                            : currentForm.repeatIntervalMinutes
                          : event.target.value,
                    }))
                  }
                >
                  <option value="1">1 minute</option>
                  <option value="10">10 minutes</option>
                  <option value="custom">Custom</option>
                </select>
                {ruleForm.repeatIntervalMinutes !== '1' &&
                  ruleForm.repeatIntervalMinutes !== '10' && (
                    <input
                      id="rule-custom-repeat-interval"
                      aria-label="Custom repeat interval (minutes)"
                      type="number"
                      min={1}
                      max={1440}
                      step={1}
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm font-semibold text-slate-900 focus:border-[#B5121B] focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                      value={ruleForm.repeatIntervalMinutes}
                      onChange={(event) =>
                        setRuleForm((currentForm) => ({
                          ...currentForm,
                          repeatIntervalMinutes: event.target.value,
                        }))
                      }
                    />
                  )}
                <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                  Choose how often this rule may repeat. Custom values must be whole minutes from 1 to 1440.
                </p>
              </div>

              <div>
                <label
                  htmlFor="rule-action"
                  className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5"
                >
                  Action to Trigger
                </label>
                <select
                  id="rule-action"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-[#B5121B] focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
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
          </div>

          <div className="mt-6 flex items-center justify-end gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
            <button
              type="button"
              className="rounded-xl px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 transition-colors"
              onClick={closeRuleModal}
            >
              Cancel
            </button>
            <button
              type="button"
              className="tactile-btn inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-[#B5121B] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#8F0D16] focus:outline-none"
              disabled={creatingRule}
              data-loading={creatingRule}
              onClick={() => void handleCreateRule()}
            >
              {creatingRule ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></span>
              ) : (
                <Plus className="h-4 w-4" />
              )}
              {editingRuleId ? 'Update Rule' : 'Create Rule'}
            </button>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button>close</button>
        </form>
      </dialog>

      {/* Password Confirmation Modal for Location Reassignment */}
      {isPasswordModalOpen &&
        mounted &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-md animate-fade-in overscroll-contain overflow-y-auto"
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-password-title"
          >
            <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900 animate-scale-up">
              <div className="flex items-center gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400 border border-amber-500/30">
                  <KeyRound className="h-5 w-5" />
                </div>
                <div>
                  <h3
                    id="confirm-password-title"
                    className="text-base font-bold text-slate-900 dark:text-slate-100"
                  >
                    Confirm Location Reassignment
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Admin verification required
                  </p>
                </div>
              </div>

              <div className="my-4 space-y-3">
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  You are changing the physical facility location of controller{' '}
                  <span className="font-bold text-slate-900 dark:text-slate-100 font-mono">
                    {DEFAULT_DEVICE_ID}
                  </span>{' '}
                  to{' '}
                  <span className="font-semibold text-primary dark:text-rose-400">
                    {SDCA_BUILDING} · {deviceFloor} · {deviceLocation}
                  </span>
                  . Enter your account password to authorize this hardware binding update.
                </p>

                <div className="form-control">
                  <label
                    htmlFor="reauth-password"
                    className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300"
                  >
                    Account Password
                  </label>
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                      <Lock className="h-4 w-4" />
                    </div>
                    <input
                      id="reauth-password"
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => {
                        setConfirmPassword(e.target.value);
                        if (passwordError) setPasswordError(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && confirmPassword) {
                          e.preventDefault();
                          void handleConfirmPasswordSave();
                        }
                      }}
                      placeholder="Enter your password..."
                      disabled={isVerifyingPassword}
                      className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-9 pr-10 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((v) => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                      aria-label="Toggle password visibility"
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>

                  {passwordError && (
                    <p className="mt-1.5 text-xs font-semibold text-rose-500 flex items-center gap-1">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      <span>{passwordError}</span>
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm h-10 px-4 rounded-xl text-slate-600 dark:text-slate-400 font-medium"
                  onClick={() => {
                    setIsPasswordModalOpen(false);
                    setConfirmPassword('');
                    setPasswordError(null);
                  }}
                  disabled={isVerifyingPassword}
                >
                  Cancel
                </button>

                <button
                  type="button"
                  className="btn btn-sm h-10 px-5 rounded-xl bg-primary hover:bg-primary/90 text-white font-bold shadow-sm flex items-center gap-2"
                  onClick={() => void handleConfirmPasswordSave()}
                  disabled={isVerifyingPassword || !confirmPassword.trim()}
                >
                  {isVerifyingPassword ? (
                    <>
                      <span className="loading loading-spinner loading-xs" />
                      <span>Verifying...</span>
                    </>
                  ) : (
                    <>
                      <Lock className="h-3.5 w-3.5" />
                      <span>Authorize &amp; Save</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
