const mockCollection = jest.fn();

jest.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: (name: string) => mockCollection(name),
  },
}));

jest.mock('@/lib/auth-helpers', () => ({
  verifyAuthToken: jest.fn().mockResolvedValue({ uid: 'test-user' }),
}));

import { GET as getDashboard } from '@/app/api/analytics/dashboard/route';
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
  });
});
