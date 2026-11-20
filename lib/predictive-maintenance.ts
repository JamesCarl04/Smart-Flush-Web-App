import { DEFAULT_DEVICE_ID } from '@/lib/device-constants';
import { getStallById, SDCA_RESTROOM_ROOMS } from '@/lib/restrooms';
import type {
  ComponentRulPrediction,
  DailyForecastPoint,
  LinearRegressionStats,
  PredictiveHealthStatus,
  PredictiveMaintenanceSummary,
  RestroomRiskScore,
  SensorDriftIndicator,
  UsageForecastInterpretation,
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
  const rounded = Math.round(value * factor) / factor;
  return rounded === 0 ? 0 : rounded;
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
  daysRemaining: number | null,
): PredictiveHealthStatus {
  if (wearPercent >= 90 || (daysRemaining !== null && daysRemaining <= 7)) {
    return 'critical';
  }
  if (wearPercent >= 70 || (daysRemaining !== null && daysRemaining <= 21)) {
    return 'warning';
  }
  if (wearPercent >= 45 || (daysRemaining !== null && daysRemaining <= 45)) {
    return 'watch';
  }
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
  actionPrefix: string;
}

function componentRecommendation(
  status: PredictiveHealthStatus,
  actionPrefix: string,
  daysRemaining: number | null,
  currentValue: number,
  unit: string,
): string {
  const lowerFirst =
    actionPrefix.charAt(0).toLowerCase() + actionPrefix.slice(1);
  const activityLabel = unit === 'L' ? 'water usage' : 'flush cycles';
  if (status === 'critical') {
    return daysRemaining !== null
      ? `${actionPrefix} immediately (about ${daysRemaining} days of life left).`
      : `${actionPrefix} immediately (rated usage limit nearly reached).`;
  }
  if (status === 'warning') {
    return daysRemaining !== null
      ? `Schedule maintenance to ${lowerFirst} within ${daysRemaining} days.`
      : `Schedule maintenance to ${lowerFirst} soon (high cumulative wear).`;
  }
  if (status === 'watch') {
    return daysRemaining !== null
      ? `Routine check recommended in about ${daysRemaining} days.`
      : `Routine check recommended based on cumulative wear.`;
  }
  if (currentValue <= 0) {
    return `No ${activityLabel} recorded yet; service estimate will calculate once usage is observed.`;
  }
  if (daysRemaining === null) {
    return `No recent ${activityLabel} in this window; service estimate will update when activity resumes.`;
  }
  return `Usage within rated limit (about ${daysRemaining} days until service).`;
}

