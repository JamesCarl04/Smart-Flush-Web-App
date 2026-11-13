import { expect, test } from '@playwright/test';

const PROTECTED_ROUTES = [
  '/dashboard',
  '/tasks',
  '/alerts',
  '/analytics',
  '/reports',
  '/issue-reports',
  '/configuration',
  '/staff',
  '/profile',
];

test.describe('Dashboard Unauthenticated Navigation Guards', () => {
  for (const routePath of PROTECTED_ROUTES) {
    test(`redirects unauthenticated visitor on ${routePath} to login`, async ({
      page,
    }) => {
      test.setTimeout(60_000);
      await page.goto(routePath);
      await expect(page).toHaveURL(/\/portal-admin\/login/, {
        timeout: 30_000,
      });
    });
  }
});

test.describe('API Authentication & Fail-Closed Boundaries', () => {
  test('rejects unauthenticated actuator commands with 401', async ({
    request,
  }) => {
    const actuatorCalls: Array<{ path: string; data: Record<string, unknown> }> = [
      { path: '/api/actuators/pump', data: { action: 'flush' } },
      { path: '/api/actuators/uv', data: { action: 'start' } },
      { path: '/api/actuators/lid/open', data: {} },
      { path: '/api/actuators/lid/close', data: {} },
      { path: '/api/actuators/reset', data: {} },
    ];

    for (const call of actuatorCalls) {
      const response = await request.post(call.path, { data: call.data });
      expect(response.status()).toBe(401);
    }
  });

  test('rejects unauthenticated protected management endpoints with 401', async ({
    request,
  }) => {
    test.setTimeout(120_000);
    const getRoutes = [
      '/api/staff',
      '/api/devices',
      '/api/tasks',
      '/api/alerts',
      '/api/automation-rules',
      '/api/public/issue-reports',
      '/api/sensors/SDCA-FL1-CANTEEN-M/readings?from=2026-11-01&to=2026-11-07',
      '/api/analytics/water-usage?from=2026-11-01&to=2026-11-07',
      '/api/analytics/flush-patterns?from=2026-11-01&to=2026-11-07',
      '/api/analytics/system-performance?from=2026-11-01&to=2026-11-07',
    ];

    for (const url of getRoutes) {
      const response = await request.get(url);
      expect(response.status()).toBe(401);
    }

    // Cron fails closed: 401 when CRON_SECRET is set, or 503 when unset locally.
    const cronResponse = await request.get('/api/cron/public-issue-report-jobs');
    expect([401, 503]).toContain(cronResponse.status());

    const postRoutes = [
      { url: '/api/staff', data: { email: 'x@example.com' } },
      { url: '/api/tasks', data: { deviceId: 'SDCA-FL1-CANTEEN-M' } },
      { url: '/api/reports/generate', data: { type: 'daily', from: '2026-11-01', to: '2026-11-01', format: 'csv' } },
      { url: '/api/issue-reports/sample-id/confirm', data: {} },
      { url: '/api/issue-reports/sample-id/dismiss', data: {} },
      { url: '/api/auth/register', data: { role: 'admin' } },
      { url: '/api/tasks/register-token', data: { fcmToken: 'abc' } },
    ];

    for (const entry of postRoutes) {
      const response = await request.post(entry.url, { data: entry.data });
      expect(response.status()).toBe(401);
    }
  });
});

test.describe('Security Headers & CORS Enforcement', () => {
  test.beforeEach(() => {
    test.setTimeout(60_000);
  });
  test('sets mandatory security headers on public and portal HTML responses', async ({
    page,
  }) => {
    for (const target of ['/', '/portal-admin/login', '/report/nonexistent-device-id']) {
      const response = await page.goto(target);
      expect(response).not.toBeNull();
      const headers = (await response?.allHeaders()) ?? {};

      expect(headers['x-content-type-options']).toBe('nosniff');
      expect(headers['x-frame-options']).toMatch(/SAMEORIGIN|DENY/i);
      expect(headers['content-security-policy']).toContain("default-src 'self'");
      expect(headers['content-security-policy']).toContain("frame-ancestors 'self'");

      const serverHeader = (headers['server'] || '').toLowerCase();
      expect(serverHeader).not.toContain('express');
    }
  });

  test('does not allow arbitrary cross-origin CORS access', async ({
    request,
  }) => {
    const response = await request.get('/api/devices', {
      headers: { Origin: 'https://malicious.example' },
    });

    const allowOrigin = response.headers()['access-control-allow-origin'];
    expect(allowOrigin).not.toBe('https://malicious.example');
    expect(allowOrigin).not.toBe('*');
  });
});
