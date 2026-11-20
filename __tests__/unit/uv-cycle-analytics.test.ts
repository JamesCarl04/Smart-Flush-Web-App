const mockCollection = jest.fn();

jest.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: (name: string) => mockCollection(name),
  },
}));

const mockVerifyAuthToken = jest.fn();
const mockRequireSupervisorOrAdmin = jest.fn();

jest.mock('@/lib/auth-helpers', () => ({
  verifyAuthToken: (...args: unknown[]) => mockVerifyAuthToken(...args),
  requireSupervisorOrAdmin: (...args: unknown[]) =>
    mockRequireSupervisorOrAdmin(...args),
}));

import { GET as getUvCycles } from '@/app/api/analytics/uv-cycles/route';
import {
  buildUvCycleAnalytics,
  formatUvDuration,
  getPhtPeriodBounds,
  type RawUvCycleRecord,
} from '@/lib/uv-cycle-analytics';

describe('lib/uv-cycle-analytics pure aggregators', () => {
  const sampleRecords: RawUvCycleRecord[] = [
    // Previous month: Oct 15, 2026 09:10:05 PHT
    {
      id: 'uv-oct-1',
      deviceId: 'toilet-01',
      duration: 5,
      completed: true,
      reason: null,
      timestampMs: Date.parse('2026-10-15T09:10:05.000+08:00'),
    },
    // Nov 18, 2026 23:59:59 PHT (15:59:59 UTC — stays on Nov 18 PHT)
    {
      id: 'uv-nov18-1',
      deviceId: 'toilet-01',
      duration: 5,
      completed: true,
      reason: null,
      timestampMs: Date.parse('2026-11-18T15:59:59.000Z'),
    },
    // Nov 19, 2026 00:00:00 PHT (Nov 18 16:00:00 UTC — rolls over to Nov 19 PHT)
    {
      id: 'uv-nov19-1',
      deviceId: 'toilet-01',
      duration: 5,
      completed: true,
      reason: null,
      timestampMs: Date.parse('2026-11-18T16:00:00.000Z'),
    },
    // Nov 19, 2026 18:38:50 PHT
    {
      id: 'uv-nov19-2',
      deviceId: 'toilet-01',
      duration: 5,
      completed: true,
      reason: null,
      timestampMs: Date.parse('2026-11-19T18:38:50.000+08:00'),
    },
    // Nov 19, 2026 18:40:30 PHT (interrupted after 3s)
    {
      id: 'uv-nov19-3',
      deviceId: 'toilet-01',
      duration: 3,
      completed: false,
      reason: 'lid_opened',
      timestampMs: Date.parse('2026-11-19T18:40:30.000+08:00'),
    },
  ];

  const nowNov19Ms = Date.parse('2026-11-19T22:00:00.000+08:00');

  it('computes Monday–Sunday week, month, and year PHT bounds accurately', () => {
    // 2026-11-19 is Thursday -> Mon Nov 16 .. Sun Nov 22
    const bounds = getPhtPeriodBounds('2026-11-19', nowNov19Ms);
    expect(bounds.weekFrom).toBe('2026-11-16');
    expect(bounds.weekTo).toBe('2026-11-22');
    expect(bounds.monthFrom).toBe('2026-11-01');
    expect(bounds.monthTo).toBe('2026-11-30');
    expect(bounds.yearFrom).toBe('2026-01-01');
    expect(bounds.yearTo).toBe('2026-12-31');
  });

  it('aggregates accurate Day/Week/Month/Year totals and hourly buckets across PHT midnight', () => {
    const result = buildUvCycleAnalytics({
      records: sampleRecords,
      period: 'day',
      anchorDate: '2026-11-19',
      granularity: 'hour',
      nowMs: nowNov19Ms,
    });

    expect(result.totals.today).toBe(3);
    expect(result.totals.selectedDay).toBe(3);
    expect(result.totals.thisWeek).toBe(4);
    expect(result.totals.thisMonth).toBe(4);
    expect(result.totals.thisYear).toBe(5);
    expect(result.totals.selectedDayDurationSeconds).toBe(13);
    expect(result.totals.thisWeekDurationSeconds).toBe(18);
    expect(result.totals.thisMonthDurationSeconds).toBe(18);
    expect(result.totals.thisYearDurationSeconds).toBe(23);
    expect(result.totals.periodCompleted).toBe(2);
    expect(result.totals.periodInterrupted).toBe(1);
    expect(result.totals.avgDurationSeconds).toBe(4.3);

    expect(formatUvDuration(45)).toBe('45s');
    expect(formatUvDuration(185, { includeRawSeconds: true })).toBe('3m 5s (185s)');
    expect(formatUvDuration(3720)).toBe('1h 2m');

    expect(result.series).toHaveLength(24);
    const hour00 = result.series.find((p) => p.label === '00:00');
    const hour18 = result.series.find((p) => p.label === '18:00');
    expect(hour00?.count).toBe(1);
    expect(hour18?.count).toBe(2);
    expect(hour18?.completed).toBe(1);
    expect(hour18?.interrupted).toBe(1);
    expect(hour18?.exactTimes).toEqual(['18:38:50', '18:40:30']);
  });

  it('builds 60 continuous minute buckets and exact HH:mm:ss timeline when filtered to an hour', () => {
    const minuteView = buildUvCycleAnalytics({
      records: sampleRecords,
      period: 'day',
      anchorDate: '2026-11-19',
      granularity: 'minute',
      hourFilter: 18,
      nowMs: nowNov19Ms,
    });
    expect(minuteView.series).toHaveLength(60);
    expect(minuteView.series.find((p) => p.label === '18:38')?.count).toBe(1);
    expect(minuteView.series.find((p) => p.label === '18:40')?.interrupted).toBe(1);

    const exactSecondView = buildUvCycleAnalytics({
      records: sampleRecords,
      period: 'day',
      anchorDate: '2026-11-19',
      granularity: 'second',
      hourFilter: 18,
      nowMs: nowNov19Ms,
    });
    expect(exactSecondView.series).toHaveLength(2);
    expect(exactSecondView.series[0]).toMatchObject({
      label: '18:38:50',
      count: 1,
      cumulativeCount: 1,
      eventDurationSeconds: 5,
    });
    expect(exactSecondView.series[1]).toMatchObject({
      label: '18:40:30',
      count: 2,
      cumulativeCount: 2,
      eventDurationSeconds: 3,
      reason: 'lid_opened',
    });
  });

  it('builds Week (7 days), Month (30 days), and Year (12 months) series accurately', () => {
    const weekView = buildUvCycleAnalytics({
      records: sampleRecords,
      period: 'week',
      anchorDate: '2026-11-19',
      nowMs: nowNov19Ms,
    });
    expect(weekView.series).toHaveLength(7);
    expect(weekView.series.find((p) => p.key === '2026-11-18')?.count).toBe(1);
    expect(weekView.series.find((p) => p.key === '2026-11-19')?.count).toBe(3);

    const monthView = buildUvCycleAnalytics({
      records: sampleRecords,
      period: 'month',
      anchorDate: '2026-11-19',
      nowMs: nowNov19Ms,
    });
    expect(monthView.series).toHaveLength(30);
    expect(monthView.totals.periodTotal).toBe(4);

    const yearView = buildUvCycleAnalytics({
      records: sampleRecords,
      period: 'year',
      anchorDate: '2026-11-19',
      nowMs: nowNov19Ms,
    });
    expect(yearView.series).toHaveLength(12);
    expect(yearView.series.find((p) => p.key === '2026-10')?.count).toBe(1);
    expect(yearView.series.find((p) => p.key === '2026-11')?.count).toBe(4);
  });

  it('merges daily rollups only when raw logs were truncated without double-counting', () => {
    const nonTruncated = buildUvCycleAnalytics({
      records: sampleRecords,
      dailyRollups: [
        {
          date: '2026-11-19',
          totalCount: 100,
          completedCount: 100,
          interruptedCount: 0,
          totalDurationSeconds: 500,
        },
      ],
      rawTruncated: false,
      period: 'month',
      anchorDate: '2026-11-19',
      nowMs: nowNov19Ms,
    });
    expect(nonTruncated.totals.selectedDay).toBe(3);

    const truncated = buildUvCycleAnalytics({
      records: sampleRecords,
      dailyRollups: [
        {
          date: '2026-11-19',
          totalCount: 100,
          completedCount: 98,
          interruptedCount: 2,
          totalDurationSeconds: 496,
        },
      ],
      rawTruncated: true,
      period: 'month',
      anchorDate: '2026-11-19',
      nowMs: nowNov19Ms,
    });
    expect(truncated.totals.selectedDay).toBe(100);
    expect(truncated.totals.thisMonth).toBe(101);
  });

  it('computes Relative Effectivity = (interrupted avg / completed avg) * 100 and returns null when 0 interrupted cycles exist', () => {
    // 2 completed cycles (5s, 5s -> avg 5.0s) and 2 interrupted cycles (1.5s, 2.5s -> avg 2.0s) -> 40.0%
    const mixed = buildUvCycleAnalytics({
      records: [
        {
          id: 'c1',
          deviceId: 'toilet-01',
          duration: 5,
          completed: true,
          reason: null,
          timestampMs: Date.parse('2026-11-19T10:00:00.000+08:00'),
        },
        {
          id: 'c2',
          deviceId: 'toilet-01',
          duration: 5,
          completed: true,
          reason: null,
          timestampMs: Date.parse('2026-11-19T10:05:00.000+08:00'),
        },
        {
          id: 'i1',
          deviceId: 'toilet-01',
          duration: 1.5,
          completed: false,
          reason: 'lid_opened',
          timestampMs: Date.parse('2026-11-19T10:10:00.000+08:00'),
        },
        {
          id: 'i2',
          deviceId: 'toilet-01',
          duration: 2.5,
          completed: false,
          reason: 'lid_opened',
          timestampMs: Date.parse('2026-11-19T10:15:00.000+08:00'),
        },
      ],
      period: 'day',
      anchorDate: '2026-11-19',
      nowMs: nowNov19Ms,
    });

    expect(mixed.totals.completedAvgDurationSeconds).toBe(5);
    expect(mixed.totals.interruptedAvgDurationSeconds).toBe(2);
    expect(mixed.totals.relativeEffectivityPercent).toBe(40);

    // 0 interrupted cycles must yield null (never a misleading 0%)
    const allCompleted = buildUvCycleAnalytics({
      records: [
        {
          id: 'c1',
          deviceId: 'toilet-01',
          duration: 5,
          completed: true,
          reason: null,
          timestampMs: Date.parse('2026-11-19T10:00:00.000+08:00'),
        },
      ],
      period: 'day',
      anchorDate: '2026-11-19',
      nowMs: nowNov19Ms,
    });

    expect(allCompleted.totals.completedAvgDurationSeconds).toBe(5);
    expect(allCompleted.totals.interruptedAvgDurationSeconds).toBeNull();
    expect(allCompleted.totals.relativeEffectivityPercent).toBeNull();
  });
});

