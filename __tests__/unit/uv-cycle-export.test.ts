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

jest.mock('@/lib/rate-limit', () => ({
  checkRateLimit: jest.fn(() => ({ success: true, remaining: 10 })),
  RATE_LIMITS: { reports: { limit: 20, windowMs: 60_000 } },
  createRateLimitResponse: jest.fn(),
}));

import { POST as generateReport } from '@/app/api/reports/generate/route';
import { GET as getUvCycles } from '@/app/api/analytics/uv-cycles/route';
import {
  buildUvCycleRangeReport,
  buildUvCyclesReportCsv,
} from '@/lib/uv-cycle-analytics';

describe('UV Cycle Export Pipeline (CSV / JSON / PDF & Custom Range Preview)', () => {
  const sampleFirestoreUvDocs = [
    {
      id: 'uv-1',
      data: () => ({
        id: 'uv-1',
        deviceId: 'toilet-01',
        duration: 5,
        completed: true,
        reason: null,
        timestamp: {
          toMillis: () => Date.parse('2026-11-18T22:27:21.000+08:00'),
        },
      }),
    },
    {
      id: 'uv-2',
      data: () => ({
        id: 'uv-2',
        deviceId: 'toilet-01',
        duration: 5,
        completed: true,
        reason: null,
        timestamp: {
          toMillis: () => Date.parse('2026-11-19T18:59:10.000+08:00'),
        },
      }),
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockVerifyAuthToken.mockResolvedValue({ uid: 'admin-1', role: 'admin' });
    mockRequireSupervisorOrAdmin.mockResolvedValue(undefined);

    mockCollection.mockImplementation((name: string) => {
      if (name === 'reports') {
        return {
          doc: jest.fn(() => ({
            id: 'report-doc-1',
            set: jest.fn().mockResolvedValue(undefined),
          })),
        };
      }
      return {
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ docs: sampleFirestoreUvDocs }),
      };
    });
  });

  it('neutralizes CSV spreadsheet formula injection in UV export cells', () => {
    const report = buildUvCycleRangeReport({
      records: [
        {
          id: 'uv-inj',
          deviceId: 'toilet-01',
          duration: 3,
          completed: false,
          reason: '=CMD|calc',
          timestampMs: Date.parse('2026-11-19T18:59:10.000+08:00'),
        },
      ],
      from: '2026-11-19',
      to: '2026-11-19',
      nowMs: Date.parse('2026-11-19T22:00:00.000+08:00'),
    });

    const csv = buildUvCyclesReportCsv(report);
    expect(csv).toContain("'=CMD|calc");
    expect(csv).toContain('2026-11-19,18:59:10,18,59,10,3,Interrupted');
  });

  it('generates CSV download with summary, time-series, and exact HH:mm:ss logs via POST /api/reports/generate', async () => {
    const req = new Request('http://localhost:3000/api/reports/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'uv_cycles',
        from: '2026-11-18',
        to: '2026-11-19',
        format: 'csv',
      }),
    });

    const res = await generateReport(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/csv');
    expect(res.headers.get('Content-Disposition')).toContain(
      'smart-flush-uv-cycles-2026-11-18-2026-11-19.csv',
    );

    const csv = await res.text();
    expect(csv).toContain('--- UV SANITIZATION CYCLE SUMMARY ---');
    expect(csv).toContain('Cycles in Selected Range,2');
    expect(csv).toContain('--- LINE GRAPH TIME-SERIES BREAKDOWN ---');
    expect(csv).toContain('--- VERIFIED UV CYCLE LOGS (PHT UTC+8) ---');
    expect(csv).toContain('2026-11-18,22:27:21');
    expect(csv).toContain('2026-11-19,18:59:10');
  });

  it('generates JSON and PDF downloads for type: uv_cycles', async () => {
    const jsonReq = new Request('http://localhost:3000/api/reports/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'uv_cycles',
        from: '2026-11-19',
        to: '2026-11-19',
        format: 'json',
        granularity: 'second',
      }),
    });

    const jsonRes = await generateReport(jsonReq);
    expect(jsonRes.status).toBe(200);
    const jsonPayload = await jsonRes.json();
    expect(jsonPayload.bucketMode).toBe('second');
    expect(jsonPayload.summary.totalCycles).toBe(1);
    expect(jsonPayload.logs[0].phtTime).toBe('18:59:10');

    const pdfReq = new Request('http://localhost:3000/api/reports/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'uv_cycles',
        from: '2026-11-18',
        to: '2026-11-19',
        format: 'pdf',
      }),
    });

    const pdfRes = await generateReport(pdfReq);
    expect(pdfRes.status).toBe(200);
    expect(pdfRes.headers.get('Content-Type')).toBe('application/pdf');
    const pdfBytes = Buffer.from(await pdfRes.arrayBuffer()).toString('binary');
    expect(pdfBytes.startsWith('%PDF-1.4')).toBe(true);
    expect(pdfBytes.includes('UV Sanitization Cycle Activity Report')).toBe(true);
    expect(pdfBytes.includes('DOCUMENT CONTROL')).toBe(true);
    expect(pdfBytes.includes('18:59:10')).toBe(true);
    expect(pdfBytes.includes('--- END OF LABORATORY REPORT ---')).toBe(true);
  });

  it('validates custom range preview on GET /api/analytics/uv-cycles?from=...&to=...', async () => {
    const req = new Request(
      'http://localhost:3000/api/analytics/uv-cycles?from=2026-11-18&to=2026-11-19',
    );
    const res = await getUvCycles(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.bucketMode).toBe('day');
    expect(json.data.summary.totalCycles).toBe(2);
    expect(json.data.series).toHaveLength(2);
  });

  it('rejects invalid granularity or deviceId on POST /api/reports/generate', async () => {
    const badReq = new Request('http://localhost:3000/api/reports/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'uv_cycles',
        from: '2026-11-19',
        to: '2026-11-19',
        format: 'csv',
        granularity: 'century',
      }),
    });
    const res = await generateReport(badReq);
    expect(res.status).toBe(400);
  });
});
