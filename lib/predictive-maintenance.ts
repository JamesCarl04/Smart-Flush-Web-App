import { DEFAULT_DEVICE_ID } from '@/lib/device-constants';
import { getStallById, SDCA_RESTROOM_ROOMS } from '@/lib/restrooms';
import type {
  ComponentRulPrediction,
  DailyForecastPoint,
  PredictiveHealthStatus,
  PredictiveMaintenanceSummary,
  RestroomRiskScore,
  SensorDriftIndicator,
} from '@/types';

const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;

export interface HardwareWearCounterSnapshot {
  uvOnTimeSeconds: number;
  lidCycleCount: number;
  flowSensorTotalLiters: number;
  pumpTotalLiters: number;
  relayTotalTriggers: number;
  ultrasonicConsecutiveFailures: number;
  flushCycleCount: number;
}

export interface FlushSample {
  waterVolume: number;
  duration: number;
  timestampMs?: number;
}

export interface UltrasonicSample {
  value: number;
  timestampMs?: number;
}

export interface HistoricalDailyPoint {
  date: string;
  flushCount: number;
  waterLiters: number;
}

export interface CampusIncidentRecord {
  deviceId: string;
  timestampMs: number;
  source: 'task' | 'issue_report';
  category?: string;
}

function roundTo(value: number, decimals: number): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function nonNegativeFinite(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  return fallback;
}

/**
 * Ordinary Least Squares (OLS) linear slope over sequential observations y[0..n-1].
 */
function computeLinearSlope(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumXX += i * i;
  }
  const denominator = n * sumXX - sumX * sumX;
  if (denominator === 0) return 0;
  return (n * sumXY - sumX * sumY) / denominator;
}

/**
 * Normalizes raw Firestore wear counter documents into bounded non-negative values.
 */
export function normalizeWearCounters(
  raw: Record<string, unknown> | null | undefined,
): HardwareWearCounterSnapshot {
  const data = raw ?? {};
  return {
    uvOnTimeSeconds: nonNegativeFinite(data.uvOnTimeSeconds),
    lidCycleCount: nonNegativeFinite(data.lidCycleCount),
    flowSensorTotalLiters: nonNegativeFinite(data.flowSensorTotalLiters),
    pumpTotalLiters: nonNegativeFinite(data.pumpTotalLiters),
    relayTotalTriggers: nonNegativeFinite(data.relayTotalTriggers),
    ultrasonicConsecutiveFailures: nonNegativeFinite(
      data.ultrasonicConsecutiveFailures,
    ),
    flushCycleCount: nonNegativeFinite(data.flushCycleCount),
  };
}

function classifyRulStatus(
  wearPercent: number,
  daysRemaining: number,
): PredictiveHealthStatus {
  if (wearPercent >= 90 || daysRemaining <= 7) return 'critical';
  if (wearPercent >= 70 || daysRemaining <= 21) return 'warning';
  if (wearPercent >= 45 || daysRemaining <= 45) return 'watch';
  return 'healthy';
}

interface RulSpec {
  key: ComponentRulPrediction['key'];
  label: string;
  partNumber: string;
  unit: string;
  currentValue: number;
  ratedLimit: number;
  observedBurnPerDay: number;
  fallbackBurnPerDay: number;
  actionPrefix: string;
}

function componentRecommendation(
  status: PredictiveHealthStatus,
  actionPrefix: string,
  daysRemaining: number,
): string {
  const lowerFirst =
    actionPrefix.charAt(0).toLowerCase() + actionPrefix.slice(1);
  if (status === 'critical') {
    return `${actionPrefix} immediately (about ${daysRemaining} days of life left).`;
  }
  if (status === 'warning') {
    return `Schedule maintenance to ${lowerFirst} within ${daysRemaining} days.`;
  }
  if (status === 'watch') {
    return `Routine check recommended in about ${daysRemaining} days.`;
  }
  return `Working normally (about ${daysRemaining} days before service).`;
}

