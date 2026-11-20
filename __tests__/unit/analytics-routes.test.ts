const mockCollection = jest.fn();

jest.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: (name: string) => mockCollection(name),
  },
}));

jest.mock('@/lib/auth-helpers', () => ({
  verifyAuthToken: jest.fn().mockResolvedValue({ uid: 'test-user' }),
  requireSupervisorOrAdmin: jest.fn().mockResolvedValue(undefined),
}));

import { GET as getDashboard } from '@/app/api/analytics/dashboard/route';
import { GET as getWaterUsage } from '@/app/api/analytics/water-usage/route';
import { GET as getSystemPerformance } from '@/app/api/analytics/system-performance/route';
import { GET as getFlushPatterns } from '@/app/api/analytics/flush-patterns/route';

describe('Analytics API Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/analytics/dashboard', () => {
    it('returns uvCompletionRate: null and uvStats when no UV cycles exist', async () => {
      const mockQuery = {
        where: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ size: 0, docs: [] }),
      };

      mockCollection.mockImplementation((name: string) => {
        if (name === 'flushEvents') {
          return mockQuery;
        }
        if (name === 'uvCycles') {
          return mockQuery;
        }
        if (name === 'devices') {
          return {
            get: jest.fn().mockResolvedValue({
              size: 1,
              docs: [
                {
                  id: 'd1',
                  data: () => ({
                    lastSeen: { toMillis: () => Date.now() },
                  }),
                },
              ],
            }),
          };
        }
        if (name === 'deviceUptimeDaily') {
          return mockQuery;
        }
        return mockQuery;
      });

      const request = new Request('http://localhost:3000/api/analytics/dashboard?from=2026-08-20&to=2026-08-27');
      const res = await getDashboard(request);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.uvCompletionRate).toBeNull();
      expect(json.data.uvStats).toEqual({
        total: 0,
        completed: 0,
        failed: 0,
      });
    });

    it('calculates accurate UV completion rate with completed and failed cycles', async () => {
      const uvDocs = [
        { data: () => ({ completed: true }) },
        { data: () => ({ completed: true }) },
        { data: () => ({ completed: true }) },
        { data: () => ({ completed: false }) },
      ];

      mockCollection.mockImplementation((name: string) => {
        if (name === 'uvCycles') {
          return {
            where: jest.fn().mockReturnThis(),
            get: jest.fn().mockResolvedValue({ size: 4, docs: uvDocs }),
          };
        }
        if (name === 'flushEvents') {
          return {
            where: jest.fn().mockReturnThis(),
            get: jest.fn().mockResolvedValue({
              size: 5,
              docs: [
                {
                  data: () => ({
                    waterVolume: 1.5,
                    timestamp: { toDate: () => new Date('2026-08-25T10:00:00Z') },
                  }),
                },
              ],
            }),
          };
        }
        if (name === 'devices') {
          return {
            get: jest.fn().mockResolvedValue({
              size: 1,
              docs: [{ data: () => ({ lastSeen: { toMillis: () => Date.now() } }) }],
            }),
          };
        }
        return {
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue({ size: 0, docs: [] }),
        };
      });

      const request = new Request('http://localhost:3000/api/analytics/dashboard?from=2026-08-20&to=2026-08-27');
      const res = await getDashboard(request);
      const json = await res.json();

      expect(json.success).toBe(true);
      expect(json.data.uvCompletionRate).toBe(75);
      expect(json.data.uvStats).toEqual({
        total: 4,
        completed: 3,
        failed: 1,
      });
    });

    it('degrades gracefully to 200 OK with safe fallback metrics when Firestore throws RESOURCE_EXHAUSTED', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        mockCollection.mockImplementation(() => ({
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockRejectedValue(new Error('8 RESOURCE_EXHAUSTED: Quota exceeded.')),
        }));

        const request = new Request(
          'http://localhost:3000/api/analytics/dashboard?from=2026-08-20&to=2026-08-27',
        );
        const res = await getDashboard(request);
        expect(res.status).toBe(200);
        const json = await res.json();

        expect(json.success).toBe(true);
        expect(json.data.uvCompletionRate).toBeNull();
        expect(json.data.totalFlushes).toBe(0);
        expect(json.data.totalWaterLiters).toBe(0);
      } finally {
        warnSpy.mockRestore();
      }
    });

    it('excludes placeholder device docs with lastSeen: null from liveSnapshotPercent when active hardware exists', async () => {
      const nowMs = Date.now();
      mockCollection.mockImplementation((name: string) => {
        if (name === 'devices') {
          return {
            get: jest.fn().mockResolvedValue({
              size: 3,
              docs: [
                {
                  id: 'toilet-01',
                  data: () => ({ lastSeen: { toMillis: () => nowMs } }),
                },
                {
                  id: 'SDCA-FL1-CANTEEN-M',
                  data: () => ({ lastSeen: null }),
                },
                {
                  id: 'SDCA-FL2-M1',
                  data: () => ({ lastSeen: null }),
                },
              ],
            }),
          };
        }
        return {
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue({ size: 0, empty: true, docs: [] }),
        };
      });

      const request = new Request(
        'http://localhost:3000/api/analytics/dashboard?from=2026-08-01&to=2026-08-03',
      );
      const res = await getDashboard(request);
      expect(res.status).toBe(200);
      const json = await res.json();

      expect(json.success).toBe(true);
      expect(json.data.liveSnapshotPercent).toBe(100);
      expect(json.data.uptimePercent).toBe(100);
    });
  });

  describe('GET /api/analytics/system-performance', () => {
    it('returns daily uptime breakdown and aggregate SLA uptime for date range', async () => {
      const dailyDocs = [
        {
          data: () => ({
            date: '2026-08-26',
            totalMinutes: 1440,
            onlineMinutes: 1440,
          }),
        },
        {
          data: () => ({
            date: '2026-08-27',
            totalMinutes: 1440,
            onlineMinutes: 720, // 50% uptime
          }),
        },
      ];

      mockCollection.mockImplementation((name: string) => {
        if (name === 'devices') {
          return {
            get: jest.fn().mockResolvedValue({
              docs: [
                {
                  id: 'd1',
                  data: () => ({
                    id: 'd1',
                    name: 'Stall 1',
                    status: 'online',
                    lastSeen: {
                      toMillis: () => Date.now(),
                      toDate: () => new Date(),
                    },
                  }),
                },
              ],
            }),
          };
        }
        if (name === 'deviceUptimeDaily') {
          return {
            where: jest.fn().mockReturnThis(),
            get: jest.fn().mockResolvedValue({ empty: false, docs: dailyDocs }),
          };
        }
        return {};
      });

      const request = new Request('http://localhost:3000/api/analytics/system-performance?from=2026-08-26&to=2026-08-27');
      const res = await getSystemPerformance(request);
      const json = await res.json();

      expect(json.success).toBe(true);
      // (1440 + 720) / (1440 + 1440) = 2160 / 2880 = 75.0%
      expect(json.data.uptimePercent).toBe(75);
      expect(json.data.daily).toHaveLength(2);
      expect(json.data.daily[0]).toEqual({ date: '2026-08-26', uptimePercent: 100 });
      expect(json.data.daily[1]).toEqual({ date: '2026-08-27', uptimePercent: 50 });
      expect(json.data.predictiveMaintenance).toBeDefined();
      expect(json.data.predictiveMaintenance.componentRul).toHaveLength(2);
      expect(json.data.predictiveMaintenance.driftIndicators).toHaveLength(2);
      expect(json.data.predictiveMaintenance.forecasts.series).toHaveLength(7);
      expect(json.data.predictiveMaintenance.campusRisk).toHaveLength(22);
    });

    it('aggregates hardware wear counters, flush telemetry, and campus incidents into predictiveMaintenance', async () => {
      const nowMs = Date.now();
      mockCollection.mockImplementation((name: string) => {
        if (name === 'devices') {
          return {
            get: jest.fn().mockResolvedValue({
              docs: [
                {
                  id: 'toilet-01',
                  data: () => ({
                    id: 'toilet-01',
                    name: 'Prototype Unit',
                    status: 'online',
                    lastSeen: { toMillis: () => nowMs },
                  }),
                },
              ],
            }),
            doc: jest.fn().mockReturnValue({
              collection: jest.fn().mockReturnValue({
                doc: jest.fn().mockReturnValue({
                  get: jest.fn().mockResolvedValue({
                    exists: true,
                    data: () => ({
                      uvOnTimeSeconds: 540_000, // 150 hrs = 50%
                      lidCycleCount: 2_500,
                      flowSensorTotalLiters: 120,
                      pumpTotalLiters: 120,
                      relayTotalTriggers: 3_000,
                      ultrasonicConsecutiveFailures: 2,
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        if (name === 'deviceUptimeDaily') {
          return {
            where: jest.fn().mockReturnThis(),
            get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
          };
        }
        if (name === 'flushEvents') {
          return {
            orderBy: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            get: jest.fn().mockResolvedValue({
              docs: [
                {
                  id: 'f1',
                  data: () => ({
                    deviceId: 'toilet-01',
                    waterVolume: 1.5,
                    duration: 5,
                    timestamp: { toMillis: () => nowMs - 2 * 3_600_000 },
                  }),
                },
              ],
            }),
          };
        }
        if (name === 'issueReports') {
          return {
            orderBy: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            get: jest.fn().mockResolvedValue({
              docs: [
                {
                  id: 'ir1',
                  data: () => ({
                    deviceId: 'SDCA-FL1-CANTEEN-M-S01',
                    status: 'confirmed',
                    lastReportedAt: { toMillis: () => nowMs - 3_600_000 },
                  }),
                },
                {
                  id: 'ir2',
                  data: () => ({
                    deviceId: 'SDCA-FL1-CANTEEN-M',
                    status: 'pending_review',
                    lastReportedAt: { toMillis: () => nowMs - 13 * 3_600_000 },
                  }),
                },
              ],
            }),
          };
        }
        return {
          orderBy: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue({ docs: [] }),
        };
      });

      const request = new Request('http://localhost:3000/api/analytics/system-performance');
      const res = await getSystemPerformance(request);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);

      const pm = json.data.predictiveMaintenance;
      expect(pm.deviceId).toBe('toilet-01');
      const flowRul = pm.componentRul.find(
        (c: { key: string }) => c.key === 'flowSensorTotalLiters',
      );
      expect(flowRul.wearPercent).toBe(24);

      const ultraDrift = pm.driftIndicators.find(
        (d: { sensorKey: string }) => d.sensorKey === 'ultrasonic_echo_stability',
      );
      expect(ultraDrift.status).toBe('watch');

      const canteenMale = pm.campusRisk.find(
        (r: { roomId: string }) => r.roomId === 'SDCA-FL1-CANTEEN-M',
      );
      expect(canteenMale.totalIncidents).toBe(2);
      expect(canteenMale.mtbiHours).toBe(12);
    });

    it('returns 200 OK with baseline predictiveMaintenance when Firestore throws RESOURCE_EXHAUSTED', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        mockCollection.mockImplementation(() => ({
          where: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          get: jest.fn().mockRejectedValue(new Error('8 RESOURCE_EXHAUSTED: Quota exceeded.')),
        }));

        const request = new Request(
          'http://localhost:3000/api/analytics/system-performance?from=2026-08-20&to=2026-08-27',
        );
        const res = await getSystemPerformance(request);
        expect(res.status).toBe(200);
        const json = await res.json();

        expect(json.success).toBe(true);
        expect(json.data.totalCount).toBe(0);
        expect(json.data.predictiveMaintenance).toBeDefined();
        expect(json.data.predictiveMaintenance.componentRul).toHaveLength(2);
      } finally {
        warnSpy.mockRestore();
      }
    });

    it('returns 0% for unrecorded past days without telemetry, 100% for past days with flushEvents, and excludes lastSeen: null rooms', async () => {
      const nowMs = Date.now();
      mockCollection.mockImplementation((name: string) => {
        if (name === 'devices') {
          return {
            get: jest.fn().mockResolvedValue({
              docs: [
                {
                  id: 'toilet-01',
                  data: () => ({
                    id: 'toilet-01',
                    name: 'Prototype Unit',
                    status: 'online',
                    lastSeen: { toMillis: () => nowMs },
                  }),
                },
                {
                  id: 'SDCA-FL2-M1',
                  data: () => ({
                    id: 'SDCA-FL2-M1',
                    name: '2F Male 1 (QR Only)',
                    status: 'offline',
                    lastSeen: null,
                  }),
                },
              ],
            }),
          };
        }
        if (name === 'deviceUptimeDaily') {
          return {
            where: jest.fn().mockReturnThis(),
            get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
          };
        }
        if (name === 'flushEvents') {
          return {
            orderBy: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            get: jest.fn().mockResolvedValue({
              docs: [
                {
                  id: 'f-aug2',
                  data: () => ({
                    deviceId: 'toilet-01',
                    waterVolume: 1.4,
                    duration: 5,
                    timestamp: {
                      toMillis: () => Date.parse('2026-08-02T04:00:00.000Z'), // 12:00 PHT Aug 2
                    },
                  }),
                },
              ],
            }),
          };
        }
        return {
          orderBy: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue({ docs: [] }),
        };
      });

      const request = new Request(
        'http://localhost:3000/api/analytics/system-performance?from=2026-08-01&to=2026-08-03',
      );
      const res = await getSystemPerformance(request);
      expect(res.status).toBe(200);
      const json = await res.json();

      expect(json.success).toBe(true);
      expect(json.data.totalCount).toBe(1);
      expect(json.data.onlineCount).toBe(1);
      expect(json.data.liveSnapshotPercent).toBe(100);
      expect(json.data.daily).toEqual([
        { date: '2026-08-01', uptimePercent: 0 },
        { date: '2026-08-02', uptimePercent: 100 },
        { date: '2026-08-03', uptimePercent: 0 },
      ]);
      expect(json.data.uptimePercent).toBe(33.3);
    });

    it('prefers toilet-01 over alphabetically earlier SDCA-* rooms and falls back to cumulative flushEvents liters when maintenanceCounters doc is absent', async () => {
      const nowMs = Date.now();
      mockCollection.mockImplementation((name: string) => {
        if (name === 'devices') {
          return {
            get: jest.fn().mockResolvedValue({
              docs: [
                {
                  id: 'SDCA-FL1-CANTEEN-F',
                  data: () => ({
                    id: 'SDCA-FL1-CANTEEN-F',
                    name: '1F Canteen Female',
                    status: 'online',
                    lastSeen: { toMillis: () => nowMs },
                  }),
                },
                {
                  id: 'toilet-01',
                  data: () => ({
                    id: 'toilet-01',
                    name: 'Prototype Unit',
                    status: 'online',
                    lastSeen: { toMillis: () => nowMs },
                  }),
                },
              ],
            }),
            doc: jest.fn().mockReturnValue({
              collection: jest.fn().mockReturnValue({
                doc: jest.fn().mockReturnValue({
                  get: jest.fn().mockResolvedValue({ exists: false }),
                }),
              }),
            }),
          };
        }
        if (name === 'flushEvents') {
          return {
            orderBy: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            get: jest.fn().mockResolvedValue({
              docs: [
                {
                  id: 'f1',
                  data: () => ({
                    deviceId: 'toilet-01',
                    waterVolume: 42.5,
                    duration: 3,
                    timestamp: { toMillis: () => nowMs - 2 * 86_400_000 },
                  }),
                },
                {
                  id: 'f2',
                  data: () => ({
                    deviceId: 'toilet-01',
                    waterVolume: 33.58,
                    duration: 3,
                    timestamp: { toMillis: () => nowMs - 1 * 86_400_000 },
                  }),
                },
              ],
            }),
          };
        }
        return {
          where: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
        };
      });

      const request = new Request(
        'http://localhost:3000/api/analytics/system-performance?from=2026-11-10&to=2026-11-17',
      );
      const res = await getSystemPerformance(request);
      expect(res.status).toBe(200);
      const json = await res.json();

      expect(json.success).toBe(true);
      const pm = json.data.predictiveMaintenance;
      expect(pm.deviceId).toBe('toilet-01');
      const flowRul = pm.componentRul.find(
        (c: { key: string }) => c.key === 'flowSensorTotalLiters',
      );
      expect(flowRul.currentValue).toBe(76.1);
      expect(flowRul.wearPercent).toBe(15.2);
      expect(flowRul.unit).toBe('L');
      expect(flowRul.recommendation).not.toContain('No water usage recorded yet');

      const pumpRul = pm.componentRul.find(
        (c: { key: string }) => c.key === 'flushCycleCount',
      );
      expect(pumpRul.currentValue).toBe(2);
      expect(pumpRul.wearPercent).toBe(0.2);
      expect(pumpRul.unit).toBe('flushes');
      expect(pumpRul.recommendation).not.toContain('No flush cycles recorded yet');
    });

    it('skips querying tasks and issueReports when includeCampusRisk=false and reports uptimeSource', async () => {
      const queriedCollections: string[] = [];
      const nowMs = Date.now();
      mockCollection.mockImplementation((name: string) => {
        queriedCollections.push(name);
        if (name === 'devices') {
          return {
            get: jest.fn().mockResolvedValue({
              docs: [
                {
                  id: 'toilet-01',
                  data: () => ({
                    id: 'toilet-01',
                    name: 'Prototype Unit',
                    status: 'online',
                    lastSeen: { toMillis: () => nowMs },
                  }),
                },
              ],
            }),
          };
        }
        if (name === 'deviceUptimeDaily') {
          return {
            where: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
          };
        }
        return {
          where: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
        };
      });

      const request = new Request(
        'http://localhost:3000/api/analytics/system-performance?from=2026-10-01&to=2026-10-07&includeCampusRisk=false',
      );
      const res = await getSystemPerformance(request);
      expect(res.status).toBe(200);
      const json = await res.json();

      expect(json.success).toBe(true);
      expect(queriedCollections).not.toContain('tasks');
      expect(queriedCollections).not.toContain('issueReports');
      expect(json.data.uptimeSource).toBe('live_snapshot');
    });
  });

  describe('GET /api/analytics/flush-patterns', () => {
    it('queries flushEvents, shifts UTC to Philippine Time (UTC+8), and buckets correctly', async () => {
      // 2026-09-07 is a Monday (day index 1)
      const sampleFlushDocs = [
        // 06:00:00 UTC -> 14:00:00 PHT (+8h) on Monday 2026-09-07
        {
          data: () => ({
            timestamp: { toDate: () => new Date('2026-09-07T06:00:00.000Z') },
            waterVolume: 2.1,
          }),
        },
        // 06:30:00 UTC -> 14:30:00 PHT (+8h) on Monday 2026-09-07 (same hour bin 14)
        {
          data: () => ({
            timestamp: { _seconds: Math.floor(new Date('2026-09-07T06:30:00.000Z').getTime() / 1000) },
            waterVolume: 2.1,
          }),
        },
        // 23:00:00 UTC on Sept 6 -> 07:00:00 PHT on Sept 7 Monday (hour bin 07)
        {
          data: () => ({
            timestamp: new Date('2026-09-06T23:00:00.000Z').getTime(),
            waterVolume: 2.1,
          }),
        },
        // 02:00:00 UTC -> 10:00:00 PHT (hour bin 10) ISO string
        {
          data: () => ({
            timestamp: '2026-09-07T02:00:00.000Z',
            waterVolume: 2.1,
          }),
        },
        // 20:00:00 UTC on Sept 7 -> 04:00:00 PHT on Sept 8 (Tuesday) -> should be excluded for 2026-09-07
        {
          data: () => ({
            timestamp: { toDate: () => new Date('2026-09-07T20:00:00.000Z') },
            waterVolume: 2.1,
          }),
        },
      ];

      mockCollection.mockImplementation((name: string) => {
        if (name === 'flushEvents') {
          return {
            where: jest.fn().mockReturnThis(),
            get: jest.fn().mockResolvedValue({
              empty: false,
              docs: sampleFlushDocs,
            }),
          };
        }
        return {
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
        };
      });

      const request = new Request('http://localhost:3000/api/analytics/flush-patterns?from=2026-09-07&to=2026-09-07');
      const res = await getFlushPatterns(request);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);

      interface BucketItem {
        label: string;
        count: number;
      }

      // Check byHour buckets (24 bins)
      expect(json.data.byHour).toHaveLength(24);
      const hour07 = (json.data.byHour as BucketItem[]).find((h) => h.label === '07:00');
      const hour10 = (json.data.byHour as BucketItem[]).find((h) => h.label === '10:00');
      const hour14 = (json.data.byHour as BucketItem[]).find((h) => h.label === '14:00');
      const hour04 = (json.data.byHour as BucketItem[]).find((h) => h.label === '04:00');

      expect(hour07?.count).toBe(1);
      expect(hour10?.count).toBe(1);
      expect(hour14?.count).toBe(2);
      expect(hour04?.count).toBe(0); // Excluded because it's Sept 8 PHT

      // Total flushes for Sept 7 = 4
      const totalHourCount = (json.data.byHour as BucketItem[]).reduce((sum, b) => sum + b.count, 0);
      expect(totalHourCount).toBe(4);

      // Check byDay buckets (7 bins: Sunday=0 ... Monday=1 ... Saturday=6)
      expect(json.data.byDay).toHaveLength(7);
      const monday = (json.data.byDay as BucketItem[]).find((d) => d.label === 'Monday');
      expect(monday?.count).toBe(4);
    });

    it('falls back to lidEvents when flushEvents returns no records for requested range', async () => {
      interface BucketItem {
        label: string;
        count: number;
      }

      const sampleLidDocs = [
        {
          data: () => ({
            status: 'open',
            timestamp: { toDate: () => new Date('2026-09-07T03:00:00.000Z') }, // 11:00 PHT Monday
          }),
        },
      ];

      mockCollection.mockImplementation((name: string) => {
        if (name === 'flushEvents') {
          return {
            where: jest.fn().mockReturnThis(),
            get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
          };
        }
        if (name === 'lidEvents') {
          return {
            where: jest.fn().mockReturnThis(),
            get: jest.fn().mockResolvedValue({ empty: false, docs: sampleLidDocs }),
          };
        }
        return {
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
        };
      });

      const request = new Request('http://localhost:3000/api/analytics/flush-patterns?from=2026-09-07&to=2026-09-07');
      const res = await getFlushPatterns(request);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);

      const hour11 = (json.data.byHour as BucketItem[]).find((h) => h.label === '11:00');
      expect(hour11?.count).toBe(1);

      const monday = (json.data.byDay as BucketItem[]).find((d) => d.label === 'Monday');
      expect(monday?.count).toBe(1);
    });

    it('robustly parses numeric string epochs, handles precise PHT boundaries, and ignores malformed timestamps', async () => {
      interface BucketItem {
        label: string;
        count: number;
      }

      const boundaryAndMalformedDocs = [
        // Exact start of Sept 7 PHT: 2026-09-06T16:00:00.000Z -> 00:00:00 PHT Sept 7
        {
          data: () => ({
            timestamp: { toDate: () => new Date('2026-09-06T16:00:00.000Z') },
          }),
        },
        // Exact end of Sept 7 PHT: 2026-09-07T15:59:59.999Z -> 23:59:59.999 PHT Sept 7
        {
          data: () => ({
            timestamp: { toDate: () => new Date('2026-09-07T15:59:59.999Z') },
          }),
        },
        // 1ms before Sept 7 PHT: 2026-09-06T15:59:59.999Z -> 23:59:59.999 PHT Sept 6 (excluded)
        {
          data: () => ({
            timestamp: { toDate: () => new Date('2026-09-06T15:59:59.999Z') },
          }),
        },
        // 1ms after Sept 7 PHT: 2026-09-07T16:00:00.000Z -> 00:00:00 PHT Sept 8 (excluded)
        {
          data: () => ({
            timestamp: { toDate: () => new Date('2026-09-07T16:00:00.000Z') },
          }),
        },
        // Numeric string epoch in milliseconds (06:00:00 UTC -> 14:00:00 PHT Sept 7)
        {
          data: () => ({
            timestamp: String(new Date('2026-09-07T06:00:00.000Z').getTime()),
          }),
        },
        // Numeric string epoch in seconds (02:00:00 UTC -> 10:00:00 PHT Sept 7)
        {
          data: () => ({
            timestamp: String(Math.floor(new Date('2026-09-07T02:00:00.000Z').getTime() / 1000)),
          }),
        },
        // Standard Timestamp object without underscore: { seconds, nanoseconds } (04:00:00 UTC -> 12:00:00 PHT Sept 7)
        {
          data: () => ({
            timestamp: {
              seconds: Math.floor(new Date('2026-09-07T04:00:00.000Z').getTime() / 1000),
              nanoseconds: 0,
            },
          }),
        },
        // Malformed records (must be safely ignored without throwing)
        {
          data: () => ({ timestamp: null }),
        },
        {
          data: () => ({ timestamp: {} }),
        },
        {
          data: () => ({ timestamp: 'invalid-date-string' }),
        },
        {
          data: () => ({ createdAt: 'not-a-date' }),
        },
      ];

      mockCollection.mockImplementation((name: string) => {
        if (name === 'flushEvents') {
          return {
            where: jest.fn().mockReturnThis(),
            get: jest.fn().mockResolvedValue({
              empty: false,
              docs: boundaryAndMalformedDocs,
            }),
          };
        }
        return {
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
        };
      });

      const request = new Request('http://localhost:3000/api/analytics/flush-patterns?from=2026-09-07&to=2026-09-07');
      const res = await getFlushPatterns(request);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);

      const hour00 = (json.data.byHour as BucketItem[]).find((h) => h.label === '00:00');
      const hour10 = (json.data.byHour as BucketItem[]).find((h) => h.label === '10:00');
      const hour12 = (json.data.byHour as BucketItem[]).find((h) => h.label === '12:00');
      const hour14 = (json.data.byHour as BucketItem[]).find((h) => h.label === '14:00');
      const hour23 = (json.data.byHour as BucketItem[]).find((h) => h.label === '23:00');

      expect(hour00?.count).toBe(1); // 16:00 UTC Sept 6 -> 00:00 PHT Sept 7
      expect(hour10?.count).toBe(1); // Numeric string in seconds
      expect(hour12?.count).toBe(1); // { seconds, nanoseconds }
      expect(hour14?.count).toBe(1); // Numeric string in milliseconds
      expect(hour23?.count).toBe(1); // 15:59:59.999 UTC Sept 7 -> 23:59 PHT Sept 7

      const totalHourCount = (json.data.byHour as BucketItem[]).reduce((sum, b) => sum + b.count, 0);
      expect(totalHourCount).toBe(5);

      const monday = (json.data.byDay as BucketItem[]).find((d) => d.label === 'Monday');
      expect(monday?.count).toBe(5);
    });

    it('returns 200 OK empty buckets when Firestore throws RESOURCE_EXHAUSTED', async () => {
      mockCollection.mockImplementation(() => ({
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        get: jest.fn().mockRejectedValue(new Error('8 RESOURCE_EXHAUSTED: Quota exceeded.')),
      }));

      const request = new Request(
        'http://localhost:3000/api/analytics/flush-patterns?from=2026-09-07&to=2026-09-07',
      );
      const res = await getFlushPatterns(request);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.degraded).toBe(true);
      expect(json.data.byDay).toHaveLength(7);
      expect(json.data.byHour).toHaveLength(24);
      expect(json.data.byDay.every((bucket: { count: number }) => bucket.count === 0)).toBe(true);
      expect(json.data.byHour.every((bucket: { count: number }) => bucket.count === 0)).toBe(true);
    });
  });

  describe('GET /api/analytics/water-usage', () => {
    it('zero-fills quiet calendar days across the requested date range when activity exists', async () => {
      mockCollection.mockImplementation((name: string) => {
        if (name === 'flushEvents') {
          return {
            where: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            get: jest.fn().mockResolvedValue({
              docs: [
                {
                  data: () => ({
                    waterVolume: 2.4,
                    timestamp: {
                      toDate: () => new Date('2026-09-02T04:00:00.000Z'), // 2026-09-02 12:00 PHT
                    },
                  }),
                },
                {
                  data: () => ({
                    waterVolume: 1.6,
                    timestamp: {
                      toDate: () => new Date('2026-09-04T04:00:00.000Z'), // 2026-09-04 12:00 PHT
                    },
                  }),
                },
              ],
            }),
          };
        }
        return {
          where: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue({ docs: [] }),
        };
      });

      const request = new Request(
        'http://localhost:3000/api/analytics/water-usage?from=2026-09-01&to=2026-09-04',
      );
      const res = await getWaterUsage(request);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data).toEqual([
        { date: '2026-09-01', totalVolume: 0, avgVolume: 0, flushCount: 0 },
        { date: '2026-09-02', totalVolume: 2.4, avgVolume: 2.4, flushCount: 1 },
        { date: '2026-09-03', totalVolume: 0, avgVolume: 0, flushCount: 0 },
        { date: '2026-09-04', totalVolume: 1.6, avgVolume: 1.6, flushCount: 1 },
      ]);
    });

    it('returns 200 OK empty array when Firestore throws RESOURCE_EXHAUSTED', async () => {
      mockCollection.mockImplementation(() => ({
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        get: jest.fn().mockRejectedValue(new Error('8 RESOURCE_EXHAUSTED: Quota exceeded.')),
      }));

      const request = new Request(
        'http://localhost:3000/api/analytics/water-usage?from=2026-09-07&to=2026-09-07',
      );
      const res = await getWaterUsage(request);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.degraded).toBe(true);
      expect(json.data).toEqual([]);
    });
  });
});
