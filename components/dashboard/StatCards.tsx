'use client';

import { useEffect, useState } from 'react';
import { useSensorData } from '@/hooks/useSensorData';
import { useDeviceStatus } from '@/hooks/useDeviceStatus';
import { useSystemState } from '@/hooks/useSystemState';
import {
  Activity,
  ArrowUpCircle,
  Droplets,
  Moon,
  Power,
  Sun,
} from 'lucide-react';

type SystemStateKey = 'standby' | 'lid_open' | 'flushing' | 'uv_active';

const STATE_VISUALS: Record<
  SystemStateKey,
  {
    label: string;
    badgeLabel: string;
    icon: typeof Moon;
    iconClassName: string;
    badgeClassName: string;
    surfaceClassName: string;
    meterClassName: string;
  }
> = {
  standby: {
    label: 'Standby',
    badgeLabel: 'Standby',
    icon: Moon,
    iconClassName: 'text-base-content/60',
    badgeClassName: 'border-base-300 bg-base-200 text-base-content/70',
    surfaceClassName: 'bg-base-200',
    meterClassName: 'w-3/12 bg-base-content/40',
  },
  lid_open: {
    label: 'Lid Open',
    badgeLabel: 'Ready',
    icon: ArrowUpCircle,
    iconClassName: 'text-sky-500',
    badgeClassName: 'border-sky-500/20 bg-sky-500/10 text-sky-600',
    surfaceClassName: 'bg-sky-500/10',
    meterClassName: 'w-5/12 bg-sky-500',
  },
  flushing: {
    label: 'Flushing',
    badgeLabel: 'Running',
    icon: Droplets,
    iconClassName: 'text-cyan-500',
    badgeClassName: 'border-cyan-500/20 bg-cyan-500/10 text-cyan-600',
    surfaceClassName: 'bg-cyan-500/10',
    meterClassName: 'w-8/12 bg-cyan-500 animate-pulse',
  },
  uv_active: {
    label: 'UV Active',
    badgeLabel: 'Sanitizing',
    icon: Sun,
    iconClassName: 'text-amber-500',
    badgeClassName: 'border-amber-500/20 bg-amber-500/10 text-amber-600',
    surfaceClassName: 'bg-amber-500/10',
    meterClassName: 'w-full bg-amber-500 animate-pulse',
  },
};

