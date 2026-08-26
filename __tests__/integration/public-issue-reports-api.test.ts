import { createPublicIssueReportPostHandler } from '@/app/api/public/issue-reports/route';
import { PublicIssueReportError } from '@/lib/public-issue-reports';

function multipartRequest(
  fields: Record<string, string | File>,
  headers: Record<string, string> = {},
): Request {
  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) body.set(key, value);
  return new Request('http://localhost/api/public/issue-reports', {
    method: 'POST',
    headers,
    body,
  });
}

const startedAt = '1799999997000';

describe('POST /api/public/issue-reports', () => {
  it('fails closed before persistence when the fingerprint secret is missing', async () => {
    const submit = jest.fn();
    const handler = createPublicIssueReportPostHandler({
      secret: '',
      now: () => 1_800_000_000_000,
      submit,
    });

    const response = await handler(
      multipartRequest(
        { deviceId: 'toilet-01', category: 'no_water', startedAt },
        { 'x-vercel-forwarded-for': '198.51.100.1' },
      ),
    );

    expect(response.status).toBe(503);
    expect(submit).not.toHaveBeenCalled();
  });

  it('accepts multipart input and passes only anonymous validated data to persistence', async () => {
    const submit = jest.fn().mockResolvedValue({
      aggregateId: 'internal-report-id',
      submissionId: 'internal-submission-id',
      referenceCode: 'IR-ABC12345',
      confirmationCount: 1,
    });
    const handler = createPublicIssueReportPostHandler({
      secret: 'test-secret',
      now: () => 1_800_000_000_000,
      submit,
    });

    const response = await handler(
      multipartRequest(
        {
          deviceId: 'toilet-01',
          category: 'continuous_leak',
          description: '  Water keeps running  ',
          website: '',
          startedAt,
          name: 'Must be ignored',
          email: 'must-not-be-collected@example.com',
          photo: new File(
            [Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
            'evidence.exe',
            { type: 'image/png' },
          ),
        },
        { 'x-vercel-forwarded-for': '198.51.100.12' },
      ),
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      success: true,
      data: {
        referenceCode: 'IR-ABC12345',
        confirmation: 'Your report has been received for administrator review.',
      },
    });
    expect(submit).toHaveBeenCalledWith({
      deviceId: 'toilet-01',
      category: 'continuous_leak',
      description: 'Water keeps running',
      fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
      photo: expect.objectContaining({ contentType: 'image/png', size: 8 }),
    });
    const serializedCall = JSON.stringify(submit.mock.calls[0][0]);
    expect(serializedCall).not.toContain('198.51.100.12');
    expect(serializedCall).not.toContain('must-not-be-collected');
  });

  it('rejects honeypot and too-fast submissions before persistence', async () => {
    const submit = jest.fn();
    const handler = createPublicIssueReportPostHandler({
      secret: 'test-secret',
      now: () => 1_800_000_000_000,
      submit,
    });

    for (const fields of [
      { deviceId: 'toilet-01', category: 'no_water', website: 'robot', startedAt },
      {
        deviceId: 'toilet-01',
        category: 'no_water',
        website: '',
        startedAt: '1799999997001',
      },
    ]) {
      const response = await handler(
        multipartRequest(fields, { 'x-vercel-forwarded-for': '198.51.100.13' }),
      );
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        success: false,
        error: 'Unable to submit report',
      });
    }
    expect(submit).not.toHaveBeenCalled();
  });

  it('returns 429 generically without exposing fingerprint data', async () => {
    const submit = jest.fn().mockRejectedValue(
      new PublicIssueReportError(
        'Too many reports. Please try again later.',
        429,
        'rate_limited',
      ),
    );
    const handler = createPublicIssueReportPostHandler({
      secret: 'test-secret',
      now: () => 1_800_000_000_000,
      submit,
    });

    const response = await handler(
      multipartRequest(
        { deviceId: 'toilet-01', category: 'no_water', website: '', startedAt },
        { 'x-vercel-forwarded-for': '198.51.100.14' },
      ),
    );

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('600');
    const body = JSON.stringify(await response.json());
    expect(body).not.toContain('fingerprint');
    expect(body).not.toContain('198.51.100.14');
  });

  it('rejects missing client address and invalid image contents without persisting', async () => {
    const submit = jest.fn();
    const handler = createPublicIssueReportPostHandler({
      secret: 'test-secret',
      now: () => 1_800_000_000_000,
      submit,
    });

    const noAddress = await handler(
      multipartRequest({ deviceId: 'toilet-01', category: 'no_water', startedAt }),
    );
    expect(noAddress.status).toBe(400);

    const spoofed = await handler(
      multipartRequest(
        {
          deviceId: 'toilet-01',
          category: 'no_water',
          startedAt,
          photo: new File(['plain text'], 'fake.jpg', { type: 'image/jpeg' }),
        },
        { 'x-vercel-forwarded-for': '198.51.100.15' },
      ),
    );
    expect(spoofed.status).toBe(400);
    expect(submit).not.toHaveBeenCalled();
  });

  it('rejects malformed device identifiers before Firestore is addressed', async () => {
    const submit = jest.fn();
    const handler = createPublicIssueReportPostHandler({
      secret: 'test-secret',
      now: () => 1_800_000_000_000,
      submit,
    });

    const response = await handler(
      multipartRequest(
        { deviceId: '../users/admin', category: 'no_water', startedAt },
        { 'x-vercel-forwarded-for': '198.51.100.16' },
      ),
    );

    expect(response.status).toBe(400);
    expect(submit).not.toHaveBeenCalled();
  });

  it('uses only the configured Vercel client-IP header and ignores spoofable alternatives', async () => {
    const submit = jest.fn().mockResolvedValue({
      aggregateId: 'report-1',
      submissionId: 'submission-1',
      referenceCode: 'IR-REPORT1',
      confirmationCount: 1,
    });
    const handler = createPublicIssueReportPostHandler({
      secret: 'test-secret',
      trustedIpHeader: 'x-vercel-forwarded-for',
      now: () => 1_800_000_000_000,
      submit,
    });
    const fields = { deviceId: 'toilet-01', category: 'no_water', startedAt };

    await handler(
      multipartRequest(fields, {
        'x-vercel-forwarded-for': '198.51.100.20',
        'cf-connecting-ip': '203.0.113.1',
        'x-real-ip': '203.0.113.2',
        'x-forwarded-for': '203.0.113.3',
      }),
    );
    await handler(
      multipartRequest(fields, {
        'x-vercel-forwarded-for': '198.51.100.20',
        'cf-connecting-ip': '203.0.113.101',
        'x-real-ip': '203.0.113.102',
        'x-forwarded-for': '203.0.113.103',
      }),
    );

    expect(submit).toHaveBeenCalledTimes(2);
    expect(submit.mock.calls[0][0].fingerprint).toBe(
      submit.mock.calls[1][0].fingerprint,
    );
  });

  it('fails closed when the configured authoritative IP header is absent or invalid', async () => {
    const submit = jest.fn();
    const handler = createPublicIssueReportPostHandler({
      secret: 'test-secret',
      trustedIpHeader: 'x-vercel-forwarded-for',
      now: () => 1_800_000_000_000,
      submit,
    });
    const fields = { deviceId: 'toilet-01', category: 'no_water', startedAt };

    const absent = await handler(
      multipartRequest(fields, { 'cf-connecting-ip': '198.51.100.21' }),
    );
    const invalid = await handler(
      multipartRequest(fields, {
        'x-vercel-forwarded-for': 'not-an-ip',
        'x-real-ip': '198.51.100.22',
      }),
    );

    expect(absent.status).toBe(400);
    expect(invalid.status).toBe(400);
    expect(submit).not.toHaveBeenCalled();
  });

  it('rejects unapproved generic proxy header configuration', async () => {
    const submit = jest.fn();
    const handler = createPublicIssueReportPostHandler({
      secret: 'test-secret',
      trustedIpHeader: 'x-forwarded-for',
      now: () => 1_800_000_000_000,
      submit,
    });

    const response = await handler(
      multipartRequest(
        { deviceId: 'toilet-01', category: 'no_water', startedAt },
        { 'x-forwarded-for': '198.51.100.23' },
      ),
    );

    expect(response.status).toBe(503);
    expect(submit).not.toHaveBeenCalled();
  });

  it('rejects an oversized declared request before multipart parsing', async () => {
    const submit = jest.fn();
    const formData = jest.fn();
    const handler = createPublicIssueReportPostHandler({
      secret: 'test-secret',
      trustedIpHeader: 'x-vercel-forwarded-for',
      maxRequestBytes: 100,
      now: () => 1_800_000_000_000,
      submit,
    });
    const request = {
      headers: new Headers({
        'content-length': '101',
        'x-vercel-forwarded-for': '198.51.100.24',
      }),
      formData,
    } as unknown as Request;

    const response = await handler(request);

    expect(response.status).toBe(413);
    expect(formData).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });

  it('enforces the request-size ceiling after parsing when Content-Length is absent', async () => {
    const submit = jest.fn();
    const handler = createPublicIssueReportPostHandler({
      secret: 'test-secret',
      trustedIpHeader: 'x-vercel-forwarded-for',
      maxRequestBytes: 100,
      now: () => 1_800_000_000_000,
      submit,
    });

    const response = await handler(
      multipartRequest(
        {
          deviceId: 'toilet-01',
          category: 'no_water',
          startedAt,
          ignoredPadding: 'x'.repeat(101),
        },
        { 'x-vercel-forwarded-for': '198.51.100.25' },
      ),
    );

    expect(response.status).toBe(413);
    expect(submit).not.toHaveBeenCalled();
  });
});
