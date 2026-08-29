const mockGet = jest.fn();
const mockWhere = jest.fn();
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
});
