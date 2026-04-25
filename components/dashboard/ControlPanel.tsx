'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import {
  ChevronDown,
  ChevronUp,
  Droplets,
  Power,
  Settings,
  Sun,
} from 'lucide-react';
import { getIdToken } from 'firebase/auth';
import { useDeviceStatus } from '@/hooks/useDeviceStatus';
import { getErrorMessage } from '@/lib/error-utils';
import { auth } from '@/lib/firebase';

type ActionPayload = Record<string, unknown>;
type ActionResponse = { error?: string } & Record<string, unknown>;

function getDialog(id: string): HTMLDialogElement | null {
  return document.getElementById(id) as HTMLDialogElement | null;
}

export function ControlPanel() {
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [pumpOn, setPumpOn] = useState(false);
  const [uvOn, setUvOn] = useState(false);
  const {
    connected,
    status,
    reason: deviceReason,
    loading: deviceStatusLoading,
  } = useDeviceStatus();
  const isBusy = loadingAction !== null;
  const controlsDisabled = isBusy || deviceStatusLoading || !connected;
  const controlsDisabledReason = deviceStatusLoading
    ? 'Checking ESP32 connection...'
    : deviceReason || 'ESP32 not connected';

  const handleAction = async (
    actionId: string,
    endpoint: string,
    payload: ActionPayload = {},
  ) => {
    if (!connected) {
      toast.error(controlsDisabledReason);
      return null;
    }

    setLoadingAction(actionId);
    try {
      const user = auth.currentUser;
      if (!user) {
        toast.error('You must be logged in to perform this action.');
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
        throw new Error(data.error || 'Action failed');
      }

      return data;
    } catch (error: unknown) {
      toast.error(getErrorMessage(error) || 'Failed to execute action');
      throw error;
    } finally {
      setLoadingAction(null);
    }
  };

  const handleFlush = () => {
    if (pumpOn) {
      void handlePumpOff();
      return;
    }

    getDialog('flush_modal')?.showModal();
  };

  const executeFlush = async () => {
    try {
      const result = await handleAction('flush', '/api/actuators/pump', {
        command: 'ON',
      });
      if (!result) {
        return;
      }

      setPumpOn(true);
      toast.success('Pump activated');
    } catch {
      // Error already handled in handleAction.
    }
  };

  const handlePumpOff = async () => {
    try {
      const result = await handleAction('flush', '/api/actuators/pump', {
        command: 'OFF',
      });
      if (!result) {
        return;
      }

      setPumpOn(false);
      toast.success('Pump deactivated');
    } catch {
      // Error already handled in handleAction.
    }
  };

  const handleUVToggle = async () => {
    const nextState = !uvOn;

    try {
      const result = await handleAction('uv', '/api/actuators/uv', {
        command: nextState ? 'ON' : 'OFF',
      });
      if (!result) {
        return;
      }

      setUvOn(nextState);
      toast.success(nextState ? 'UV light activated' : 'UV light deactivated');
    } catch {
      // Error already handled in handleAction.
    }
  };

  const executeReset = async () => {
    try {
      const result = await handleAction('reset', '/api/actuators/reset');
      if (!result) {
        return;
      }

      setPumpOn(false);
      setUvOn(false);
      toast.success('System reset command sent');
    } catch {
      // Error already handled in handleAction.
    }
  };

  return (
    <>
      <div className="card w-full bg-base-100 shadow-xl">
        <div className="card-body p-6">
          <div className="mb-6 flex items-center justify-between border-b border-base-200 pb-4">
            <div>
              <h2 className="card-title flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Manual Controls
              </h2>
              <div className="mt-2 flex items-center gap-2 text-xs text-base-content/60">
                <span
                  className={`inline-flex h-2.5 w-2.5 rounded-full ${
                    status === 'online'
                      ? 'bg-success animate-pulse'
                      : 'bg-error'
                  }`}
                ></span>
                <span>
                  {status === 'online'
                    ? 'ESP32 Connected'
                    : 'ESP32 Disconnected'}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div
                className={`badge gap-2 border-0 px-3 py-3 font-semibold ${
                  status === 'online'
                    ? 'badge-success text-white'
                    : 'badge-error bg-rose-500 text-white'
                }`}
                title={controlsDisabledReason}
              >
                {status === 'online' ? 'Connected' : 'Disconnected'}
              </div>
              <div className="badge badge-error gap-1 border-0 bg-rose-500 font-semibold uppercase tracking-wide text-white shadow-sm">
                Overrides Active
              </div>
            </div>
          </div>

          {!connected && !deviceStatusLoading && (
            <div className="alert alert-error mb-4 border border-error/30 bg-error/10 text-error-content">
              <div className="text-sm text-error">
                <div className="font-semibold">ESP32 not connected</div>
                <div className="text-xs text-error/80">
                  {controlsDisabledReason}
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div
              className={`w-full ${!connected && !deviceStatusLoading ? 'tooltip tooltip-bottom' : ''}`}
              data-tip={
                !connected && !deviceStatusLoading
                  ? controlsDisabledReason
                  : undefined
              }
            >
              <button
                className={`btn btn-lg h-24 w-full transition-all ${
                  controlsDisabled
                    ? 'btn-disabled border-base-300 bg-base-200 text-base-content/50 opacity-70'
                    : 'btn-outline border-base-300 hover:border-primary hover:bg-base-200 hover:text-primary'
                }`}
                disabled={controlsDisabled}
                onClick={() =>
                  void handleAction('lid_open', '/api/actuators/lid/open')
                    .then((result) => {
                      if (result) {
                        toast.success('Lid opened');
                      }
                    })
                    .catch(() => {})
                }
              >
                <div className="flex flex-col items-center gap-2">
                  {loadingAction === 'lid_open' ? (
                    <span className="loading loading-spinner"></span>
                  ) : (
                    <ChevronUp className="h-6 w-6" />
                  )}
                  <span>Open Lid</span>
                </div>
              </button>
            </div>

            <div
              className={`w-full ${!connected && !deviceStatusLoading ? 'tooltip tooltip-bottom' : ''}`}
              data-tip={
                !connected && !deviceStatusLoading
                  ? controlsDisabledReason
                  : undefined
              }
            >
              <button
                className={`btn btn-lg h-24 w-full transition-all ${
                  controlsDisabled
                    ? 'btn-disabled border-base-300 bg-base-200 text-base-content/50 opacity-70'
                    : 'btn-outline border-base-300 hover:border-primary hover:bg-base-200 hover:text-primary'
                }`}
                disabled={controlsDisabled}
                onClick={() =>
                  void handleAction('lid_close', '/api/actuators/lid/close')
                    .then((result) => {
                      if (result) {
                        toast.success('Lid closed');
                      }
                    })
                    .catch(() => {})
                }
              >
                <div className="flex flex-col items-center gap-2">
                  {loadingAction === 'lid_close' ? (
                    <span className="loading loading-spinner"></span>
                  ) : (
                    <ChevronDown className="h-6 w-6" />
                  )}
                  <span>Close Lid</span>
                </div>
              </button>
            </div>

            <div
              className={`w-full ${!connected && !deviceStatusLoading ? 'tooltip tooltip-bottom' : ''}`}
              data-tip={
                !connected && !deviceStatusLoading
                  ? controlsDisabledReason
                  : undefined
              }
            >
              <button
                className={`btn btn-lg h-24 w-full text-white shadow-sm transition-all ${
                  controlsDisabled
                    ? 'btn-disabled border-base-300 bg-base-200 text-base-content/50 opacity-70'
                    : pumpOn
                      ? 'btn-error hover:-translate-y-0.5 hover:shadow-md'
                      : 'btn-info hover:-translate-y-0.5 hover:shadow-md'
                }`}
                disabled={controlsDisabled}
                onClick={handleFlush}
              >
                <div className="flex flex-col items-center gap-2">
                  {loadingAction === 'flush' ? (
                    <span className="loading loading-spinner"></span>
                  ) : (
                    <Droplets className="h-6 w-6" />
                  )}
                  <span>{pumpOn ? 'Stop Pump' : 'Manual Flush'}</span>
                </div>
              </button>
            </div>

            <div
              className={`w-full ${!connected && !deviceStatusLoading ? 'tooltip tooltip-bottom' : ''}`}
              data-tip={
                !connected && !deviceStatusLoading
                  ? controlsDisabledReason
                  : undefined
              }
            >
              <button
                className={`btn btn-lg h-24 w-full text-white shadow-sm transition-all ${
                  controlsDisabled
                    ? 'btn-disabled border-base-300 bg-base-200 text-base-content/50 opacity-70'
                    : uvOn
                      ? 'btn-warning hover:-translate-y-0.5 hover:shadow-md'
                      : 'btn-accent hover:-translate-y-0.5 hover:shadow-md'
                }`}
                disabled={controlsDisabled}
                onClick={() => void handleUVToggle()}
              >
                <div className="flex flex-col items-center gap-2">
                  {loadingAction === 'uv' ? (
                    <span className="loading loading-spinner"></span>
                  ) : (
                    <Sun className="h-6 w-6" />
                  )}
                  <span>{uvOn ? 'Deactivate UV' : 'Activate UV'}</span>
                </div>
              </button>
            </div>
          </div>

          <div className="divider my-6">Danger Zone</div>

          <div
            className={`w-full ${!connected && !deviceStatusLoading ? 'tooltip tooltip-bottom' : ''}`}
            data-tip={
              !connected && !deviceStatusLoading
                ? controlsDisabledReason
                : undefined
            }
          >
            <button
              className={`btn btn-error btn-outline w-full ${
                controlsDisabled ? 'btn-disabled opacity-70' : ''
              }`}
              disabled={controlsDisabled}
              onClick={() => getDialog('reset_modal')?.showModal()}
            >
              {loadingAction === 'reset' ? (
                <span className="loading loading-spinner"></span>
              ) : (
                <Power className="mr-2 h-4 w-4" />
              )}
              System Reset
            </button>
          </div>
        </div>
      </div>

      <dialog id="flush_modal" className="modal modal-bottom sm:modal-middle">
        <div className="modal-box">
          <h3 className="flex items-center gap-2 text-lg font-bold text-info">
            <Droplets className="h-5 w-5" />
            Confirm Manual Flush
          </h3>
          <p className="py-4">
            Are you sure you want to initiate a manual flush cycle? This will
            override current automation schedules.
          </p>
          <div className="modal-action">
            <form method="dialog">
              <button className="btn btn-ghost mr-2">Cancel</button>
              <button
                className="btn btn-info text-white"
                disabled={controlsDisabled}
                onClick={executeFlush}
              >
                Proceed
              </button>
            </form>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button>close</button>
        </form>
      </dialog>

      <dialog id="reset_modal" className="modal modal-bottom sm:modal-middle">
        <div className="modal-box border-x-4 border-error">
          <h3 className="flex items-center gap-2 text-lg font-bold text-error">
            <Power className="h-5 w-5" />
            System Restart Required
          </h3>
          <p className="py-4">
            Warning: This will reboot the ESP32 controller and temporarily sever
            the connection. All actuators will be turned off. Are you sure you
            wish to proceed?
          </p>
          <div className="modal-action">
            <form method="dialog">
              <button className="btn btn-ghost mr-2">Cancel</button>
              <button
                className="btn btn-error text-white"
                disabled={controlsDisabled}
                onClick={executeReset}
              >
                Execute Reset
              </button>
            </form>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button>close</button>
        </form>
      </dialog>
    </>
  );
}
