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
    it('computes accurate wear percentages, burn rates, service dates, and statuses', () => {
      const predictions = computeComponentRulPredictions({
        counters: {
          uvOnTimeSeconds: 972_000, // 270 / 300 hrs -> 90% -> critical
          lidCycleCount: 7_500, // 75% -> warning
          flowSensorTotalLiters: 250, // 50% -> watch
          pumpTotalLiters: 100, // 20% -> healthy
          relayTotalTriggers: 4_000,
          ultrasonicConsecutiveFailures: 1,
          flushCycleCount: 850,
        },
        windowDays: 10,
        observedWindowTotals: {
          flushes: 200, // 20 flushes/day -> 150 remaining -> ~8 days -> critical/warning
          waterLiters: 300, // 30 L/day
          uvSeconds: 36_000, // 1 hr/day
          lidCycles: 250, // 25 cycles/day
        },
        nowMs: FIXED_NOW_MS,
      });

      expect(predictions).toHaveLength(6);

      const uv = predictions.find((c) => c.key === 'uvOnTimeSeconds');
      expect(uv?.currentValue).toBe(270);
      expect(uv?.ratedLimit).toBe(300);
      expect(uv?.wearPercent).toBe(90);
      expect(uv?.dailyBurnRate).toBe(1);
      expect(uv?.estimatedDaysRemaining).toBe(30);
      expect(uv?.predictedServiceDate).toBe('2026-12-15');
      expect(uv?.status).toBe('critical');

      const lid = predictions.find((c) => c.key === 'lidCycleCount');
      expect(lid?.wearPercent).toBe(75);
      expect(lid?.dailyBurnRate).toBe(25);
      expect(lid?.estimatedDaysRemaining).toBe(100);
      expect(lid?.status).toBe('warning');

      const pump = predictions.find((c) => c.key === 'pumpTotalLiters');
      expect(pump?.dailyBurnRate).toBe(30);
      expect(pump?.estimatedDaysRemaining).toBe(13);
      // 13 days <= 21d triggers proactive warning even though wear is 20%
      expect(pump?.status).toBe('warning');
    });

    it('prevents division by zero and uses fallback burn rates when window activity is zero', () => {
      const predictions = computeComponentRulPredictions({
        counters: normalizeWearCounters({}),
        windowDays: 0,
        nowMs: FIXED_NOW_MS,
      });

      expect(predictions).toHaveLength(6);
      for (const item of predictions) {
        expect(item.dailyBurnRate).toBeGreaterThan(0);
        expect(Number.isFinite(item.estimatedDaysRemaining)).toBe(true);
        expect(item.wearPercent).toBe(0);
        expect(item.status).toBe('healthy');
      }
    });
  });

  describe('detectTelemetryDrift', () => {
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

  describe('forecastDailySeries', () => {
    it('projects 7 non-negative forecast days following the historical trend', () => {
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
      expect(forecast.dailyFlushTrendSlope).toBeGreaterThan(0);
      expect(forecast.next7DaysFlushes).toBeGreaterThan(150);
      expect(forecast.next7DaysWaterLiters).toBeGreaterThan(200);
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
      expect(summary.componentRul).toHaveLength(6);
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