/**
 * Computes estimated equipment lifespan (RUL), daily use rate, and predicted service dates
 * for all 6 hardware components tracked by KLIR wear counters.
 */
export function computeComponentRulPredictions(params: {
  counters: HardwareWearCounterSnapshot;
  windowDays: number;
  observedWindowTotals?: {
    flushes?: number;
    waterLiters?: number;
    uvSeconds?: number;
    lidCycles?: number;
  };
  nowMs?: number;
}): ComponentRulPrediction[] {
  const safeWindowDays = Math.max(1, nonNegativeFinite(params.windowDays, 7));
  const nowMs =
    typeof params.nowMs === 'number' && Number.isFinite(params.nowMs)
      ? params.nowMs
      : Date.now();
  const obs = params.observedWindowTotals ?? {};
  const obsFlushes = nonNegativeFinite(obs.flushes);
  const obsLiters = nonNegativeFinite(obs.waterLiters);
  const obsUvSec = nonNegativeFinite(obs.uvSeconds);
  const obsLidCycles = nonNegativeFinite(obs.lidCycles);

  const effectiveFlushCycles =
    params.counters.flushCycleCount > 0
      ? params.counters.flushCycleCount
      : obsFlushes;

  const specs: RulSpec[] = [
    {
      key: 'uvOnTimeSeconds',
      label: 'UV Cleaning Lamp',
      partNumber: 'Disinfection Light',
      unit: 'hrs',
      currentValue: roundTo(params.counters.uvOnTimeSeconds / 3600, 1),
      ratedLimit: 300,
      observedBurnPerDay: obsUvSec / 3600 / safeWindowDays,
      fallbackBurnPerDay: 0.25,
      actionPrefix: 'Replace UV cleaning lamp',
    },
    {
      key: 'lidCycleCount',
      label: 'Automatic Seat Lid Motor',
      partNumber: 'Lid Opening Mechanism',
      unit: 'cycles',
      currentValue: roundTo(params.counters.lidCycleCount, 0),
      ratedLimit: 10_000,
      observedBurnPerDay: obsLidCycles / safeWindowDays,
      fallbackBurnPerDay: 25,
      actionPrefix: 'Check lid motor and hinge alignment',
    },
    {
      key: 'flowSensorTotalLiters',
      label: 'Water Flow Meter',
      partNumber: 'Water Usage Sensor',
      unit: 'L',
      currentValue: roundTo(params.counters.flowSensorTotalLiters, 1),
      ratedLimit: 500,
      observedBurnPerDay: obsLiters / safeWindowDays,
      fallbackBurnPerDay: 10,
      actionPrefix: 'Clean and check water flow meter',
    },
    {
      key: 'pumpTotalLiters',
      label: 'Water Flush Pump',
      partNumber: 'Main Water Pump',
      unit: 'L',
      currentValue: roundTo(params.counters.pumpTotalLiters, 1),
      ratedLimit: 500,
      observedBurnPerDay: obsLiters / safeWindowDays,
      fallbackBurnPerDay: 10,
      actionPrefix: 'Clean pump filter and check seals',
    },
    {
      key: 'relayTotalTriggers',
      label: 'Power Switch Relay',
      partNumber: 'Automatic Power Switch',
      unit: 'switches',
      currentValue: roundTo(params.counters.relayTotalTriggers, 0),
      ratedLimit: 10_000,
      observedBurnPerDay: (obsFlushes + obsLidCycles) / safeWindowDays,
      fallbackBurnPerDay: 50,
      actionPrefix: 'Check power switch connections',
    },
    {
      key: 'flushCycleCount',
      label: 'Flush Valve & Pipe',
      partNumber: 'Main Water Line',
      unit: 'flushes',
      currentValue: roundTo(effectiveFlushCycles, 0),
      ratedLimit: 1_000,
      observedBurnPerDay: obsFlushes / safeWindowDays,
      fallbackBurnPerDay: 20,
      actionPrefix: 'Clean flush valve and check for mineral buildup',
    },
  ];

  return specs.map((spec) => {
    const wearPercent = Math.min(
      100,
      Math.max(0, roundTo((spec.currentValue / spec.ratedLimit) * 100, 1)),
    );
    const burnRateRaw =
      spec.observedBurnPerDay > 0
        ? spec.observedBurnPerDay
        : spec.fallbackBurnPerDay;
    const dailyBurnRate = Math.max(0.01, roundTo(burnRateRaw, 2));
    const remainingCapacity = Math.max(0, spec.ratedLimit - spec.currentValue);
    const estimatedDaysRemaining = Math.max(
      0,
      Math.min(365, Math.round(remainingCapacity / dailyBurnRate)),
    );
    const predictedServiceDate = new Date(
      nowMs + estimatedDaysRemaining * MS_PER_DAY,
    )
      .toISOString()
      .slice(0, 10);
    const status = classifyRulStatus(wearPercent, estimatedDaysRemaining);

    return {
      key: spec.key,
      label: spec.label,
      partNumber: spec.partNumber,
      unit: spec.unit,
      currentValue: spec.currentValue,
      ratedLimit: spec.ratedLimit,
      wearPercent,
      dailyBurnRate,
      estimatedDaysRemaining,
      predictedServiceDate,
      status,
      recommendation: componentRecommendation(
        status,
        spec.actionPrefix,
        estimatedDaysRemaining,
      ),
    };
  });
}