/**
 * Computes estimated equipment lifespan (RUL), daily use rate, and predicted service dates
 * for sensor-backed hardware components on the prototype unit:
 * - Water Flow Meter (YF-S201) tracked by cumulative water volume (L)
 * - Water Flush Pump tracked by cumulative flush actuation cycles (flushes)
 * Open-loop actuators without return sensors (UV-C lamp, lid servo, relay) are intentionally excluded.
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
  const obsLiters = nonNegativeFinite(obs.waterLiters);
  const obsFlushes = nonNegativeFinite(obs.flushes);
  const effectiveFlowLiters =
    params.counters.flowSensorTotalLiters > 0
      ? params.counters.flowSensorTotalLiters
      : obsLiters;
  const effectiveFlushCycles =
    params.counters.flushCycleCount > 0
      ? params.counters.flushCycleCount
      : obsFlushes;

  const specs: RulSpec[] = [
    {
      key: 'flowSensorTotalLiters',
      label: 'Water Flow Meter',
      partNumber: 'YF-S201 Flow Sensor',
      unit: 'L',
      currentValue: roundTo(effectiveFlowLiters, 1),
      ratedLimit: 500,
      observedBurnPerDay: obsLiters / safeWindowDays,
      actionPrefix: 'Clean and check water flow meter',
    },
    {
      key: 'flushCycleCount',
      label: 'Water Flush Pump',
      partNumber: 'Submersible Flush Pump',
      unit: 'flushes',
      currentValue: Math.round(effectiveFlushCycles),
      ratedLimit: 1000,
      observedBurnPerDay: obsFlushes / safeWindowDays,
      actionPrefix: 'Clean pump filter and check seals',
    },
  ];

  return specs.map((spec) => {
    const wearPercent = Math.min(
      100,
      Math.max(0, roundTo((spec.currentValue / spec.ratedLimit) * 100, 1)),
    );
    const hasObservedBurn = spec.observedBurnPerDay > 0;
    const dailyBurnRate = hasObservedBurn
      ? Math.max(0.01, roundTo(spec.observedBurnPerDay, 2))
      : 0;
    const remainingCapacity = Math.max(0, spec.ratedLimit - spec.currentValue);
    const estimatedDaysRemaining = hasObservedBurn
      ? Math.max(
          0,
          Math.min(365, Math.round(remainingCapacity / dailyBurnRate)),
        )
      : null;
    const predictedServiceDate =
      estimatedDaysRemaining !== null
        ? new Date(nowMs + estimatedDaysRemaining * MS_PER_DAY)
            .toISOString()
            .slice(0, 10)
        : null;
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
      hasTelemetry: spec.currentValue > 0,
      recommendation: componentRecommendation(
        status,
        spec.actionPrefix,
        estimatedDaysRemaining,
        spec.currentValue,
        spec.unit,
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

  const hasPumpData = flowRates.length > 0;
  let pumpBaseline = 0;
  let pumpRecent = 0;
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
  } else if (hasPumpData) {
    const avg = flowRates.reduce((sum, val) => sum + val, 0) / flowRates.length;
    pumpBaseline = avg;
    pumpRecent = avg;
    pumpSlope = computeLinearSlope(flowRates);
  }

  const pumpDriftPct =
    hasPumpData && pumpBaseline > 0
      ? roundTo(((pumpRecent - pumpBaseline) / pumpBaseline) * 100, 1)
      : 0;

  let pumpStatus: PredictiveHealthStatus = 'healthy';
  if (hasPumpData) {
    if (pumpRecent < 0.12 || pumpDriftPct <= -30) {
      pumpStatus = 'critical';
    } else if (pumpRecent < 0.16 || pumpDriftPct <= -15) {
      pumpStatus = 'warning';
    } else if (pumpDriftPct <= -8) {
      pumpStatus = 'watch';
    }
  }

  const pumpSummary = !hasPumpData
    ? 'No timed flush samples recorded in this window yet; flow efficiency will calculate once flush telemetry arrives.'
    : pumpStatus === 'healthy'
      ? `Water flow speed is steady (${roundTo(pumpRecent, 2)} L/s vs ${roundTo(pumpBaseline, 2)} L/s baseline across ${flowRates.length} ${flowRates.length === 1 ? 'flush' : 'flushes'}).`
      : `Water flow is slowing down (${pumpDriftPct}% change from baseline). Clean the pump filter before a low-water problem occurs.`;

  const orderedUltrasonic = [...params.ultrasonicSamples].sort(
    (a, b) => (a.timestampMs ?? 0) - (b.timestampMs ?? 0),
  );
  const consecutiveFails = nonNegativeFinite(
    params.ultrasonicConsecutiveFailures,
  );
  const totalEchoSamples = orderedUltrasonic.length;
  const hasUltrasonicData = totalEchoSamples > 0 || consecutiveFails > 0;
  const timeoutCount = orderedUltrasonic.filter(
    (r) => !Number.isFinite(r.value) || r.value < 0 || r.value > 400,
  ).length;
  const timeoutRatePct =
    totalEchoSamples > 0 ? (timeoutCount / totalEchoSamples) * 100 : 0;
  const baselineStability = hasUltrasonicData ? 99.0 : 0;
  const recentStability = !hasUltrasonicData
    ? 0
    : totalEchoSamples > 0
      ? Math.max(0, Math.min(100, roundTo(100 - timeoutRatePct, 1)))
      : Math.max(0, roundTo(100 - consecutiveFails * 3, 1));
  const ultrasonicDriftPct = hasUltrasonicData
    ? roundTo(recentStability - baselineStability, 1)
    : 0;
  const stabilitySeries = orderedUltrasonic.map((r) =>
    r.value < 0 || r.value > 400 ? 0 : 100,
  );
  const ultrasonicSlope = computeLinearSlope(stabilitySeries);

  let ultrasonicStatus: PredictiveHealthStatus = 'healthy';
  if (hasUltrasonicData) {
    if (consecutiveFails >= 8 || recentStability < 80) {
      ultrasonicStatus = 'critical';
    } else if (consecutiveFails >= 5 || recentStability < 90) {
      ultrasonicStatus = 'warning';
    } else if (consecutiveFails >= 2 || recentStability < 96) {
      ultrasonicStatus = 'watch';
    }
  }

  const ultrasonicSummary = !hasUltrasonicData
    ? 'No ultrasonic sensor readings recorded in this window yet; accuracy will calculate once echo telemetry arrives.'
    : ultrasonicStatus === 'healthy'
      ? `User sensor is reading reliably (${recentStability}% accuracy across ${totalEchoSamples} readings, ${consecutiveFails}/10 missed in a row).`
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
      hasData: hasPumpData,
      sampleCount: flowRates.length,
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
      hasData: hasUltrasonicData,
      sampleCount: totalEchoSamples,
    },
  ];
}

export interface LinearRegressionFit {
  slope: number;
  intercept: number;
  rSquared: number | null;
  correlationR: number | null;
  rmse: number;
  sampleSize: number;
}

/**
 * Fits an Ordinary Least Squares (OLS) simple linear regression model
 * ŷ = m·x + b over sequential 1-based day indices x = 1..n.
 */
