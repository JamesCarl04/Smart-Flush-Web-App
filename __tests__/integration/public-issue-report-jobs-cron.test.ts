import { createPublicIssueReportJobsCronHandler } from '@/app/api/cron/public-issue-report-jobs/route';

function cronRequest(authorization?: string): Request {
  return new Request('http://localhost/api/cron/public-issue-report-jobs', {
    headers: authorization ? { authorization } : {},
  });
}

describe('GET /api/cron/public-issue-report-jobs', () => {
  it('fails closed when CRON_SECRET is not configured', async () => {
    const runBatch = jest.fn();
    const handler = createPublicIssueReportJobsCronHandler({
      secret: '',
      runBatch,
    });

    const response = await handler(cronRequest('Bearer anything'));

    expect(response.status).toBe(503);
    expect(runBatch).not.toHaveBeenCalled();
  });

  it.each([undefined, 'Bearer wrong-secret', 'Basic cron-secret'])(
    'rejects an unauthorized scheduler request: %p',
    async (authorization) => {
      const runBatch = jest.fn();
      const handler = createPublicIssueReportJobsCronHandler({
        secret: 'cron-secret',
        runBatch,
      });

      const response = await handler(cronRequest(authorization));

      expect(response.status).toBe(401);
      expect(runBatch).not.toHaveBeenCalled();
    },
  );

  it('runs one bounded recovery batch for an exact bearer secret', async () => {
    const runBatch = jest.fn().mockResolvedValue({
      evidenceProcessed: 4,
      notificationsProcessed: 2,
    });
    const handler = createPublicIssueReportJobsCronHandler({
      secret: 'cron-secret',
      runBatch,
    });

    const response = await handler(cronRequest('Bearer cron-secret'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      data: { evidenceProcessed: 4, notificationsProcessed: 2 },
    });
    expect(runBatch).toHaveBeenCalledTimes(1);
  });
});