/**
 * Detects early degradation (drift) in submersible pump flow rate (L/s) and
 * HC-SR04 ultrasonic echo stability before reactive fault limits trip.
 */
export function detectTelemetryDrift(params: {
  flushSamples: FlushSample[];
  ultrasonicSamples: UltrasonicSample[];
  ultrasonicConsecutiveFailures: number;
}): SensorDriftIndicator[] {
  const orderedFlushes = [...params.flushSamples].sort(
    (a, b) => (a.timestampMs ?? 0) - (b.timestampMs ?? 0),
  );
  const flowRates = orderedFlushes
    .filter((s) => Number.isFinite(s.duration) && s.duration > 0 && s.waterVolume >= 0)
    .map((s) => {
      const durationSeconds = s.duration > 120 ? s.duration / 1000 : s.duration;
      const rate = s.waterVolume / Math.max(0.1, durationSeconds);
      return Math.min(2.0, Math.max(0.01, rate));
    });

  let pumpBaseline = 0.25;
  let pumpRecent = 0.25;
  let pumpSlope = 0;

  if (flowRates.length >= 4) {
    const mid = Math.floor(flowRates.length / 2);
    const firstHalf = flowRates.slice(0, mid);
    const secondHalf = flowRates.slice(mid);
    pumpBaseline =
      firstHalf.reduce((sum, val) => sum + val, 0) / firstHalf.length;
    pumpRecent =
      secondHalf.reduce((sum, val) => sum + val, 0) / secondHalf.length;
    pumpSlope = computeLinearSlope(flowRates);
  } else if (flowRates.length > 0) {
    const avg = flowRates.reduce((sum, val) => sum + val, 0) / flowRates.length;
    pumpBaseline = avg;
    pumpRecent = avg;
    pumpSlope = computeLinearSlope(flowRates);
  }

  const pumpDriftPct =
    pumpBaseline > 0
      ? roundTo(((pumpRecent - pumpBaseline) / pumpBaseline) * 100, 1)
      : 0;

  let pumpStatus: PredictiveHealthStatus = 'healthy';
  if (
    (flowRates.length > 0 && pumpRecent < 0.12) ||
    pumpDriftPct <= -30
  ) {
    pumpStatus = 'critical';
  } else if (
    (flowRates.length > 0 && pumpRecent < 0.16) ||
    pumpDriftPct <= -15
  ) {
    pumpStatus = 'warning';
  } else if (pumpDriftPct <= -8) {
    pumpStatus = 'watch';
  }

  const pumpSummary =
    flowRates.length === 0
      ? 'Waiting for recent flush records; normal flow speed is 0.25 L/s.'
      : pumpStatus === 'healthy'
        ? `Water flow speed is steady (${roundTo(pumpRecent, 2)} L/s vs ${roundTo(pumpBaseline, 2)} L/s normal).`
        : `Water flow is slowing down (${pumpDriftPct}% change from normal). Clean the pump filter before a low-water problem occurs.`;

  const orderedUltrasonic = [...params.ultrasonicSamples].sort(
    (a, b) => (a.timestampMs ?? 0) - (b.timestampMs ?? 0),
  );
  const consecutiveFails = nonNegativeFinite(
    params.ultrasonicConsecutiveFailures,
  );
  const totalEchoSamples = orderedUltrasonic.length;
  const timeoutCount = orderedUltrasonic.filter(
    (r) => !Number.isFinite(r.value) || r.value < 0 || r.value > 400,
  ).length;
  const timeoutRatePct =
    totalEchoSamples > 0 ? (timeoutCount / totalEchoSamples) * 100 : 0;
  const recentStability =
    totalEchoSamples > 0
      ? Math.max(0, Math.min(100, roundTo(100 - timeoutRatePct, 1)))
      : consecutiveFails > 0
        ? Math.max(0, roundTo(100 - consecutiveFails * 3, 1))
        : 99.5;
  const baselineStability = 99.0;
  const ultrasonicDriftPct = roundTo(recentStability - baselineStability, 1);
  const stabilitySeries = orderedUltrasonic.map((r) =>
    r.value < 0 || r.value > 400 ? 0 : 100,
  );
  const ultrasonicSlope = computeLinearSlope(stabilitySeries);

  let ultrasonicStatus: PredictiveHealthStatus = 'healthy';
  if (consecutiveFails >= 8 || recentStability < 80) {
    ultrasonicStatus = 'critical';
  } else if (consecutiveFails >= 5 || recentStability < 90) {
    ultrasonicStatus = 'warning';
  } else if (consecutiveFails >= 2 || recentStability < 96) {
    ultrasonicStatus = 'watch';
  }

  const ultrasonicSummary =
    ultrasonicStatus === 'healthy'
      ? `User sensor is reading reliably (${recentStability}% accuracy, ${consecutiveFails}/10 missed readings).`
      : `Sensor missed ${timeoutCount} recent readings (${consecutiveFails}/10 in a row). Wipe the sensor lens to clear moisture or dust.`;

  return [
    {
      sensorKey: 'pump_flow_efficiency',
      label: 'Water Pump Flow Speed',
      metricUnit: 'L/s',
      baselineValue: roundTo(pumpBaseline, 3),
      recentValue: roundTo(pumpRecent, 3),
      driftPercent: pumpDriftPct,
      slopePerEvent: roundTo(pumpSlope, 4),
      reactiveThresholdLabel: 'Alert triggers if water per flush drops below 0.80 L',
      status: pumpStatus,
      diagnosticSummary: pumpSummary,
    },
    {
      sensorKey: 'ultrasonic_echo_stability',
      label: 'User Detection Sensor Reliability',
      metricUnit: '%',
      baselineValue: baselineStability,
      recentValue: recentStability,
      driftPercent: ultrasonicDriftPct,
      slopePerEvent: roundTo(ultrasonicSlope, 3),
      reactiveThresholdLabel: 'Alert triggers after 10 missed readings in a row',
      status: ultrasonicStatus,
      diagnosticSummary: ultrasonicSummary,
    },
  ];
}