export function fitLinearRegression(values: number[]): LinearRegressionFit {
  const n = values.length;
  if (n === 0) {
    return {
      slope: 0,
      intercept: 0,
      rSquared: null,
      correlationR: null,
      rmse: 0,
      sampleSize: 0,
    };
  }
  if (n === 1) {
    return {
      slope: 0,
      intercept: values[0],
      rSquared: null,
      correlationR: null,
      rmse: 0,
      sampleSize: 1,
    };
  }

  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < n; i++) {
    sumX += i + 1;
    sumY += values[i];
  }
  const meanX = sumX / n;
  const meanY = sumY / n;

  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    const dx = i + 1 - meanX;
    const dy = values[i] - meanY;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }

  const slope = sxx > 0 ? sxy / sxx : 0;
  const intercept = meanY - slope * meanX;

  let sse = 0;
  for (let i = 0; i < n; i++) {
    const predicted = slope * (i + 1) + intercept;
    const residual = values[i] - predicted;
    sse += residual * residual;
  }
  const rmse = Math.sqrt(sse / n);

  // R² requires at least 3 points (df = n - 2 >= 1) and non-zero target variance
  let rSquared: number | null = null;
  let correlationR: number | null = null;
  if (n >= 3 && syy > 0 && sxx > 0) {
    const rawR2 = 1 - sse / syy;
    rSquared = Math.max(0, Math.min(1, rawR2));
    const rawR = sxy / Math.sqrt(sxx * syy);
    correlationR = Math.max(-1, Math.min(1, rawR));
  }

  return {
    slope,
    intercept,
    rSquared,
    correlationR,
    rmse,
    sampleSize: n,
  };
}