export function StatCards() {
  const {
    ultrasonicDistance,
    waterFlowRate,
    loading: sensorLoading,
  } = useSensorData();
  const {
    connected,
    lastSeen,
    reason: deviceReason,
    loading: deviceLoading,
  } = useDeviceStatus();
  const { systemState, loading: systemLoading } = useSystemState();
  const [now, setNow] = useState(() => Date.now());
  const [cardsVisible, setCardsVisible] = useState(false);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setCardsVisible(true);
    }, 30);

    return () => window.clearTimeout(timeoutId);
  }, []);

  const secondsAgo = lastSeen ? Math.floor((now - lastSeen) / 1000) : 0;
  const safeSystemState = (systemState || 'standby') as SystemStateKey;
  const currentState = STATE_VISUALS[safeSystemState] ?? STATE_VISUALS.standby;
  const CurrentStateIcon = currentState.icon;

  return (
    <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
      <AnimatedCard delayMs={0} visible={cardsVisible}>
        <div className="card bg-base-100 shadow-xl">
          <div className="card-body p-6">
            <div className="mb-2 flex items-start justify-between">
              <h3 className="card-title text-sm font-medium text-base-content/70">
                Occupancy
              </h3>
              <Activity className="h-5 w-5 text-primary" />
            </div>
            {sensorLoading ? (
              <div className="mt-2 h-10 w-full rounded skeleton"></div>
            ) : (
              <>
                <div className="mb-2 text-3xl font-bold">
                  {ultrasonicDistance} cm
                </div>
                {ultrasonicDistance !== undefined && ultrasonicDistance < 30 ? (
                  <div className="badge badge-success gap-2 text-white">
                    Person Present
                  </div>
                ) : (
                  <div className="badge badge-neutral gap-2">Standby</div>
                )}
              </>
            )}
          </div>
        </div>
      </AnimatedCard>

      <AnimatedCard delayMs={90} visible={cardsVisible}>
        <div className="card bg-base-100 shadow-xl">
          <div className="card-body p-6">
            <div className="mb-2 flex items-start justify-between">
              <h3 className="card-title text-sm font-medium text-base-content/70">
                Water Flow
              </h3>
              <Droplets className="h-5 w-5 text-info" />
            </div>
            {sensorLoading ? (
              <div className="mt-2 h-10 w-full rounded skeleton"></div>
            ) : (
              <>
                <div className="mb-2 text-3xl font-bold">
                  {waterFlowRate} L/min
                </div>
                <div className="badge mt-1 border border-base-content/20 badge-ghost">
                  Active Reading
                </div>
              </>
            )}
          </div>
        </div>
      </AnimatedCard>

      <AnimatedCard delayMs={180} visible={cardsVisible}>
        <div className="card bg-base-100 shadow-xl">
          <div className="card-body p-6">
            <div className="mb-2 flex items-start justify-between">
              <h3 className="card-title text-sm font-medium text-base-content/70">
                Connection
              </h3>
              <Power className="h-5 w-5 text-secondary" />
            </div>
            {deviceLoading ? (
              <div className="mt-2 h-10 w-full rounded skeleton"></div>
            ) : (
              <>
                <div className="mb-2 flex h-9 items-center gap-2">
                  {connected ? (
                    <div className="badge badge-success badge-lg px-3 py-3 font-semibold text-white">
                      Connected
                    </div>
                  ) : (
                    <div className="badge badge-error badge-lg px-3 py-3 font-semibold text-white">
                      Disconnected
                    </div>
                  )}
                </div>
                {lastSeen ? (
                  <div className="mt-2 text-xs font-medium text-base-content/60">
                    Last seen {secondsAgo} seconds ago
                  </div>
                ) : (
                  <div className="mt-2 text-xs font-medium text-base-content/60">
                    {deviceReason}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </AnimatedCard>

      <AnimatedCard delayMs={270} visible={cardsVisible}>
        <div className="card bg-base-100 shadow-xl">
          <div className="card-body p-6">
            <div className="mb-3 text-sm font-medium text-base-content/70">
              Current State
            </div>
            {systemLoading ? (
              <div className="space-y-3">
                <div className="skeleton h-14 w-14 rounded-2xl"></div>
                <div className="skeleton h-8 w-2/3"></div>
                <div className="skeleton h-6 w-1/2"></div>
              </div>
            ) : (
              <div className="flex h-full flex-col gap-4">
                <div
                  className={`inline-flex w-fit rounded-2xl p-3 ${currentState.surfaceClassName}`}
                >
                  <CurrentStateIcon
                    className={`h-7 w-7 ${currentState.iconClassName}`}
                  />
                </div>
                <div>
                  <div className="mb-2 text-2xl font-bold tracking-tight">
                    {currentState.label}
                  </div>
                  <div
                    className={`badge border px-3 py-3 text-xs font-semibold ${currentState.badgeClassName}`}
                  >
                    {currentState.badgeLabel}
                  </div>
                </div>
                <div className="mb-1 mt-auto h-1.5 w-full overflow-hidden rounded-full bg-base-200">
                  <div
                    className={`h-1.5 rounded-full ${currentState.meterClassName}`}
                  ></div>
                </div>
              </div>
            )}
          </div>
        </div>
      </AnimatedCard>
    </div>
  );
}

function AnimatedCard({
  children,
  delayMs,
  visible,
}: {
  children: React.ReactNode;
  delayMs: number;
  visible: boolean;
}) {
  return (
    <div
      className={`transform transition-all duration-500 ease-out ${
        visible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
      }`}
      style={{ transitionDelay: `${delayMs}ms` }}
    >
      {children}
    </div>
  );
}