describe('GET /api/analytics/uv-cycles', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockVerifyAuthToken.mockResolvedValue({ uid: 'admin-1', role: 'admin' });
    mockRequireSupervisorOrAdmin.mockResolvedValue(undefined);
  });

  it('returns log-backed line graph series, exact HH:mm:ss logs, and Day/Week/Month/Year totals', async () => {
    const firestoreDocs = [
      {
        id: 'doc-1',
        data: () => ({
          id: 'doc-1',
          deviceId: 'toilet-01',
          duration: 5,
          completed: true,
          reason: null,
          timestamp: {
            toMillis: () => Date.parse('2026-11-19T18:38:50.000+08:00'),
          },
        }),
      },
      {
        id: 'doc-2',
        data: () => ({
          id: 'doc-2',
          deviceId: 'toilet-01',
          duration: 5,
          completed: true,
          reason: null,
          timestamp: {
            toMillis: () => Date.parse('2026-11-19T18:59:10.000+08:00'),
          },
        }),
      },
      {
        id: 'doc-3',
        data: () => ({
          id: 'doc-3',
          deviceId: 'toilet-02',
          duration: 5,
          completed: true,
          reason: null,
          timestamp: {
            toMillis: () => Date.parse('2026-11-18T22:27:21.000+08:00'),
          },
        }),
      },
    ];

    mockCollection.mockImplementation(() => ({
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue({ docs: firestoreDocs }),
    }));

    const request = new Request(
      'http://localhost:3000/api/analytics/uv-cycles?period=day&date=2026-11-19&granularity=second&deviceId=toilet-01',
    );
    const res = await getUvCycles(request);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.totals.selectedDay).toBe(2);
    expect(json.data.totals.thisWeek).toBe(2); // toilet-02 excluded by deviceId filter
    expect(json.data.totals.avgDurationSeconds).toBe(5);
    expect(json.data.series).toHaveLength(2);
    expect(json.data.series[0].label).toBe('18:38:50');
    expect(json.data.series[1].label).toBe('18:59:10');
    expect(json.data.logs[0].phtTime).toBe('18:59:10');
    expect(json.data.logs[0].duration).toBe(5);
  });

  it.each([
    ['period=decade', 'period must be one of'],
    ['date=2026-02-30', 'date must be a valid'],
    ['granularity=decade', 'granularity must be one of'],
    ['hour=24', 'hour must be an integer'],
    ['deviceId=bad/id!', 'Invalid deviceId'],
    ['since=-5', 'since must be a positive'],
  ])('returns 400 on invalid query parameter (%s)', async (query, expectedErr) => {
    const request = new Request(
      `http://localhost:3000/api/analytics/uv-cycles?${query}`,
    );
    const res = await getUvCycles(request);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toContain(expectedErr);
  });

  it('enforces RBAC and propagates 403 Response when unauthorized role calls route', async () => {
    mockRequireSupervisorOrAdmin.mockRejectedValue(
      new Response(JSON.stringify({ success: false, error: 'Forbidden' }), {
        status: 403,
      }),
    );

    const request = new Request(
      'http://localhost:3000/api/analytics/uv-cycles?period=day&date=2026-11-19',
    );
    const res = await getUvCycles(request);
    expect(res.status).toBe(403);
  });

  it('degrades gracefully with 200 and degraded: true on Firestore RESOURCE_EXHAUSTED', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      mockCollection.mockImplementation(() => ({
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        get: jest
          .fn()
          .mockRejectedValue(new Error('8 RESOURCE_EXHAUSTED: Quota exceeded.')),
      }));

      const request = new Request(
        'http://localhost:3000/api/analytics/uv-cycles?period=week&date=2026-11-19',
      );
      const res = await getUvCycles(request);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.degraded).toBe(true);
      expect(json.data.series).toHaveLength(7);
    } finally {
      warnSpy.mockRestore();
    }
  });
});
