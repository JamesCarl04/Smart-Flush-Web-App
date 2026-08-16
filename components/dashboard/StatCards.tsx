'use client';

import { useEffect, useState, useMemo } from 'react';
import { useSensorData } from '@/hooks/useSensorData';
import { useDeviceStatus } from '@/hooks/useDeviceStatus';
import { useSystemState } from '@/hooks/useSystemState';
import {
  ArrowUpCircle,
  Droplets,
  Moon,
  Radio,
  Scan,
  Sun,
  WifiOff,
} from 'lucide-react';

type SystemStateKey = 'standby' | 'lid_open' | 'flushing' | 'uv_active';

interface StateVisualConfig {
  label: string;
  badgeLabel: string;
  subtext: string;
  icon: typeof Moon;
  iconColor: string;
  iconBg: string;
  badgeStyle: string;
  meterPercent: number;
  meterColor: string;
  ledColor: string;
  pulseLed: boolean;
}

const STATE_CONFIGS: Record<SystemStateKey, StateVisualConfig> = {
  standby: {
    label: 'Standby Mode',
    badgeLabel: 'Idle / Armed',
    subtext: 'Awaiting proximity trigger',
    icon: Moon,
    iconColor: 'text-slate-400 dark:text-slate-500',
    iconBg: 'bg-slate-500/10 dark:bg-slate-500/15',
    badgeStyle:
      'border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300',
    meterPercent: 20,
    meterColor: 'bg-slate-400 dark:bg-slate-600',
    ledColor: 'bg-slate-400 dark:bg-slate-500',
    pulseLed: false,
  },
  lid_open: {
    label: 'Lid Open',
    badgeLabel: 'User Ready',
    subtext: 'Proximity detection active',
    icon: ArrowUpCircle,
    iconColor: 'text-sky-500 dark:text-sky-400',
    iconBg: 'bg-sky-500/10 dark:bg-sky-500/20',
    badgeStyle:
      'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300',
    meterPercent: 50,
    meterColor: 'bg-sky-500',
    ledColor: 'bg-sky-400',
    pulseLed: true,
  },
  flushing: {
    label: 'Flushing Cycle',
    badgeLabel: 'Discharging',
    subtext: 'Solenoid valve engaged',
    icon: Droplets,
    iconColor: 'text-cyan-500 dark:text-cyan-400',
    iconBg: 'bg-cyan-500/10 dark:bg-cyan-500/20',
    badgeStyle:
      'border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300',
    meterPercent: 80,
    meterColor: 'bg-cyan-500 animate-pulse',
    ledColor: 'bg-cyan-400',
    pulseLed: true,
  },
  uv_active: {
    label: 'UV Sanitizing',
    badgeLabel: 'Sterilizing',
    subtext: '254nm UV-C cycle active',
    icon: Sun,
    iconColor: 'text-amber-500 dark:text-amber-400',
    iconBg: 'bg-amber-500/10 dark:bg-amber-500/20',
    badgeStyle:
      'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
    meterPercent: 100,
    meterColor: 'bg-amber-500 animate-pulse',
    ledColor: 'bg-amber-400',
    pulseLed: true,
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

  // Compute timing metrics with tabular numbers
  const secondsAgo = useMemo(() => {
    if (!lastSeen) return 0;
    return Math.max(0, Math.floor((now - lastSeen) / 1000));
  }, [now, lastSeen]);

  // Telemetry Freshness Metric (0 to 100%)
  const linkFreshnessPercent = useMemo(() => {
    if (!connected) return 0;
    if (secondsAgo <= 3) return 100;
    if (secondsAgo >= 20) return 15;
    return Math.round(100 - ((secondsAgo - 3) / 17) * 85);
  }, [connected, secondsAgo]);

  // Occupancy Proximity Metric Calculations (0 - 100 cm range)
  const distanceVal =
    ultrasonicDistance !== undefined && !isNaN(ultrasonicDistance)
      ? Number(ultrasonicDistance)
      : null;
  const isPersonPresent = distanceVal !== null && distanceVal < 30;
  const distanceMeterPercent = useMemo(() => {
    if (distanceVal === null) return 0;
    // Clamped 0-100cm percentage
    return Math.min(100, Math.max(0, Math.round(distanceVal)));
  }, [distanceVal]);

  // Flow Rate Calculations (0 - 10.0 L/min range)
  const flowVal =
    waterFlowRate !== undefined && !isNaN(waterFlowRate)
      ? Number(waterFlowRate)
      : 0;
  const isFlowActive = flowVal > 0.05;
  const flowMeterPercent = useMemo(() => {
    // 0 - 10 L/min scale mapped to 0-100%
    return Math.min(100, Math.max(0, Math.round((flowVal / 10) * 100)));
  }, [flowVal]);

  // System Operating State Config
  const safeSystemState = (systemState || 'standby') as SystemStateKey;
  const currentStateConfig =
    STATE_CONFIGS[safeSystemState] ?? STATE_CONFIGS.standby;
  const CurrentStateIcon = currentStateConfig.icon;

  return (
    <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {/* 1. OCCUPANCY & PROXIMITY CARD */}
      <AnimatedCard delayMs={0} visible={cardsVisible}>
        <div className="group relative flex h-full flex-col justify-between overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm backdrop-blur-md transition-all duration-300 hover:border-slate-300 hover:shadow-md dark:border-slate-800/90 dark:bg-slate-900/80 dark:hover:border-slate-700">
          <div>
            {/* Header */}
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400">
                  <Scan className="h-4 w-4" />
                </div>
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Occupancy
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="relative flex h-2 w-2 items-center justify-center">
                  {isPersonPresent && (
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  )}
                  <span
                    className={`relative inline-flex h-2 w-2 rounded-full ${
                      isPersonPresent
                        ? 'bg-emerald-500 shadow-sm shadow-emerald-500/50'
                        : 'bg-slate-300 dark:bg-slate-600'
                    }`}
                  />
                </span>
              </div>
            </div>

            {/* Metric Value */}
            {sensorLoading ? (
              <div className="space-y-2 py-1">
                <div className="h-8 w-32 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
                <div className="h-5 w-24 animate-pulse rounded-md bg-slate-100 dark:bg-slate-800/60" />
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-baseline gap-1.5">
                  <span className="font-mono text-3xl font-bold tracking-tight text-slate-900 tabular-nums dark:text-slate-100">
                    {distanceVal !== null ? distanceVal.toFixed(0) : '--'}
                  </span>
                  <span className="font-mono text-sm font-medium text-slate-500 dark:text-slate-400">
                    cm
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-semibold tabular-nums ${
                      isPersonPresent
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                        : 'border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        isPersonPresent ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
                      }`}
                    />
                    {isPersonPresent ? 'Person Present' : 'Zone Clear'}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Micro-meter */}
          <div className="mt-5 pt-3 border-t border-slate-100 dark:border-slate-800/60">
            <div className="mb-1.5 flex justify-between text-[10px] font-mono text-slate-400 dark:text-slate-500 tabular-nums">
              <span>0 cm</span>
              <span className="font-semibold text-slate-500 dark:text-slate-400">
                Thresh: 30 cm
              </span>
              <span>100 cm+</span>
            </div>
            <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div
                className={`h-full rounded-full transition-all duration-500 ease-out ${
                  isPersonPresent
                    ? 'bg-emerald-500 shadow-sm shadow-emerald-500/50'
                    : 'bg-sky-500/70'
                }`}
                style={{ width: `${distanceMeterPercent}%` }}
              />
              {/* Threshold indicator line at 30% */}
              <div className="absolute top-0 bottom-0 left-[30%] w-0.5 bg-slate-400/40 dark:bg-slate-500/40" />
            </div>
          </div>
        </div>
      </AnimatedCard>

      {/* 2. WATER FLOW CARD */}
      <AnimatedCard delayMs={90} visible={cardsVisible}>
        <div className="group relative flex h-full flex-col justify-between overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm backdrop-blur-md transition-all duration-300 hover:border-slate-300 hover:shadow-md dark:border-slate-800/90 dark:bg-slate-900/80 dark:hover:border-slate-700">
          <div>
            {/* Header */}
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-600 dark:bg-cyan-500/15 dark:text-cyan-400">
                  <Droplets className="h-4 w-4" />
                </div>
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Water Flow
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="relative flex h-2 w-2 items-center justify-center">
                  {isFlowActive && (
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75" />
                  )}
                  <span
                    className={`relative inline-flex h-2 w-2 rounded-full ${
                      isFlowActive
                        ? 'bg-cyan-500 shadow-sm shadow-cyan-500/50'
                        : 'bg-slate-300 dark:bg-slate-600'
                    }`}
                  />
                </span>
              </div>
            </div>

            {/* Metric Value */}
            {sensorLoading ? (
              <div className="space-y-2 py-1">
                <div className="h-8 w-32 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
                <div className="h-5 w-24 animate-pulse rounded-md bg-slate-100 dark:bg-slate-800/60" />
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-baseline gap-1.5">
                  <span className="font-mono text-3xl font-bold tracking-tight text-slate-900 tabular-nums dark:text-slate-100">
                    {flowVal.toFixed(1)}
                  </span>
                  <span className="font-mono text-sm font-medium text-slate-500 dark:text-slate-400">
                    L/min
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-semibold tabular-nums ${
                      isFlowActive
                        ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300'
                        : 'border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        isFlowActive ? 'bg-cyan-500 animate-pulse' : 'bg-slate-400'
                      }`}
                    />
                    {isFlowActive ? 'Active Flow' : 'Static / Sealed'}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Micro-meter */}
          <div className="mt-5 pt-3 border-t border-slate-100 dark:border-slate-800/60">
            <div className="mb-1.5 flex justify-between text-[10px] font-mono text-slate-400 dark:text-slate-500 tabular-nums">
              <span>0.0 L/m</span>
              <span className="font-semibold text-slate-500 dark:text-slate-400">
                Capacity: 10.0 L/m
              </span>
              <span>10.0</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div
                className={`h-full rounded-full transition-all duration-500 ease-out ${
                  isFlowActive
                    ? 'bg-gradient-to-r from-cyan-500 to-sky-400 shadow-sm shadow-cyan-500/50 animate-pulse'
                    : 'bg-slate-300 dark:bg-slate-700'
                }`}
                style={{ width: `${isFlowActive ? Math.max(12, flowMeterPercent) : 0}%` }}
              />
            </div>
          </div>
        </div>
      </AnimatedCard>

      {/* 3. ESP32 CONNECTION TELEMETRY CARD */}
      <AnimatedCard delayMs={180} visible={cardsVisible}>
        <div className="group relative flex h-full flex-col justify-between overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm backdrop-blur-md transition-all duration-300 hover:border-slate-300 hover:shadow-md dark:border-slate-800/90 dark:bg-slate-900/80 dark:hover:border-slate-700">
          <div>
            {/* Header */}
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                    connected
                      ? 'bg-indigo-500/10 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400'
                      : 'bg-rose-500/10 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400'
                  }`}
                >
                  {connected ? (
                    <Radio className="h-4 w-4" />
                  ) : (
                    <WifiOff className="h-4 w-4" />
                  )}
                </div>
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  ESP32 Link
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="relative flex h-2 w-2 items-center justify-center">
                  {connected && (
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  )}
                  <span
                    className={`relative inline-flex h-2 w-2 rounded-full ${
                      connected
                        ? 'bg-emerald-500 shadow-sm shadow-emerald-500/50'
                        : 'bg-rose-500 shadow-sm shadow-rose-500/50'
                    }`}
                  />
                </span>
              </div>
            </div>

            {/* Metric Value */}
            {deviceLoading ? (
              <div className="space-y-2 py-1">
                <div className="h-8 w-32 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
                <div className="h-5 w-24 animate-pulse rounded-md bg-slate-100 dark:bg-slate-800/60" />
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-baseline gap-2">
                  <span
                    className={`font-mono text-3xl font-bold tracking-tight tabular-nums ${
                      connected
                        ? 'text-slate-900 dark:text-slate-100'
                        : 'text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    {connected ? 'Online' : 'Offline'}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-semibold tabular-nums ${
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
                    {connected ? 'MQTT Broker Sync' : 'Link Severed'}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Micro-meter */}
          <div className="mt-5 pt-3 border-t border-slate-100 dark:border-slate-800/60">
            <div className="mb-1.5 flex justify-between text-[10px] font-mono text-slate-400 dark:text-slate-500 tabular-nums">
              <span>
                {connected
                  ? `Seen: ${secondsAgo}s ago`
                  : deviceReason || 'Disconnected'}
              </span>
              <span className="font-semibold text-slate-500 dark:text-slate-400">
                {connected ? `${linkFreshnessPercent}% Health` : '0%'}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div
                className={`h-full rounded-full transition-all duration-500 ease-out ${
                  connected
                    ? linkFreshnessPercent > 50
                      ? 'bg-emerald-500 shadow-sm shadow-emerald-500/40'
                      : 'bg-amber-500 shadow-sm shadow-amber-500/40'
                    : 'bg-rose-500/60'
                }`}
                style={{ width: `${linkFreshnessPercent}%` }}
              />
            </div>
          </div>
        </div>
      </AnimatedCard>

      {/* 4. SYSTEM OPERATING STATE CARD */}
      <AnimatedCard delayMs={270} visible={cardsVisible}>
        <div className="group relative flex h-full flex-col justify-between overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm backdrop-blur-md transition-all duration-300 hover:border-slate-300 hover:shadow-md dark:border-slate-800/90 dark:bg-slate-900/80 dark:hover:border-slate-700">
          <div>
            {/* Header */}
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-lg ${currentStateConfig.iconBg} ${currentStateConfig.iconColor}`}
                >
                  <CurrentStateIcon className="h-4 w-4" />
                </div>
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Operating State
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="relative flex h-2 w-2 items-center justify-center">
                  {currentStateConfig.pulseLed && (
                    <span
                      className={`absolute inline-flex h-full w-full animate-ping rounded-full ${currentStateConfig.ledColor} opacity-75`}
                    />
                  )}
                  <span
                    className={`relative inline-flex h-2 w-2 rounded-full ${currentStateConfig.ledColor}`}
                  />
                </span>
              </div>
            </div>

            {/* Metric Value */}
            {systemLoading ? (
              <div className="space-y-2 py-1">
                <div className="h-8 w-32 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
                <div className="h-5 w-24 animate-pulse rounded-md bg-slate-100 dark:bg-slate-800/60" />
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-2xl font-bold tracking-tight text-slate-900 tabular-nums dark:text-slate-100">
                    {currentStateConfig.label}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-semibold tabular-nums ${currentStateConfig.badgeStyle}`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${currentStateConfig.ledColor} ${
                        currentStateConfig.pulseLed ? 'animate-pulse' : ''
                      }`}
                    />
                    {currentStateConfig.badgeLabel}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Micro-meter */}
          <div className="mt-5 pt-3 border-t border-slate-100 dark:border-slate-800/60">
            <div className="mb-1.5 flex justify-between text-[10px] font-mono text-slate-400 dark:text-slate-500 tabular-nums">
              <span className="truncate pr-1">{currentStateConfig.subtext}</span>
              <span className="font-semibold text-slate-500 dark:text-slate-400 shrink-0">
                {currentStateConfig.meterPercent}%
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div
                className={`h-full rounded-full transition-all duration-500 ease-out ${currentStateConfig.meterColor}`}
                style={{ width: `${currentStateConfig.meterPercent}%` }}
              />
            </div>
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
        visible ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'
      }`}
      style={{ transitionDelay: `${delayMs}ms` }}
    >
      {children}
    </div>
  );
}
