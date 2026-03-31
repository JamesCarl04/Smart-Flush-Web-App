"use client";

import { useEffect, useState } from "react";
import { useSensorData } from "@/hooks/useSensorData";
import { useDeviceStatus } from "@/hooks/useDeviceStatus";
import { useSystemState } from "@/hooks/useSystemState";
import { Activity, Droplets, Power, Cpu } from "lucide-react";

export function StatCards() {
  const { ultrasonicDistance, waterFlowRate, loading: sensorLoading } = useSensorData();
  const { status: deviceStatus, lastSeen, loading: deviceLoading } = useDeviceStatus();
  const { systemState, loading: systemLoading } = useSystemState();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, []);

  const secondsAgo = lastSeen ? Math.floor((now - lastSeen) / 1000) : 0;
  
  // Format system state nicely
  const formattedState = systemState === 'lid_open' ? 'Lid Open' 
                       : systemState === 'uv_active' ? 'UV Active' 
                       : systemState === 'flushing' ? 'Flushing' 
                       : 'Standby';

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      
      {/* Distance Sensor Card */}
      <div className="card bg-base-100 shadow-xl">
        <div className="card-body p-6">
          <div className="flex justify-between items-start mb-2">
            <h3 className="card-title text-sm font-medium text-base-content/70">Occupancy</h3>
            <Activity className="w-5 h-5 text-primary" />
          </div>
          {sensorLoading ? (
            <div className="h-10 skeleton w-full mt-2 rounded"></div>
          ) : (
            <>
              <div className="text-3xl font-bold mb-2">{ultrasonicDistance} cm</div>
              {ultrasonicDistance !== undefined && ultrasonicDistance < 30 ? (
                <div className="badge badge-success gap-2 text-white">Person Present</div>
              ) : (
                <div className="badge badge-neutral gap-2">Standby</div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Water Flow Card */}
      <div className="card bg-base-100 shadow-xl">
        <div className="card-body p-6">
          <div className="flex justify-between items-start mb-2">
            <h3 className="card-title text-sm font-medium text-base-content/70">Water Flow</h3>
            <Droplets className="w-5 h-5 text-info" />
          </div>
          {sensorLoading ? (
            <div className="h-10 skeleton w-full mt-2 rounded"></div>
          ) : (
            <>
              <div className="text-3xl font-bold mb-2">{waterFlowRate} L/min</div>
              <div className="badge badge-ghost mt-1 border border-base-content/20">Active Reading</div>
            </>
          )}
        </div>
      </div>

      {/* Device Status Card */}
      <div className="card bg-base-100 shadow-xl">
        <div className="card-body p-6">
          <div className="flex justify-between items-start mb-2">
            <h3 className="card-title text-sm font-medium text-base-content/70">Connection</h3>
            <Power className="w-5 h-5 text-secondary" />
          </div>
          {deviceLoading ? (
            <div className="h-10 skeleton w-full mt-2 rounded"></div>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-2 h-9">
                {deviceStatus === 'online' ? (
                  <div className="badge badge-success text-white px-3 py-3 font-semibold badge-lg">Online</div>
                ) : (
                  <div className="badge badge-error text-white px-3 py-3 font-semibold badge-lg">Offline</div>
                )}
              </div>
              <div className="text-xs text-base-content/60 mt-2 font-medium">
                Last seen {secondsAgo} seconds ago
              </div>
            </>
          )}
        </div>
      </div>

      {/* System State Card */}
      <div className="card bg-base-100 shadow-xl">
        <div className="card-body p-6">
          <div className="flex justify-between items-start mb-2">
            <h3 className="card-title text-sm font-medium text-base-content/70">Current State</h3>
            <Cpu className="w-5 h-5 text-accent" />
          </div>
          {systemLoading ? (
            <div className="h-10 skeleton w-full mt-2 rounded"></div>
          ) : (
            <>
              <div className="text-2xl font-bold mb-2 tracking-tight">{formattedState}</div>
              <div className="w-full bg-base-200 rounded-full h-1.5 mt-3 mb-1 overflow-hidden">
                 <div className={`h-1.5 rounded-full ${
                   systemState === 'standby' ? 'bg-neutral w-2/12' :
                   systemState === 'flushing' ? 'bg-info w-8/12 animate-pulse' :
                   systemState === 'uv_active' ? 'bg-accent w-full animate-pulse' :
                   'bg-warning w-5/12'
                 }`}></div>
              </div>
            </>
          )}
        </div>
      </div>

    </div>
  );
}
