jest.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: jest.fn(),
  },
}));

import {
  buildPredictiveMaintenanceSummary,
  computeCampusRestroomRiskScores,
  computeComponentRulPredictions,
  detectTelemetryDrift,
  fitLinearRegression,
  forecastDailySeries,
  normalizeWearCounters,
  resolveRoomIdFromDeviceId,
} from '@/lib/predictive-maintenance';
import { SDCA_RESTROOM_ROOMS } from '@/lib/restrooms';
import { selectAvailableTechnicianAlphabetically } from '@/lib/task-assignment';

describe('Predictive Maintenance Statistical Engine', () => {
  const FIXED_NOW_MS = Date.parse('2026-11-15T12:00:00.000Z');

  describe('normalizeWearCounters', () => {
    it('defaults missing, negative, or invalid fields to zero safely', () => {
      const normalized = normalizeWearCounters({
        uvOnTimeSeconds: -120,
        lidCycleCount: '2500',
        flowSensorTotalLiters: Number.NaN,
        pumpTotalLiters: 180.5,
      });

      expect(normalized).toEqual({
        uvOnTimeSeconds: 0,
        lidCycleCount: 2500,
        flowSensorTotalLiters: 0,
        pumpTotalLiters: 180.5,
        relayTotalTriggers: 0,
        ultrasonicConsecutiveFailures: 0,
        flushCycleCount: 0,
      });
    });

    it('handles null or undefined counter documents', () => {
      expect(normalizeWearCounters(null).uvOnTimeSeconds).toBe(0);
      expect(normalizeWearCounters(undefined).pumpTotalLiters).toBe(0);
    });
  });

  describe('computeComponentRulPredictions', () => {
    it('computes accurate wear percentages, burn rates, service dates, and statuses for sensor-backed parts', () => {
      const predictions = computeComponentRulPredictions({
        counters: {
          uvOnTimeSeconds: 972_000,
          lidCycleCount: 7_500,
          flowSensorTotalLiters: 450, // 450 / 500 L -> 90% -> critical
          pumpTotalLiters: 100, // 20% wear, 30 L/day -> 13d -> warning
          relayTotalTriggers: 4_000,
          ultrasonicConsecutiveFailures: 1,
          flushCycleCount: 850,
        },
        windowDays: 10,
        observedWindowTotals: {
          flushes: 200,
          waterLiters: 300, // 30 L/day
          uvSeconds: 36_000,
          lidCycles: 250,
        },
        nowMs: FIXED_NOW_MS,
      });

      expect(predictions).toHaveLength(2);

      const flow = predictions.find((c) => c.key === 'flowSensorTotalLiters');
      expect(flow?.currentValue).toBe(450);
      expect(flow?.ratedLimit).toBe(500);
      expect(flow?.unit).toBe('L');
      expect(flow?.wearPercent).toBe(90);
      expect(flow?.dailyBurnRate).toBe(30);
      expect(flow?.estimatedDaysRemaining).toBe(2);
      expect(flow?.predictedServiceDate).toBe('2026-11-17');
      expect(flow?.status).toBe('critical');
      expect(flow?.hasTelemetry).toBe(true);

      const pump = predictions.find((c) => c.key === 'flushCycleCount');
      expect(pump?.currentValue).toBe(850);
      expect(pump?.ratedLimit).toBe(1000);
      expect(pump?.unit).toBe('flushes');
      expect(pump?.wearPercent).toBe(85);
      expect(pump?.dailyBurnRate).toBe(20);
      expect(pump?.estimatedDaysRemaining).toBe(8);
      // 8 days <= 21d and 85% >= 70% triggers proactive warning
      expect(pump?.status).toBe('warning');
      expect(pump?.hasTelemetry).toBe(true);
    });

    it('prevents division by zero and uses fallback burn rates when window activity is zero', () => {
      const predictions = computeComponentRulPredictions({
        counters: normalizeWearCounters({}),
        windowDays: 0,
        nowMs: FIXED_NOW_MS,
      });

      expect(predictions).toHaveLength(2);
      const flow = predictions.find((c) => c.key === 'flowSensorTotalLiters');
      const pump = predictions.find((c) => c.key === 'flushCycleCount');
      for (const item of predictions) {
        expect(item.dailyBurnRate).toBeGreaterThan(0);
        expect(Number.isFinite(item.estimatedDaysRemaining)).toBe(true);
        expect(item.wearPercent).toBe(0);
        expect(item.status).toBe('healthy');
        expect(item.hasTelemetry).toBe(false);
      }
      expect(flow?.recommendation).toContain('No water usage recorded yet');
      expect(pump?.recommendation).toContain('No flush cycles recorded yet');
    });

    it('falls back to observedWindowTotals for liters (flow meter) and flushes (flush pump) when wear counters are zero/missing', () => {
      const predictions = computeComponentRulPredictions({
        counters: normalizeWearCounters(null),
        windowDays: 8,
        observedWindowTotals: {
          flushes: 14, // 1.75 flushes/day
          waterLiters: 76.08, // 9.51 L/day
        },
        nowMs: FIXED_NOW_MS,
      });

      expect(predictions).toHaveLength(2);
      const flow = predictions.find((c) => c.key === 'flowSensorTotalLiters');
      expect(flow?.currentValue).toBe(76.1);
      expect(flow?.wearPercent).toBe(15.2);
      expect(flow?.dailyBurnRate).toBe(9.51);
      expect(flow?.estimatedDaysRemaining).toBe(45);
      expect(flow?.recommendation).not.toContain('No water usage recorded yet');

      const pump = predictions.find((c) => c.key === 'flushCycleCount');
      expect(pump?.currentValue).toBe(14);
      expect(pump?.wearPercent).toBe(1.4);
      expect(pump?.dailyBurnRate).toBe(1.75);
      expect(pump?.estimatedDaysRemaining).toBe(365);
      expect(pump?.recommendation).not.toContain('No flush cycles recorded yet');
    });
  });

  describe('detectTelemetryDrift', () => {
    it('reports hasData: false without fabricating 0.25 L/s or 99.5% readings when telemetry is absent', () => {
      const indicators = detectTelemetryDrift({
        flushSamples: [],
        ultrasonicSamples: [],
        ultrasonicConsecutiveFailures: 0,
      });

      expect(indicators).toHaveLength(2);
      for (const item of indicators) {
        expect(item.hasData).toBe(false);
        expect(item.sampleCount).toBe(0);
        expect(item.baselineValue).toBe(0);
        expect(item.recentValue).toBe(0);
        expect(item.driftPercent).toBe(0);
        expect(item.status).toBe('healthy');
      }
    });
    it('flags early pump flow-rate degradation before reactive 0.80L/0.30L thresholds', () => {
      const flushSamples = [
        { waterVolume: 1.8, duration: 6, timestampMs: 1_000 },
        { waterVolume: 1.8, duration: 6, timestampMs: 2_000 },
        { waterVolume: 1.75, duration: 6, timestampMs: 3_000 },
        { waterVolume: 1.25, duration: 6, timestampMs: 4_000 },
        { waterVolume: 1.1, duration: 6, timestampMs: 5_000 },
        { waterVolume: 1.0, duration: 6, timestampMs: 6_000 },
      ];

      const indicators = detectTelemetryDrift({
        flushSamples,
        ultrasonicSamples: [
          { value: 65, timestampMs: 1_000 },
          { value: 62, timestampMs: 2_000 },
        ],
        ultrasonicConsecutiveFailures: 0,
      });

      const pump = indicators.find(
        (i) => i.sensorKey === 'pump_flow_efficiency',
      );
      expect(pump).toBeDefined();
      expect(pump!.baselineValue).toBeCloseTo(0.297, 2);
      expect(pump!.recentValue).toBeCloseTo(0.186, 2);
      expect(pump!.driftPercent).toBeLessThan(-25);
      expect(pump!.slopePerEvent).toBeLessThan(0);
      expect(pump!.status).toBe('critical');
    });

    it('detects ultrasonic echo-timeout drift before hitting 10 consecutive failures', () => {
      const indicators = detectTelemetryDrift({
        flushSamples: [],
        ultrasonicSamples: [
          { value: 50, timestampMs: 1_000 },
          { value: -1, timestampMs: 2_000 },
          { value: 55, timestampMs: 3_000 },
          { value: -1, timestampMs: 4_000 },
          { value: 48, timestampMs: 5_000 },
        ],
        ultrasonicConsecutiveFailures: 6,
      });

      const ultra = indicators.find(
        (i) => i.sensorKey === 'ultrasonic_echo_stability',
      );
      expect(ultra).toBeDefined();
      expect(ultra!.recentValue).toBe(60);
      expect(ultra!.status).toBe('critical');
    });
  });

  describe('fitLinearRegression & forecastDailySeries (OLS)', () => {
    it('computes exact OLS slope, intercept, R², Pearson r, and RMSE over 1-based day indices', () => {
      // x = [1, 2, 3, 4], y = [15, 18, 22, 25] -> m = 3.4, b = 11.5, R² = 289/290 ≈ 0.9966
      const fit = fitLinearRegression([15, 18, 22, 25]);

      expect(fit.sampleSize).toBe(4);
      expect(fit.slope).toBeCloseTo(3.4, 4);
      expect(fit.intercept).toBeCloseTo(11.5, 4);
      expect(fit.rSquared).toBeCloseTo(289 / 290, 4);
      expect(fit.correlationR).toBeCloseTo(17 / Math.sqrt(290), 4);
      expect(fit.rmse).toBeCloseTo(Math.sqrt(0.05), 4);
    });

    it('projects 7 non-negative forecast days following the OLS linear regression trend', () => {
      const forecast = forecastDailySeries({
        historicalDaily: [
          { date: '2026-11-10', flushCount: 15, waterLiters: 22.5 },
          { date: '2026-11-11', flushCount: 18, waterLiters: 27.0 },
          { date: '2026-11-12', flushCount: 22, waterLiters: 33.0 },
          { date: '2026-11-13', flushCount: 25, waterLiters: 37.5 },
        ],
        horizonDays: 7,
        nowMs: FIXED_NOW_MS,
      });

      expect(forecast.series).toHaveLength(7);
      expect(forecast.series[0].date).toBe('2026-11-14');
      expect(forecast.series[6].date).toBe('2026-11-20');
      expect(forecast.dailyFlushTrendSlope).toBeCloseTo(3.4, 2);
      // x = 5: 3.4*5 + 11.5 = 28.5 -> 29; x = 11: 3.4*11 + 11.5 = 48.9 -> 49
      expect(forecast.series[0].predictedFlushes).toBe(29);
      expect(forecast.series[6].predictedFlushes).toBe(49);
      expect(forecast.next7DaysFlushes).toBeGreaterThan(250);
      expect(forecast.next7DaysWaterLiters).toBeGreaterThan(380);

      expect(forecast.interpretation.trendDirection).toBe('increasing');
      expect(forecast.interpretation.trendLabel).toBe('Usage Rising');
      expect(forecast.interpretation.confidenceLevel).toBe('moderate');
      expect(forecast.interpretation.activeDaysObserved).toBe(4);
      expect(forecast.interpretation.usedBaselineFallback).toBe(false);
      expect(forecast.interpretation.avgLitersPerFlush).toBeCloseTo(1.5, 1);
      expect(forecast.interpretation.estimatedWaterSavedLiters).toBeGreaterThan(0);
      expect(forecast.interpretation.estimatedSavingsPercent).toBeGreaterThan(70);
      expect(forecast.interpretation.peakDay?.date).toBe('2026-11-20');
      expect(forecast.interpretation.modelSummary).toContain(
        'Linear Regression',
      );
      expect(forecast.interpretation.modelSummary).toContain(
        '4 days (4 with activity)',
      );
      expect(forecast.interpretation.regression).toBeDefined();
      expect(forecast.interpretation.regression?.equation).toBe(
        'ŷ = 3.40x + 11.50',
      );
      expect(forecast.interpretation.regression?.rSquared).toBeCloseTo(0.997, 3);
      expect(forecast.interpretation.regression?.fitQuality).toBe('strong');
      expect(forecast.interpretation.regression?.rmse).toBeCloseTo(0.22, 2);
      expect(forecast.interpretation.trendNarrative).toContain('+3.4 flushes');
      expect(forecast.interpretation.waterNarrative).toContain(
        'standard 6.0 L toilets',
      );
      expect(forecast.interpretation.actionRecommendation).toContain('Nov 20');
    });

    it('flags low confidence and omits R² when fewer than 3 days exist (df <= 0)', () => {
      const forecast = forecastDailySeries({
        historicalDaily: [
          { date: '2026-11-18', flushCount: 14, waterLiters: 66.5 },
          { date: '2026-11-19', flushCount: 21, waterLiters: 99.8 },
        ],
        horizonDays: 7,
        nowMs: FIXED_NOW_MS,
      });

      expect(forecast.interpretation.activeDaysObserved).toBe(2);
      expect(forecast.interpretation.confidenceLevel).toBe('low');
      expect(forecast.interpretation.confidenceLabel).toBe(
        'Early Estimate (Needs more days)',
      );
      expect(forecast.interpretation.regression?.rSquared).toBeNull();
      expect(forecast.interpretation.regression?.fitQuality).toBe('insufficient');
      expect(forecast.interpretation.actionRecommendation).toContain(
        'Only 2 active days',
      );
    });

    it('flags low confidence when daily variance yields a weak R² fit', () => {
      const forecast = forecastDailySeries({
        historicalDaily: [
          { date: '2026-11-10', flushCount: 5, waterLiters: 10 },
          { date: '2026-11-11', flushCount: 40, waterLiters: 80 },
          { date: '2026-11-12', flushCount: 8, waterLiters: 16 },
          { date: '2026-11-13', flushCount: 38, waterLiters: 76 },
          { date: '2026-11-14', flushCount: 6, waterLiters: 12 },
          { date: '2026-11-15', flushCount: 35, waterLiters: 70 },
        ],
        horizonDays: 7,
        nowMs: FIXED_NOW_MS,
      });

      expect(forecast.interpretation.regression?.rSquared).not.toBeNull();
      expect(forecast.interpretation.regression!.rSquared!).toBeLessThan(0.4);
      expect(forecast.interpretation.regression?.fitQuality).toBe('weak');
      expect(forecast.interpretation.confidenceLevel).toBe('low');
      expect(forecast.interpretation.confidenceLabel).toBe(
        'Rough Estimate (Daily usage varies)',
      );
      expect(forecast.interpretation.actionRecommendation).toContain(
        'uneven lately',
      );
    });

    it('warns on water overuse when projected consumption exceeds 6.0 L per flush', () => {
      const forecast = forecastDailySeries({
        historicalDaily: [
          { date: '2026-11-10', flushCount: 20, waterLiters: 150 },
          { date: '2026-11-11', flushCount: 20, waterLiters: 150 },
          { date: '2026-11-12', flushCount: 20, waterLiters: 150 },
          { date: '2026-11-13', flushCount: 20, waterLiters: 150 },
          { date: '2026-11-14', flushCount: 20, waterLiters: 150 },
          { date: '2026-11-15', flushCount: 20, waterLiters: 150 },
        ],
        horizonDays: 7,
        nowMs: FIXED_NOW_MS,
      });

      expect(forecast.interpretation.confidenceLevel).toBe('high');
      expect(forecast.interpretation.trendDirection).toBe('stable');
      expect(forecast.interpretation.regression?.fitQuality).toBe('constant');
      expect(forecast.interpretation.regression?.rSquared).toBeNull();
      expect(forecast.interpretation.regression?.rmse).toBe(0);
      expect(forecast.interpretation.avgLitersPerFlush).toBeGreaterThan(6.0);
      expect(forecast.interpretation.estimatedWaterSavedLiters).toBeLessThan(0);
      expect(forecast.interpretation.waterNarrative).toContain(
        'above standard 6.0 L toilets',
      );
      expect(forecast.interpretation.actionRecommendation).toContain(
        'flow sensor calibration',
      );
    });

    it('clamps declining OLS forecasts safely at zero and reports declining trend narrative', () => {
      const forecast = forecastDailySeries({
        historicalDaily: [
          { date: '2026-11-10', flushCount: 30, waterLiters: 45 },
          { date: '2026-11-11', flushCount: 26, waterLiters: 39 },
          { date: '2026-11-12', flushCount: 22, waterLiters: 33 },
          { date: '2026-11-13', flushCount: 18, waterLiters: 27 },
        ],
        horizonDays: 7,
        nowMs: FIXED_NOW_MS,
      });

      expect(forecast.dailyFlushTrendSlope).toBeCloseTo(-4.0, 2);
      expect(forecast.interpretation.regression?.equation).toBe(
        'ŷ = -4.00x + 34.00',
      );
      expect(forecast.interpretation.regression?.rSquared).toBe(1);
      expect(forecast.series.every((p) => p.predictedFlushes >= 0)).toBe(true);
      expect(forecast.series.every((p) => p.predictedWaterLiters >= 0)).toBe(true);
      expect(forecast.interpretation.trendDirection).toBe('decreasing');
      expect(forecast.interpretation.trendLabel).toBe('Usage Slowing');
      expect(forecast.interpretation.trendNarrative).toContain(
        'ease by -4.0 flushes',
      );
      expect(forecast.interpretation.actionRecommendation).toContain(
        'Lighter restroom traffic is expected',
      );
    });

    it('provides non-negative baseline fallback when historical data is empty', () => {
      const forecast = forecastDailySeries({
        historicalDaily: [],
        horizonDays: 7,
        nowMs: FIXED_NOW_MS,
      });

      expect(forecast.series).toHaveLength(7);
      expect(forecast.next7DaysFlushes).toBeGreaterThan(0);
      expect(forecast.series.every((p) => p.predictedFlushes >= 0)).toBe(true);
      expect(forecast.interpretation.usedBaselineFallback).toBe(true);
      expect(forecast.interpretation.confidenceLevel).toBe('baseline');
      expect(forecast.interpretation.regression?.rSquared).toBeNull();
      expect(forecast.interpretation.confidenceLabel).toBe(
        'Starting Estimate (No recent logs)',
      );
      expect(forecast.interpretation.trendNarrative).toContain(
        'No recent flush records',
      );
    });
  });

  describe('computeCampusRestroomRiskScores & resolveRoomIdFromDeviceId', () => {
    it('resolves canonical room IDs, stall IDs, aliases, and prototype devices', () => {
      expect(resolveRoomIdFromDeviceId('SDCA-FL2-M1')).toBe('SDCA-FL2-M1');
      expect(resolveRoomIdFromDeviceId('SDCA-FL1-CANTEEN-M-S01')).toBe(
        'SDCA-FL1-CANTEEN-M',
      );
      expect(resolveRoomIdFromDeviceId('SDCA-FL3-F-LEFT')).toBe('SDCA-FL3-F1');
      expect(resolveRoomIdFromDeviceId('toilet-01')).toBe('SDCA-FL1-CANTEEN-M');
      expect(resolveRoomIdFromDeviceId('unknown-room')).toBeNull();
    });

    it('scores all 22 SDCA Annex rooms, computes MTBI, and sorts highest risk first', () => {
      const hr = 3_600_000;
      const rooms = computeCampusRestroomRiskScores({
        nowMs: FIXED_NOW_MS,
        incidents: [
          {
            deviceId: 'SDCA-FL1-CANTEEN-M-S02',
            timestampMs: FIXED_NOW_MS - 48 * hr,
            source: 'issue_report',
          },
          {
            deviceId: 'toilet-01',
            timestampMs: FIXED_NOW_MS - 24 * hr,
            source: 'task',
          },
          {
            deviceId: 'SDCA-FL1-CANTEEN-M',
            timestampMs: FIXED_NOW_MS - 12 * hr,
            source: 'issue_report',
          },
          {
            deviceId: 'SDCA-FL2-F1-S01',
            timestampMs: FIXED_NOW_MS - 96 * hr,
            source: 'task',
          },
        ],
      });

      expect(rooms).toHaveLength(SDCA_RESTROOM_ROOMS.length);
      expect(rooms[0].roomId).toBe('SDCA-FL1-CANTEEN-M');
      expect(rooms[0].totalIncidents).toBe(3);
      expect(rooms[0].recent7dIncidents).toBe(3);
      // Span from -48h to -12h is 36h across 2 intervals -> MTBI = 18.0h
      expect(rooms[0].mtbiHours).toBe(18);
      expect(rooms[0].riskScore).toBeGreaterThanOrEqual(70);
      expect(rooms[0].recommendedTaskMessage).toContain('[PREDICTIVE]');
    });
  });

  describe('buildPredictiveMaintenanceSummary', () => {
    it('assembles complete predictive maintenance summary', () => {
      const summary = buildPredictiveMaintenanceSummary({
        deviceId: 'toilet-01',
        rawCounters: {
          uvOnTimeSeconds: 540_000, // 150 hrs = 50%
          lidCycleCount: 500,
          flowSensorTotalLiters: 60,
          pumpTotalLiters: 60,
          relayTotalTriggers: 600,
          ultrasonicConsecutiveFailures: 0,
        },
        windowDays: 7,
        observedWindowTotals: {
          flushes: 70,
          waterLiters: 105,
          uvSeconds: 18_000,
          lidCycles: 80,
        },
        flushSamples: [
          { waterVolume: 1.5, duration: 5, timestampMs: FIXED_NOW_MS - 5000 },
          { waterVolume: 1.5, duration: 5, timestampMs: FIXED_NOW_MS - 4000 },
        ],
        ultrasonicSamples: [{ value: 55, timestampMs: FIXED_NOW_MS - 1000 }],
        historicalDaily: [
          { date: '2026-11-14', flushCount: 10, waterLiters: 15 },
          { date: '2026-11-15', flushCount: 12, waterLiters: 18 },
        ],
        incidents: [],
        nowMs: FIXED_NOW_MS,
      });

      expect(summary.deviceId).toBe('toilet-01');
      expect(summary.overallHealthIndex).toBeGreaterThan(0);
      expect(summary.overallHealthIndex).toBeLessThanOrEqual(100);
      expect(summary.componentRul).toHaveLength(2);
      expect(summary.driftIndicators).toHaveLength(2);
      expect(summary.forecasts.series).toHaveLength(7);
      expect(summary.campusRisk).toHaveLength(22);
    });
  });

  describe('selectAvailableTechnicianAlphabetically', () => {
    it('selects the alphabetically first available technician with lowest workload', () => {
      const selected = selectAvailableTechnicianAlphabetically([
        {
          id: 'tech-z',
          displayName: 'Zara Santos',
          email: 'zara@example.com',
          workload: 0,
          lastAutoAssignedAt: 9999,
        },
        {
          id: 'tech-a',
          displayName: 'alice Cruz',
          email: 'alice@example.com',
          workload: 0,
          lastAutoAssignedAt: 50000,
        },
        {
          id: 'tech-b',
          displayName: 'Ben Reyes',
          email: 'ben@example.com',
          workload: 0,
          lastAutoAssignedAt: 100,
        },
      ]);

      expect(selected?.id).toBe('tech-a');
      expect(selected?.displayName).toBe('alice Cruz');
    });

    it('returns null when no technicians are available', () => {
      expect(selectAvailableTechnicianAlphabetically([])).toBeNull();
    });
  });
});
