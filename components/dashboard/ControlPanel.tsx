'use client';

import { useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Droplets,
  Power,
  Settings,
  ShieldAlert,
  Sun,
} from 'lucide-react';
import { getIdToken } from 'firebase/auth';
import { useDeviceStatus } from '@/hooks/useDeviceStatus';
import { usePresentationMode } from '@/hooks/usePresentationMode';
import { getErrorMessage } from '@/lib/error-utils';
import { auth } from '@/lib/firebase';

type ActuatorKey = 'lid_open' | 'lid_close' | 'flush' | 'uv' | 'reset';
type CycleState = 'idle' | 'sending' | 'acknowledged' | 'active';

type ActionPayload = Record<string, unknown>;
type ActionResponse = {
  success?: boolean;
  error?: string;
  data?: Record<string, unknown>;
} & Record<string, unknown>;

function getDialog(id: string): HTMLDialogElement | null {
  return typeof document !== 'undefined'
    ? (document.getElementById(id) as HTMLDialogElement | null)
    : null;
}

export function ControlPanel() {
  const [actuatorStates, setActuatorStates] = useState<
    Record<ActuatorKey, CycleState>
  >({
    lid_open: 'idle',
    lid_close: 'idle',
    flush: 'idle',
    uv: 'idle',
    reset: 'idle',
  });

  const [pumpOn, setPumpOn] = useState(false);
  const [uvOn, setUvOn] = useState(false);
  const [resetConfirmed, setResetConfirmed] = useState(false);

  const presentationMode = usePresentationMode();
  const {
    connected,
    status,
    reason: deviceReason,
    loading: deviceStatusLoading,
  } = useDeviceStatus();

  const isAnySending = Object.values(actuatorStates).some(
    (state) => state === 'sending',
  );

  const controlsDisabled =
    isAnySending || deviceStatusLoading || (!connected && !presentationMode);

  const controlsDisabledReason = deviceStatusLoading
    ? 'Checking ESP32 link status...'
    : deviceReason || 'ESP32 controller offline';

  const updateActuatorState = useCallback(
    (key: ActuatorKey, state: CycleState) => {
      setActuatorStates((prev) => ({ ...prev, [key]: state }));
    },
    [],
  );

  const handleAction = async (
    actionKey: ActuatorKey,
    endpoint: string,
    payload: ActionPayload = {},
  ): Promise<ActionResponse | null> => {
    if (presentationMode) {
      updateActuatorState(actionKey, 'sending');
      await new Promise((resolve) => window.setTimeout(resolve, 450));
      updateActuatorState(actionKey, 'acknowledged');

      // Revert momentary actions back to idle
      if (actionKey === 'lid_open' || actionKey === 'lid_close') {
        window.setTimeout(() => {
          updateActuatorState(actionKey, 'idle');
        }, 1200);
      }
      return { success: true, endpoint, payload };
    }

    if (!connected) {
      toast.error(controlsDisabledReason);
      return null;
    }

    updateActuatorState(actionKey, 'sending');

    try {
      const user = auth.currentUser;
      if (!user) {
        toast.error('Authentication required to command actuators.');
        updateActuatorState(actionKey, 'idle');
        return null;
      }

      const token = await getIdToken(user);
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data: ActionResponse = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Actuator command rejected by backend');
      }

      updateActuatorState(actionKey, 'acknowledged');

      // If momentary action, transition to idle after brief ack display
      if (
        actionKey === 'lid_open' ||
        actionKey === 'lid_close' ||
        actionKey === 'reset'
      ) {
        window.setTimeout(() => {
          updateActuatorState(actionKey, 'idle');
        }, 1400);
      }

      return data;
    } catch (error: unknown) {
      updateActuatorState(actionKey, 'idle');
      toast.error(getErrorMessage(error) || 'Failed to dispatch command');
      throw error;
    }
  };

  // 1. OPEN LID
  const handleOpenLid = async () => {
    try {
      const result = await handleAction(
        'lid_open',
        '/api/actuators/lid/open',
      );
      if (result) {
        toast.success('Toilet seat lid raised');
      }
    } catch {
      // Error handled in handleAction
    }
  };

  // 2. CLOSE LID
  const handleCloseLid = async () => {
    try {
      const result = await handleAction(
        'lid_close',
        '/api/actuators/lid/close',
      );
      if (result) {
        toast.success('Toilet seat lid lowered');
      }
    } catch {
      // Error handled in handleAction
    }
  };

  // 3. FLUSH HANDLERS (Poka-Yoke: Modal for initiation, instant kill-switch when active)
  const handleFlushButtonClick = () => {
    if (pumpOn) {
      void handlePumpOff();
      return;
    }
    getDialog('flush_modal')?.showModal();
  };

  const executeFlush = async () => {
    getDialog('flush_modal')?.close();
    try {
      const result = await handleAction('flush', '/api/actuators/pump', {
        command: 'ON',
      });
      if (result) {
        setPumpOn(true);
        updateActuatorState('flush', 'active');
        toast.success('Manual flush cycle started');
      }
    } catch {
      // Error handled in handleAction
    }
  };

  const handlePumpOff = async () => {
    try {
      const result = await handleAction('flush', '/api/actuators/pump', {
        command: 'OFF',
      });
      if (result) {
        setPumpOn(false);
        updateActuatorState('flush', 'idle');
        toast.success('Flush stopped');
      }
    } catch {
      // Error handled in handleAction
    }
  };

  // 4. UV STERILIZATION TOGGLE
  const handleUVToggle = async () => {
    const nextState = !uvOn;
    try {
      const result = await handleAction('uv', '/api/actuators/uv', {
        command: nextState ? 'ON' : 'OFF',
      });
      if (result) {
        setUvOn(nextState);
        updateActuatorState('uv', nextState ? 'active' : 'idle');
        toast.success(
          nextState
            ? 'UV disinfection cycle started'
            : 'UV disinfection stopped',
        );
      }
    } catch {
      // Error handled in handleAction
    }
  };

  // 5. HARD RESET HANDLER
  const executeReset = async () => {
    getDialog('reset_modal')?.close();
    setResetConfirmed(false);
    try {
      const result = await handleAction('reset', '/api/actuators/reset');
      if (result) {
        setPumpOn(false);
        setUvOn(false);
        updateActuatorState('flush', 'idle');
        updateActuatorState('uv', 'idle');
        toast.success('Unit restart signal sent');
      }
    } catch {
      // Error handled in handleAction
    }
  };

  return (
    <>
      <div className="relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white/95 p-6 shadow-sm backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/90">
        {/* Header */}
        <div className="mb-6 flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white dark:bg-slate-800 dark:text-slate-200 shadow-sm">
                <Settings className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100">
                  Toilet Device Controls
                </h2>
                <div className="flex items-center gap-2 text-xs font-mono text-slate-500 dark:text-slate-400">
                  <span className="relative flex h-2 w-2 items-center justify-center">
                    {connected && (
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    )}
                    <span
                      className={`relative inline-flex h-2 w-2 rounded-full ${
                        connected ? 'bg-emerald-500' : 'bg-rose-500'
                      }`}
                    />
                  </span>
                  <span className="tabular-nums">
                    {connected
                      ? 'Live Device Connected'
                      : 'Device Offline'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold tabular-nums ${
                connected
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                  : 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300'
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  connected ? 'bg-emerald-500' : 'bg-rose-500 animate-pulse'
                }`}
              />
              {connected ? 'Unit Online' : 'Offline'}
            </span>

            {presentationMode && (
              <span className="inline-flex items-center gap-1 rounded-lg border border-sky-500/30 bg-sky-500/10 px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-sky-700 dark:text-sky-300">
                Presentation Mode
              </span>
            )}

            <span className="inline-flex items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">
              Manual Override
            </span>
          </div>
        </div>

        {/* Offline Safety Lockout Banner */}
        {!connected && !presentationMode && !deviceStatusLoading && (
          <div className="mb-5 flex items-start gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-rose-800 dark:text-rose-300">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-rose-600 dark:text-rose-400" />
            <div className="text-sm">
              <div className="font-bold">Controls Temporarily Locked</div>
              <div className="mt-0.5 text-xs text-rose-700 dark:text-rose-400/90">
                Remote controls are disabled while the toilet unit is
                offline. ({controlsDisabledReason})
              </div>
            </div>
          </div>
        )}

        {/* Tactile Control Grid */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* 1. OPEN LID */}
          <TactileActuatorButton
            title="Open Lid"
            subtitle="Lift Seat Lid"
            icon={ChevronUp}
            state={actuatorStates.lid_open}
            activeAccent="sky"
            disabled={controlsDisabled}
            disabledTooltip={controlsDisabledReason}
            onClick={() => void handleOpenLid()}
          />

          {/* 2. CLOSE LID */}
          <TactileActuatorButton
            title="Close Lid"
            subtitle="Lower Seat Lid"
            icon={ChevronDown}
            state={actuatorStates.lid_close}
            activeAccent="slate"
            disabled={controlsDisabled}
            disabledTooltip={controlsDisabledReason}
            onClick={() => void handleCloseLid()}
          />

          {/* 3. MANUAL FLUSH / EMERGENCY HALT */}
          <TactileActuatorButton
            title={pumpOn ? 'Stop Flush Cycle' : 'Manual Flush'}
            subtitle={
              pumpOn
                ? 'EMERGENCY STOP (Flushing)'
                : 'Run Flush Cycle (6s)'
            }
            icon={Droplets}
            state={actuatorStates.flush}
            isActive={pumpOn}
            activeAccent="cyan"
            isDanger={pumpOn}
            disabled={controlsDisabled && !pumpOn}
            disabledTooltip={controlsDisabledReason}
            onClick={handleFlushButtonClick}
          />

          {/* 4. UV STERILIZE */}
          <TactileActuatorButton
            title={uvOn ? 'Stop UV-C' : 'UV Disinfection'}
            subtitle={
              uvOn
                ? 'Disinfection Active'
                : 'Start UV Clean (45s)'
            }
            icon={Sun}
            state={actuatorStates.uv}
            isActive={uvOn}
            activeAccent="amber"
            disabled={controlsDisabled}
            disabledTooltip={controlsDisabledReason}
            onClick={() => void handleUVToggle()}
          />
        </div>

        {/* Danger Zone: System Reset */}
        <div className="mt-8 border-t border-slate-200/80 pt-5 dark:border-slate-800/80">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
              System Restart & Diagnostics
            </span>
            <span className="text-[11px] font-mono text-slate-400 dark:text-slate-500">
              Safety Protected
            </span>
          </div>

          <div
            className={`w-full ${
              controlsDisabled ? 'tooltip tooltip-bottom' : ''
            }`}
            data-tip={controlsDisabled ? controlsDisabledReason : undefined}
          >
            <button
              type="button"
              className={`flex w-full min-h-[48px] items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-bold tracking-wide transition-all ${
                controlsDisabled
                  ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-600'
                  : 'border-rose-500/40 bg-rose-500/5 text-rose-600 hover:border-rose-500 hover:bg-rose-500 hover:text-white shadow-sm active:translate-y-0.5 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-400 dark:hover:bg-rose-600 dark:hover:text-white'
              }`}
              disabled={controlsDisabled}
              onClick={() => {
                setResetConfirmed(false);
                getDialog('reset_modal')?.showModal();
              }}
            >
              {actuatorStates.reset === 'sending' ? (
                <span className="loading loading-spinner loading-sm" />
              ) : actuatorStates.reset === 'acknowledged' ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              ) : (
                <Power className="h-4 w-4" />
              )}
              <span>Restart Toilet Hardware</span>
            </button>
          </div>
        </div>
      </div>

      {/* CONFIRMATION MODAL 1: MANUAL FLUSH */}
      <dialog
        id="flush_modal"
        className="modal modal-bottom backdrop-blur-sm sm:modal-middle"
      >
        <div className="modal-box border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3 mb-4">
            <div className="flex flex-col">
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                Confirm Manual Flush
              </h3>
              <p className="text-xs text-slate-500">
                Manual Flush Request
              </p>
            </div>
            <button
              type="button"
              onClick={() => getDialog('flush_modal')?.close()}
              aria-label="Close"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-500 dark:hover:text-slate-200 transition-colors"
            >
              ✕
            </button>
          </div>

          <p className="text-sm text-slate-600 dark:text-slate-300">
            Are you sure you want to trigger a manual flush? This will start a
            complete flush cycle on this unit now.
          </p>

          <div className="mt-4 space-y-2 rounded-xl border border-slate-200/80 bg-slate-50/80 p-3 text-xs font-mono dark:border-slate-800/80 dark:bg-slate-800/40">
            <div className="flex justify-between text-slate-600 dark:text-slate-400">
              <span>Target Valve & Pump:</span>
              <span className="font-semibold text-slate-900 dark:text-slate-200">
                Flush Valve & Water Pump
              </span>
            </div>
            <div className="flex justify-between text-slate-600 dark:text-slate-400">
              <span>Flush Duration:</span>
              <span className="font-semibold text-slate-900 dark:text-slate-200 tabular-nums">
                6.0 seconds
              </span>
            </div>
            <div className="flex justify-between text-slate-600 dark:text-slate-400">
              <span>Estimated Water Volume:</span>
              <span className="font-semibold text-cyan-600 dark:text-cyan-400 tabular-nums">
                ~4.2 Liters
              </span>
            </div>
          </div>

          <div className="modal-action mt-6 flex justify-end gap-3">
            <form method="dialog">
              <button className="btn btn-ghost min-h-[48px] border border-slate-200 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                Cancel
              </button>
            </form>
            <button
              type="button"
              className="btn btn-info min-h-[48px] px-5 text-white shadow-sm hover:shadow-md disabled:opacity-90"
              disabled={controlsDisabled}
              onClick={() => void executeFlush()}
            >
              <Droplets className="h-4 w-4 mr-1.5" />
              Confirm Flush
            </button>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop bg-slate-950/60">
          <button>close</button>
        </form>
      </dialog>

      {/* CONFIRMATION MODAL 2: SYSTEM RESET */}
      <dialog
        id="reset_modal"
        className="modal modal-bottom backdrop-blur-sm sm:modal-middle"
      >
        <div className="modal-box border-2 border-rose-500/50 bg-white p-6 shadow-2xl dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3 mb-4">
            <div className="flex flex-col">
              <h3 className="text-lg font-bold text-rose-600 dark:text-rose-400">
                Confirm Hardware Restart
              </h3>
              <p className="text-xs text-slate-500">
                System Reboot
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setResetConfirmed(false);
                getDialog('reset_modal')?.close();
              }}
              aria-label="Close"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-500 dark:hover:text-slate-200 transition-colors"
            >
              ✕
            </button>
          </div>

          <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">
            <p className="font-semibold">
              Warning: This command will restart the toilet unit's controller.
            </p>
            <ul className="mt-1.5 list-inside list-disc space-y-1 text-[11px] opacity-90">
              <li>Any active flush or UV cleaning cycles will stop immediately.</li>
              <li>Connection will drop for 5–10 seconds while the unit reboots.</li>
              <li>Occupancy and water sensors will reset to baseline.</li>
            </ul>
          </div>

          {/* Safety Acknowledgment Checkbox (Poka-Yoke) */}
          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 transition-colors hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-800/40 dark:hover:bg-slate-800">
            <input
              type="checkbox"
              className="checkbox checkbox-error checkbox-sm"
              checked={resetConfirmed}
              onChange={(e) => setResetConfirmed(e.target.checked)}
            />
            <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
              I understand all active cycles will stop and the unit will restart.
            </span>
          </label>

          <div className="modal-action mt-6 flex justify-end gap-3">
            <form method="dialog">
              <button
                className="btn btn-ghost min-h-[48px] border border-slate-200 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                type="button"
                onClick={() => {
                  setResetConfirmed(false);
                  getDialog('reset_modal')?.close();
                }}
              >
                Cancel
              </button>
            </form>
            <button
              type="button"
              className="btn btn-error min-h-[48px] px-5 text-white shadow-sm hover:shadow-md disabled:opacity-50"
              disabled={!resetConfirmed || controlsDisabled}
              onClick={() => void executeReset()}
            >
              <Power className="h-4 w-4 mr-1.5" />
              Restart System
            </button>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop bg-slate-950/60">
          <button
            onClick={() => {
              setResetConfirmed(false);
            }}
          >
            close
          </button>
        </form>
      </dialog>
    </>
  );
}

interface TactileButtonProps {
  title: string;
  subtitle: string;
  icon: typeof ChevronUp;
  state: CycleState;
  isActive?: boolean;
  activeAccent: 'sky' | 'slate' | 'cyan' | 'amber';
  isDanger?: boolean;
  disabled: boolean;
  disabledTooltip?: string;
  onClick: () => void;
}

function TactileActuatorButton({
  title,
  subtitle,
  icon: Icon,
  state,
  isActive = false,
  activeAccent,
  isDanger = false,
  disabled,
  disabledTooltip,
  onClick,
}: TactileButtonProps) {
  // Compute state badges & LEDs
  const isSending = state === 'sending';
  const isAcknowledged = state === 'acknowledged';

  const getLedStyles = () => {
    if (isDanger) {
      return {
        dot: 'bg-rose-500',
        ping: 'bg-rose-400',
        pulse: true,
        label: 'EMERGENCY HALT',
      };
    }
    if (isActive) {
      return {
        dot:
          activeAccent === 'amber'
            ? 'bg-amber-500'
            : activeAccent === 'cyan'
              ? 'bg-cyan-500'
              : 'bg-sky-500',
        ping:
          activeAccent === 'amber'
            ? 'bg-amber-400'
            : activeAccent === 'cyan'
              ? 'bg-cyan-400'
              : 'bg-sky-400',
        pulse: true,
        label: 'ACTIVE CYCLE',
      };
    }
    if (isSending) {
      return {
        dot: 'bg-amber-500',
        ping: 'bg-amber-400',
        pulse: true,
        label: 'SENDING...',
      };
    }
    if (isAcknowledged) {
      return {
        dot: 'bg-emerald-500',
        ping: 'bg-emerald-400',
        pulse: false,
        label: 'ACKNOWLEDGED',
      };
    }
    return {
      dot: 'bg-slate-300 dark:bg-slate-600',
      ping: '',
      pulse: false,
      label: 'STANDBY',
    };
  };

  const led = getLedStyles();

  // Accent container classes
  const getContainerStyle = () => {
    if (disabled) {
      return 'cursor-not-allowed border-slate-200 bg-slate-100/70 text-slate-400 opacity-60 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-600';
    }
    if (isDanger) {
      return 'border-rose-600 bg-rose-500 text-white shadow-lg shadow-rose-500/30 hover:bg-rose-600 active:translate-y-0.5';
    }
    if (isActive) {
      if (activeAccent === 'amber') {
        return 'border-amber-500 bg-amber-500 text-white shadow-lg shadow-amber-500/30 hover:bg-amber-600 active:translate-y-0.5';
      }
      return 'border-cyan-500 bg-cyan-500 text-white shadow-lg shadow-cyan-500/30 hover:bg-cyan-600 active:translate-y-0.5';
    }

    // Idle styling
    return 'border-slate-200/90 bg-slate-50/70 text-slate-800 hover:border-slate-300 hover:bg-slate-100/90 hover:shadow-md active:translate-y-0.5 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-100 dark:hover:border-slate-700 dark:hover:bg-slate-800/80';
  };

  return (
    <div
      className={`w-full ${disabled ? 'tooltip tooltip-bottom' : ''}`}
      data-tip={disabled ? disabledTooltip : undefined}
    >
      <button
        type="button"
        className={`group relative flex h-24 w-full flex-col justify-between rounded-xl border p-4 text-left transition-all duration-200 ${getContainerStyle()}`}
        disabled={disabled}
        onClick={onClick}
      >
        {/* Top row: Icon + LED State Badge */}
        <div className="flex items-center justify-between w-full">
          <div
            className={`flex h-7 w-7 items-center justify-center rounded-lg ${
              isActive || isDanger
                ? 'bg-white/20 text-white'
                : 'bg-slate-200/70 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
            }`}
          >
            {isSending ? (
              <span className="loading loading-spinner loading-xs" />
            ) : isAcknowledged ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            ) : (
              <Icon className="h-4 w-4" />
            )}
          </div>

          {/* LED Indicator & Status Label */}
          <div className="flex items-center gap-1.5">
            <span
              className={`text-[10px] font-mono font-semibold uppercase tracking-wider tabular-nums ${
                isActive || isDanger
                  ? 'text-white/90'
                  : isSending
                    ? 'text-amber-600 dark:text-amber-400'
                    : isAcknowledged
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-slate-400 dark:text-slate-500'
              }`}
            >
              {led.label}
            </span>
            <span className="relative flex h-2.5 w-2.5 items-center justify-center">
              {led.pulse && (
                <span
                  className={`absolute inline-flex h-full w-full animate-ping rounded-full ${led.ping} opacity-75`}
                />
              )}
              <span
                className={`relative inline-flex h-2 w-2 rounded-full ${led.dot}`}
              />
            </span>
          </div>
        </div>

        {/* Bottom row: Button Titles */}
        <div>
          <div className="font-bold text-sm tracking-tight leading-none">
            {title}
          </div>
          <div
            className={`mt-1 text-[11px] font-mono leading-none ${
              isActive || isDanger
                ? 'text-white/80'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            {subtitle}
          </div>
        </div>
      </button>
    </div>
  );
}