function formatRegressionEquation(
  slope: number,
  intercept: number,
  unitSuffix = '',
): string {
  const m = roundTo(slope, 2);
  const b = roundTo(intercept, 2);
  const sign = b >= 0 ? '+' : '-';
  const suffix = unitSuffix ? ` ${unitSuffix}` : '';
  return `ŷ = ${m.toFixed(2)}x ${sign} ${Math.abs(b).toFixed(2)}${suffix}`;
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
 * using Ordinary Least Squares (OLS) simple linear regression (ŷ = m·x + b).
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
  interpretation: UsageForecastInterpretation;
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

  const activeDaysObserved = sorted.filter(
    (d) => d.flushCount > 0 || d.waterLiters > 0,
  ).length;
  const hasNonZeroActivity = activeDaysObserved > 0;
  const flushValues = hasNonZeroActivity
    ? sorted.map((d) => Math.max(0, d.flushCount))
    : [12, 14, 13];
  const waterValues = hasNonZeroActivity
    ? sorted.map((d) => Math.max(0, d.waterLiters))
    : [18.0, 21.0, 19.5];

  const flushModel = fitLinearRegression(flushValues);
  const waterModel = fitLinearRegression(waterValues);

  const series: DailyForecastPoint[] = [];
  let next7DaysFlushes = 0;
  let next7DaysWaterLiters = 0;
  const baseN = flushValues.length;

  for (let h = 1; h <= horizon; h++) {
    const targetIso = new Date(anchorMs + h * MS_PER_DAY)
      .toISOString()
      .slice(0, 10);
    const futureX = baseN + h;
    const predFlushes = Math.max(
      0,
      Math.round(flushModel.slope * futureX + flushModel.intercept),
    );
    const predWater = Math.max(
      0,
      roundTo(waterModel.slope * futureX + waterModel.intercept, 1),
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

  const roundedWater = roundTo(next7DaysWaterLiters, 1);
  const slope = roundTo(flushModel.slope, 2);
  const intercept = roundTo(flushModel.intercept, 2);
  const waterSlope = roundTo(waterModel.slope, 2);
  const waterIntercept = roundTo(waterModel.intercept, 2);
  const usedBaselineFallback = !hasNonZeroActivity;

  const rSquared = usedBaselineFallback
    ? null
    : flushModel.rSquared !== null
      ? roundTo(flushModel.rSquared, 3)
      : null;
  const waterRSquared = usedBaselineFallback
    ? null
    : waterModel.rSquared !== null
      ? roundTo(waterModel.rSquared, 3)
      : null;
  const correlationR = usedBaselineFallback
    ? null
    : flushModel.correlationR !== null
      ? roundTo(flushModel.correlationR, 3)
      : null;
  const rmse = usedBaselineFallback ? 0 : roundTo(flushModel.rmse, 2);

  const fitQuality: LinearRegressionStats['fitQuality'] = usedBaselineFallback
    ? 'insufficient'
    : flushModel.sampleSize < 3
      ? 'insufficient'
      : rSquared === null
        ? 'constant'
        : rSquared >= 0.7
          ? 'strong'
          : rSquared >= 0.4
            ? 'moderate'
            : 'weak';

  const fitLabel = usedBaselineFallback
    ? 'Default baseline'
    : fitQuality === 'insufficient'
      ? 'Needs more days'
      : fitQuality === 'constant'
        ? 'Steady baseline'
        : fitQuality === 'strong'
          ? 'Strong fit'
          : fitQuality === 'moderate'
            ? 'Moderate fit'
            : 'Low fit';

  const regression: LinearRegressionStats = {
    slope,
    intercept,
    waterSlope,
    waterIntercept,
    rSquared,
    waterRSquared,
    correlationR,
    rmse,
    sampleSize: usedBaselineFallback ? 0 : flushModel.sampleSize,
    equation: formatRegressionEquation(slope, intercept),
    waterEquation: formatRegressionEquation(waterSlope, waterIntercept, 'L'),
    fitQuality,
    fitLabel,
  };

  let peakDay: DailyForecastPoint | null = null;
  let lowDay: DailyForecastPoint | null = null;
  for (const pt of series) {
    if (!peakDay || pt.predictedFlushes > peakDay.predictedFlushes) {
      peakDay = pt;
    }
    if (!lowDay || pt.predictedFlushes < lowDay.predictedFlushes) {
      lowDay = pt;
    }
  }

  const avgDailyFlushes = roundTo(next7DaysFlushes / horizon, 1);
  const avgDailyWaterLiters = roundTo(roundedWater / horizon, 1);
  const avgLitersPerFlush =
    next7DaysFlushes > 0 ? roundTo(roundedWater / next7DaysFlushes, 2) : 0;

  const standardToiletBaselineLiters = next7DaysFlushes * 6.0;
  const estimatedWaterSavedLiters = roundTo(
    standardToiletBaselineLiters - roundedWater,
    1,
  );
  const estimatedSavingsPercent =
    standardToiletBaselineLiters > 0
      ? roundTo(
          (estimatedWaterSavedLiters / standardToiletBaselineLiters) * 100,
          1,
        )
      : 0;

  const trendDirection: UsageForecastInterpretation['trendDirection'] =
    slope >= 0.5 ? 'increasing' : slope <= -0.5 ? 'decreasing' : 'stable';
  const trendLabel =
    trendDirection === 'increasing'
      ? 'Usage Rising'
      : trendDirection === 'decreasing'
        ? 'Usage Slowing'
        : 'Usage Steady';

  const confidenceLevel: UsageForecastInterpretation['confidenceLevel'] =
    usedBaselineFallback
      ? 'baseline'
      : activeDaysObserved < 3 || flushModel.sampleSize < 3
        ? 'low'
        : fitQuality === 'weak'
          ? 'low'
          : activeDaysObserved >= 6 &&
              (fitQuality === 'strong' || fitQuality === 'constant')
            ? 'high'
            : 'moderate';

  const confidenceLabel =
    confidenceLevel === 'baseline'
      ? 'Starting Estimate (No recent logs)'
      : confidenceLevel === 'low'
        ? activeDaysObserved >= 3 && fitQuality === 'weak'
          ? 'Rough Estimate (Daily usage varies)'
          : 'Early Estimate (Needs more days)'
        : confidenceLevel === 'moderate'
          ? 'Good Estimate'
          : 'High Confidence';

  const firstDay = series[0] ?? null;
  const trendNarrative = usedBaselineFallback
    ? `No recent flush records were found yet, so this ${horizon}-day forecast uses a starting baseline of about ${avgDailyFlushes.toFixed(1)} flushes/day until live usage builds up.`
    : trendDirection === 'increasing' && firstDay && peakDay
      ? `Restroom use is expected to grow by about +${slope.toFixed(1)} flushes each day — rising from ${firstDay.predictedFlushes} flushes on ${firstDay.label} to a busiest day of ${peakDay.predictedFlushes} flushes on ${peakDay.label}.`
      : trendDirection === 'decreasing' && firstDay && lowDay
        ? `Restroom use is expected to ease by ${slope.toFixed(1)} flushes each day — dropping from ${firstDay.predictedFlushes} flushes on ${firstDay.label} down to ${lowDay.predictedFlushes} flushes on ${lowDay.label}.`
        : lowDay && peakDay
          ? `Restroom use is expected to stay steady around ${avgDailyFlushes.toFixed(1)} flushes/day (ranging between ${lowDay.predictedFlushes} and ${peakDay.predictedFlushes} flushes a day).`
          : `Restroom use is expected to average about ${avgDailyFlushes.toFixed(1)} flushes/day over the next ${horizon} days.`;

  const waterNarrative =
    next7DaysFlushes === 0
      ? 'Expected water use is 0.0 L since no flushes were logged in this period.'
      : avgLitersPerFlush > 6.0
        ? `Expected water use is ${roundedWater.toFixed(1)} L (~${avgLitersPerFlush.toFixed(2)} L per flush), which is ${Math.abs(estimatedWaterSavedLiters).toFixed(1)} L above standard 6.0 L toilets — check flush timer and water flow settings.`
        : `Expected water use is ${roundedWater.toFixed(1)} L (~${avgLitersPerFlush.toFixed(2)} L per flush), saving about ${estimatedWaterSavedLiters.toFixed(1)} L (${estimatedSavingsPercent.toFixed(1)}%) compared to standard 6.0 L toilets.`;

  const actionRecommendation = usedBaselineFallback
    ? 'Keep the unit running for a few operating days so the forecast can learn real restroom traffic.'
    : avgLitersPerFlush > 6.0 && peakDay
      ? `Check pump flush duration and flow sensor calibration before ${peakDay.label} to avoid extra water use.`
      : activeDaysObserved < 3 && peakDay
        ? `Only ${activeDaysObserved} active ${activeDaysObserved === 1 ? 'day has' : 'days have'} been logged so far, so this estimate is still early. Keep supplies stocked before ${peakDay.label} while more daily data is collected.`
        : fitQuality === 'weak' && peakDay
          ? `Daily restroom traffic has been uneven lately, so actual counts may vary. Check supplies ahead of ${peakDay.label} and review again once more days are logged.`
          : trendDirection === 'increasing' && peakDay
            ? `Restock supplies and do a quick check before ${peakDay.label}, which is expected to be the busiest day (${peakDay.predictedFlushes} flushes).`
            : trendDirection === 'decreasing'
              ? 'Lighter restroom traffic is expected — a good window for routine cleaning, wiping sensors, and checking valves.'
              : 'Steady usage is expected — keep up regular daily cleaning and routine checks.';

  const basisPart = usedBaselineFallback
    ? 'Using default baseline'
    : `Based on ${flushModel.sampleSize} ${flushModel.sampleSize === 1 ? 'day' : 'days'} (${activeDaysObserved} with activity)`;

  const interpretation: UsageForecastInterpretation = {
    trendDirection,
    trendLabel,
    avgDailyFlushes,
    avgDailyWaterLiters,
    avgLitersPerFlush,
    estimatedWaterSavedLiters,
    estimatedSavingsPercent,
    peakDay,
    lowDay,
    activeDaysObserved,
    totalDaysObserved: sorted.length,
    usedBaselineFallback,
    confidenceLevel,
    confidenceLabel,
    modelSummary: `Linear Regression · ${basisPart}`,
    trendNarrative,
    waterNarrative,
    actionRecommendation,
    regression,
  };

  return {
    next7DaysFlushes,
    next7DaysWaterLiters: roundedWater,
    dailyFlushTrendSlope: slope,
    series,
    interpretation,
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
    if (indicator.hasData === false) return penalty;
    if (indicator.status === 'critical') return penalty + 18;
    if (indicator.status === 'warning') return penalty + 10;
    if (indicator.status === 'watch') return penalty + 4;
    return penalty;
  }, 0);
  const overallHealthIndex = Math.max(
    0,
    Math.min(100, Math.round(100 - avgWear * 0.7 - driftPenalty)),
  );

  const sortedByShortestRul = componentRul
    .filter(
      (c): c is ComponentRulPrediction & { estimatedDaysRemaining: number } =>
        c.estimatedDaysRemaining !== null,
    )
    .sort((a, b) => a.estimatedDaysRemaining - b.estimatedDaysRemaining);
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
