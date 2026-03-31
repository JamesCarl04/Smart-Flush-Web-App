"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { Power, Settings, Droplets, Sun, ChevronUp, ChevronDown } from "lucide-react";
import { getErrorMessage } from "@/lib/error-utils";
import { auth } from "@/lib/firebase";
import { getIdToken } from "firebase/auth";

type ActionPayload = Record<string, unknown>;
type ActionResponse = { error?: string } & Record<string, unknown>;

export function ControlPanel() {
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [pumpOn, setPumpOn] = useState(false);
  const [uvOn, setUvOn] = useState(false);

  const handleAction = async (actionId: string, endpoint: string, payload: ActionPayload = {}) => {
    setLoadingAction(actionId);
    try {
      const user = auth.currentUser;
      if (!user) {
        toast.error("You must be logged in to perform this action.");
        return;
      }
      const token = await getIdToken(user);

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data: ActionResponse = await res.json();
      if (!res.ok) throw new Error(data.error || 'Action failed');

      return data;
    } catch (err: unknown) {
      toast.error(getErrorMessage(err) || 'Failed to execute action');
      throw err;
    } finally {
      setLoadingAction(null);
    }
  };

  /* ── Flush / Pump toggle ── */
  const handleFlush = () => {
    if (pumpOn) {
      // Pump is running → turn it OFF immediately
      handlePumpOff();
    } else {
      // Pump is off → show confirmation modal
      const modal = document.getElementById('flush_modal') as HTMLDialogElement;
      if (modal) modal.showModal();
    }
  };

  const executeFlush = async () => {
    try {
      await handleAction('flush', '/api/actuators/pump', { command: 'ON' });
      setPumpOn(true);
      toast.success('Pump activated');
    } catch { /* error already toasted */ }
  };

  const handlePumpOff = async () => {
    try {
      await handleAction('flush', '/api/actuators/pump', { command: 'OFF' });
      setPumpOn(false);
      toast.success('Pump deactivated');
    } catch { /* error already toasted */ }
  };

  /* ── UV toggle ── */
  const handleUVToggle = async () => {
    const nextState = !uvOn;
    try {
      await handleAction('uv', '/api/actuators/uv', { command: nextState ? 'ON' : 'OFF' });
      setUvOn(nextState);
      toast.success(nextState ? 'UV light activated' : 'UV light deactivated');
    } catch { /* error already toasted */ }
  };

  /* ── System Reset ── */
  const executeReset = async () => {
    try {
      await handleAction('reset', '/api/actuators/reset');
      setPumpOn(false);
      setUvOn(false);
      toast.success('System reset command sent');
    } catch { /* error already toasted */ }
  };

  return (
    <>
      <div className="card bg-base-100 shadow-xl w-full">
        <div className="card-body p-6">
          <div className="flex justify-between items-center mb-6 pb-4 border-b border-base-200">
            <h2 className="card-title flex items-center gap-2">
              <Settings className="w-5 h-5" />
              Manual Controls
            </h2>
            <div className="badge badge-error gap-1 uppercase tracking-wide font-semibold">
              Overrides Active
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            <button 
              className={`btn btn-lg h-24 ${loadingAction === 'lid_open' ? 'btn-disabled' : 'btn-outline border-base-300 hover:border-primary hover:bg-primary/10 hover:text-primary transition-all'}`}
              onClick={() => handleAction('lid_open', '/api/actuators/lid/open').then(() => toast.success('Lid opened')).catch(() => {})}
            >
              <div className="flex flex-col items-center gap-2">
                {loadingAction === 'lid_open' ? <span className="loading loading-spinner"></span> : <ChevronUp className="w-6 h-6" />}
                <span>Open Lid</span>
              </div>
            </button>

            <button 
              className={`btn btn-lg h-24 ${loadingAction === 'lid_close' ? 'btn-disabled' : 'btn-outline border-base-300 hover:border-primary hover:bg-primary/10 hover:text-primary transition-all'}`}
              onClick={() => handleAction('lid_close', '/api/actuators/lid/close').then(() => toast.success('Lid closed')).catch(() => {})}
            >
              <div className="flex flex-col items-center gap-2">
                {loadingAction === 'lid_close' ? <span className="loading loading-spinner"></span> : <ChevronDown className="w-6 h-6" />}
                <span>Close Lid</span>
              </div>
            </button>

            {/* Pump / Flush toggle button */}
            <button 
              className={`btn shadow-sm btn-lg h-24 text-white hover:btn-active ${pumpOn ? 'btn-error' : 'btn-info'} ${loadingAction === 'flush' ? 'btn-disabled' : ''}`}
              onClick={handleFlush}
            >
              <div className="flex flex-col items-center gap-2">
                 {loadingAction === 'flush' ? <span className="loading loading-spinner"></span> : <Droplets className="w-6 h-6" />}
                 <span>{pumpOn ? 'Stop Pump' : 'Manual Flush'}</span>
              </div>
            </button>

            {/* UV toggle button */}
            <button 
              className={`btn shadow-sm btn-lg h-24 text-white hover:btn-active ${uvOn ? 'btn-warning' : 'btn-accent'} ${loadingAction === 'uv' ? 'btn-disabled' : ''}`}
              onClick={handleUVToggle}
            >
              <div className="flex flex-col items-center gap-2">
                 {loadingAction === 'uv' ? <span className="loading loading-spinner"></span> : <Sun className="w-6 h-6" />}
                 <span>{uvOn ? 'Deactivate UV' : 'Activate UV'}</span>
              </div>
            </button>

          </div>

          <div className="divider my-6">Danger Zone</div>
          
          <button 
            className={`btn btn-error btn-outline w-full ${loadingAction === 'reset' ? 'btn-disabled' : ''}`}
            onClick={() => {
               const modal = document.getElementById('reset_modal') as HTMLDialogElement;
               if (modal) modal.showModal();
            }}
          >
            {loadingAction === 'reset' ? <span className="loading loading-spinner"></span> : <Power className="w-4 h-4 mr-2" />}
            System Reset
          </button>
        </div>
      </div>

      {/* Flush Confirmation Modal */}
      <dialog id="flush_modal" className="modal modal-bottom sm:modal-middle">
        <div className="modal-box">
          <h3 className="font-bold text-lg text-info flex items-center gap-2">
            <Droplets className="w-5 h-5" />
            Confirm Manual Flush
          </h3>
          <p className="py-4">Are you sure you want to initiate a manual flush cycle? This will override current automation schedules.</p>
          <div className="modal-action">
            <form method="dialog">
              <button className="btn btn-ghost mr-2">Cancel</button>
              <button className="btn btn-info text-white" onClick={executeFlush}>Proceed</button>
            </form>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button>close</button>
        </form>
      </dialog>

      {/* Reset Confirmation Modal */}
      <dialog id="reset_modal" className="modal modal-bottom sm:modal-middle">
        <div className="modal-box border-x-4 border-error">
          <h3 className="font-bold text-lg text-error flex items-center gap-2">
            <Power className="w-5 h-5" />
            System Restart Required
          </h3>
          <p className="py-4">Warning: This will reboot the ESP32 controller and temporarily sever the connection. All actuators will be turned off. Are you sure you wish to proceed?</p>
          <div className="modal-action">
            <form method="dialog">
              <button className="btn btn-ghost mr-2">Cancel</button>
              <button className="btn btn-error text-white" onClick={executeReset}>Execute Reset</button>
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