function holtForecast(values: number[], alpha = 0.45, beta = 0.25): {
  level: number;
  trend: number;
} {
  if (values.length === 0) return { level: 0, trend: 0 };
  if (values.length === 1) return { level: values[0], trend: 0 };

  let level = values[0];
  let trend = values[1] - values[0];

  for (let i = 1; i < values.length; i++) {
    const prevLevel = level;
    level = alpha * values[i] + (1 - alpha) * (prevLevel + trend);
    trend = beta * (level - prevLevel) + (1 - beta) * trend;
  }

  return { level, trend };
}

function formatShortDateLabel(isoDate: string): string {
  const parsed = new Date(`${isoDate}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return isoDate;
  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: '2-digit',
    timeZone: 'UTC',
  });
}

/**
 * Generates a 7-day demand forecast for flush volume and water consumption
 * using Holt's double exponential smoothing.
 */
export function forecastDailySeries(params: {
  historicalDaily: HistoricalDailyPoint[];
  horizonDays?: number;
  nowMs?: number;
}): {
  next7DaysFlushes: number;
  next7DaysWaterLiters: number;
  dailyFlushTrendSlope: number;
  series: DailyForecastPoint[];
} {
  const horizon = Math.max(1, Math.min(30, Math.round(params.horizonDays ?? 7)));
  const sorted = [...params.historicalDaily].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  const nowMs =
    typeof params.nowMs === 'number' && Number.isFinite(params.nowMs)
      ? params.nowMs
      : Date.now();

  const lastDateMs =
    sorted.length > 0
      ? Date.parse(`${sorted[sorted.length - 1].date}T00:00:00.000Z`)
      : nowMs;
  const anchorMs = Number.isFinite(lastDateMs) ? lastDateMs : nowMs;

  const hasNonZeroActivity = sorted.some(
    (d) => d.flushCount > 0 || d.waterLiters > 0,
  );
  const flushValues = hasNonZeroActivity
    ? sorted.map((d) => Math.max(0, d.flushCount))
    : [12, 14, 13];
  const waterValues = hasNonZeroActivity
    ? sorted.map((d) => Math.max(0, d.waterLiters))
    : [18.0, 21.0, 19.5];

  const flushModel = holtForecast(flushValues);
  const waterModel = holtForecast(waterValues);

  const series: DailyForecastPoint[] = [];
  let next7DaysFlushes = 0;
  let next7DaysWaterLiters = 0;

  for (let h = 1; h <= horizon; h++) {
    const targetIso = new Date(anchorMs + h * MS_PER_DAY)
      .toISOString()
      .slice(0, 10);
    // Dampen extreme trend slopes slightly over the horizon so 7-day totals stay realistic
    const dampedStep = h * (1 - 0.04 * (h - 1));
    const predFlushes = Math.max(
      0,
      Math.round(flushModel.level + dampedStep * flushModel.trend),
    );
    const predWater = Math.max(
      0,
      roundTo(waterModel.level + dampedStep * waterModel.trend, 1),
    );

    next7DaysFlushes += predFlushes;
    next7DaysWaterLiters += predWater;

    series.push({
      date: targetIso,
      label: formatShortDateLabel(targetIso),
      predictedFlushes: predFlushes,
      predictedWaterLiters: predWater,
    });
  }

  return {
    next7DaysFlushes,
    next7DaysWaterLiters: roundTo(next7DaysWaterLiters, 1),
    dailyFlushTrendSlope: roundTo(flushModel.trend, 2),
    series,
  };
}

function buildRoomAliasLookup(): Map<string, string> {
  const lookup = new Map<string, string>();
  lookup.set('TOILET-01', 'SDCA-FL1-CANTEEN-M');
  lookup.set('FSHQVY5ERCTVCRECNBNS', 'SDCA-FL1-CANTEEN-M');
  lookup.set(DEFAULT_DEVICE_ID.toUpperCase(), 'SDCA-FL1-CANTEEN-M');

  for (const room of SDCA_RESTROOM_ROOMS) {
    lookup.set(room.id.toUpperCase(), room.id);
    if (room.aliases) {
      for (const alias of room.aliases) {
        lookup.set(alias.toUpperCase(), room.id);
      }
    }
  }
  return lookup;
}

const ROOM_ALIAS_LOOKUP = buildRoomAliasLookup();

export function resolveRoomIdFromDeviceId(deviceId: string): string | null {
  const trimmed = deviceId.trim();
  if (!trimmed) return null;

  const directStall = getStallById(trimmed);
  if (directStall) return directStall.roomId;

  const upper = trimmed.toUpperCase();
  const directRoom = ROOM_ALIAS_LOOKUP.get(upper);
  if (directRoom) return directRoom;

  const withoutStallSuffix = upper.replace(/-S\d{1,2}$/, '');
  const prefixMatch = ROOM_ALIAS_LOOKUP.get(withoutStallSuffix);
  if (prefixMatch) return prefixMatch;

  return null;
}

/**
 * Computes Mean Time Between Issues (MTBI) and normalized Risk Scores (0-100)
 * across all 22 SDCA Annex restroom rooms from tasks and public issue reports.
 */
export function computeCampusRestroomRiskScores(params: {
  incidents: CampusIncidentRecord[];
  nowMs?: number;
}): RestroomRiskScore[] {
  const nowMs =
    typeof params.nowMs === 'number' && Number.isFinite(params.nowMs)
      ? params.nowMs
      : Date.now();
  const sevenDaysAgoMs = nowMs - 7 * MS_PER_DAY;

  const byRoom = new Map<string, number[]>();
  for (const incident of params.incidents) {
    if (!Number.isFinite(incident.timestampMs) || incident.timestampMs <= 0) {
      continue;
    }
    const roomId = resolveRoomIdFromDeviceId(incident.deviceId);
    if (!roomId) continue;
    const list = byRoom.get(roomId) ?? [];
    list.push(incident.timestampMs);
    byRoom.set(roomId, list);
  }

  const results: RestroomRiskScore[] = SDCA_RESTROOM_ROOMS.map((room) => {
    const timestamps = (byRoom.get(room.id) ?? []).sort((a, b) => a - b);
    const totalIncidents = timestamps.length;
    const recent7dIncidents = timestamps.filter(
      (t) => t >= sevenDaysAgoMs,
    ).length;

    let mtbiHours: number | null = null;
    if (timestamps.length >= 2) {
      const spanHours =
        (timestamps[timestamps.length - 1] - timestamps[0]) / MS_PER_HOUR;
      mtbiHours = roundTo(spanHours / (timestamps.length - 1), 1);
    }

    const hoursSinceLastIncident =
      timestamps.length >= 1
        ? Math.max(
            0,
            roundTo(
              (nowMs - timestamps[timestamps.length - 1]) / MS_PER_HOUR,
              1,
            ),
          )
        : null;

    const volumePoints = Math.min(40, totalIncidents * 8);
    const velocityPoints = Math.min(35, recent7dIncidents * 12);
    let mtbiPressure = 0;
    if (
      mtbiHours !== null &&
      mtbiHours > 0 &&
      hoursSinceLastIncident !== null
    ) {
      mtbiPressure = Math.min(
        25,
        roundTo((hoursSinceLastIncident / mtbiHours) * 20, 1),
      );
    } else {
      mtbiPressure = Math.min(15, roundTo(room.stallCount * 1.5, 1));
    }

    const riskScore = Math.min(
      100,
      Math.max(0, Math.round(volumePoints + velocityPoints + mtbiPressure)),
    );

    const riskLevel: RestroomRiskScore['riskLevel'] =
      riskScore >= 75
        ? 'critical'
        : riskScore >= 50
          ? 'high'
          : riskScore >= 25
            ? 'moderate'
            : 'low';

    const predictedNextIssueWindow =
      riskLevel === 'critical'
        ? 'Within 24 hrs'
        : riskLevel === 'high'
          ? '2-3 days'
          : riskLevel === 'moderate'
            ? '4-7 days'
            : 'Routine (7+ days)';

    const mtbiTag = mtbiHours !== null ? `, MTBI ${mtbiHours}h` : '';
    const recommendedTaskMessage = `[PREDICTIVE] Proactive inspection for ${room.roomName} (${room.floor}): Risk Score ${riskScore}/100${mtbiTag}. Inspect stalls, flush valves, and sanitation status before next peak window.`;

    return {
      roomId: room.id,
      roomName: room.roomName,
      floor: room.floor,
      gender: room.gender,
      stallCount: room.stallCount,
      totalIncidents,
      recent7dIncidents,
      mtbiHours,
      hoursSinceLastIncident,
      riskScore,
      riskLevel,
      predictedNextIssueWindow,
      recommendedTaskMessage,
    };
  });

  return results.sort((a, b) => {
    if (b.riskScore !== a.riskScore) return b.riskScore - a.riskScore;
    if (b.totalIncidents !== a.totalIncidents) {
      return b.totalIncidents - a.totalIncidents;
    }
    return b.stallCount - a.stallCount;
  });
}

/**
 * Orchestrates component RUL, drift detection, 7-day demand forecasting, and campus MTBI risk
 * into one unified PredictiveMaintenanceSummary object.
 */
export function buildPredictiveMaintenanceSummary(input: {
  deviceId: string;
  rawCounters: Record<string, unknown> | null | undefined;
  windowDays: number;
  observedWindowTotals?: {
    flushes?: number;
    waterLiters?: number;
    uvSeconds?: number;
    lidCycles?: number;
  };
  flushSamples: FlushSample[];
  ultrasonicSamples: UltrasonicSample[];
  historicalDaily: HistoricalDailyPoint[];
  incidents: CampusIncidentRecord[];
  nowMs?: number;
}): PredictiveMaintenanceSummary {
  const nowMs =
    typeof input.nowMs === 'number' && Number.isFinite(input.nowMs)
      ? input.nowMs
      : Date.now();
  const counters = normalizeWearCounters(input.rawCounters);

  const componentRul = computeComponentRulPredictions({
    counters,
    windowDays: input.windowDays,
    observedWindowTotals: input.observedWindowTotals,
    nowMs,
  });

  const driftIndicators = detectTelemetryDrift({
    flushSamples: input.flushSamples,
    ultrasonicSamples: input.ultrasonicSamples,
    ultrasonicConsecutiveFailures: counters.ultrasonicConsecutiveFailures,
  });

  const forecasts = forecastDailySeries({
    historicalDaily: input.historicalDaily,
    horizonDays: 7,
    nowMs,
  });

  const campusRisk = computeCampusRestroomRiskScores({
    incidents: input.incidents,
    nowMs,
  });

  const avgWear =
    componentRul.length > 0
      ? componentRul.reduce((sum, item) => sum + item.wearPercent, 0) /
        componentRul.length
      : 0;
  const driftPenalty = driftIndicators.reduce((penalty, indicator) => {
    if (indicator.status === 'critical') return penalty + 18;
    if (indicator.status === 'warning') return penalty + 10;
    if (indicator.status === 'watch') return penalty + 4;
    return penalty;
  }, 0);
  const overallHealthIndex = Math.max(
    0,
    Math.min(100, Math.round(100 - avgWear * 0.7 - driftPenalty)),
  );

  const sortedByShortestRul = [...componentRul].sort(
    (a, b) => a.estimatedDaysRemaining - b.estimatedDaysRemaining,
  );
  const shortest = sortedByShortestRul[0] ?? null;

  return {
    deviceId: input.deviceId || DEFAULT_DEVICE_ID,
    generatedAt: new Date(nowMs).toISOString(),
    overallHealthIndex,
    shortestRulComponent: shortest
      ? {
          label: shortest.label,
          estimatedDaysRemaining: shortest.estimatedDaysRemaining,
          predictedServiceDate: shortest.predictedServiceDate,
          wearPercent: shortest.wearPercent,
        }
      : null,
    componentRul,
    driftIndicators,
    forecasts,
    campusRisk,
  };
}
