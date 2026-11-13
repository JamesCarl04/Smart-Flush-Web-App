import { expect, test } from '@playwright/test';

test.describe('Public Landing & QR Intake Gate', () => {
  test('renders public landing without auto-redirect or auth cookies', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.goto('/');

    await expect(
      page.getByRole('heading', { name: 'Restroom Intelligence System' }),
    ).toBeVisible();
    await expect(page.getByText('Reporting a Restroom Issue?')).toBeVisible();

    const cookies = await page.context().cookies();
    expect(cookies.find((c) => c.name === 'auth-token')).toBeUndefined();
  });

  test('renders unavailable state cleanly for nonexistent device QR route', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.goto('/report/nonexistent-device-id');

    await expect(
      page.getByRole('heading', { name: 'Reporting unavailable' }),
    ).toBeVisible();
    await expect(
      page.getByText('This restroom is not accepting public reports.'),
    ).toBeVisible();
  });
});

test.describe('Admin Portal Authentication Flow', () => {
  test.beforeEach(() => {
    test.setTimeout(60_000);
  });

  test('renders login controls and interactive password/theme toggles', async ({
    page,
  }) => {
    await page.goto('/portal-admin/login');

    await expect(
      page.getByRole('heading', { name: 'Welcome to Klir' }),
    ).toBeVisible();

    const emailInput = page.locator('#login-email');
    const passwordInput = page.locator('#login-password');
    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
    await expect(passwordInput).toHaveAttribute('type', 'password');

    await page.getByRole('button', { name: 'Show password' }).click();
    await expect(passwordInput).toHaveAttribute('type', 'text');
    await page.getByRole('button', { name: 'Hide password' }).click();
    await expect(passwordInput).toHaveAttribute('type', 'password');

    const beforeTheme = await page.evaluate(() => ({
      className: document.documentElement.className,
      dataTheme: document.documentElement.getAttribute('data-theme'),
    }));
    await page.getByRole('button', { name: 'Toggle theme' }).click();
    const afterTheme = await page.evaluate(() => ({
      className: document.documentElement.className,
      dataTheme: document.documentElement.getAttribute('data-theme'),
    }));
    expect(afterTheme).not.toEqual(beforeTheme);
  });

  test('shows client validation feedback for empty and short passwords', async ({
    page,
  }) => {
    await page.goto('/portal-admin/login');

    await page.getByRole('button', { name: /Login to Dashboard/i }).click();
    await expect(page.getByText('Email is required')).toBeVisible();
    await expect(page.getByText('Password is required')).toBeVisible();

    await page.fill('#login-email', 'admin@sdca.edu.ph');
    await page.fill('#login-password', 'short');
    await page.getByRole('button', { name: /Login to Dashboard/i }).click();
    await expect(
      page.getByText('Password must be at least 8 characters'),
    ).toBeVisible();
  });

  test('shows admin-only notice when redirected from non-admin session', async ({
    page,
  }) => {
    await page.goto('/portal-admin/login?error=admin-only');

    const alert = page.locator('[role="alert"]:not(#__next-route-announcer__)');
    await expect(alert).toBeVisible();
    await expect(alert).toContainText('reserved exclusively for Administrators');
  });

  test('prevents user enumeration on invalid credentials', async ({
    page,
  }) => {
    await page.route('**/identitytoolkit.googleapis.com/**', async (route) => {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          error: {
            code: 400,
            message: 'INVALID_LOGIN_CREDENTIALS',
          },
        }),
      });
    });

    await page.goto('/portal-admin/login');
    await page.fill('#login-email', 'nonexistent@sdca.edu.ph');
    await page.fill('#login-password', 'WrongPassword123!');
    await page.getByRole('button', { name: /Login to Dashboard/i }).click();

    const alert = page.locator('[role="alert"]:not(#__next-route-announcer__)');
    await expect(alert).toBeVisible();
    await expect(alert).toContainText(/invalid email or password/i);
    const text = (await alert.textContent()) || '';
    expect(text).not.toMatch(/user not found/i);
  });

  test('navigates to forgot-password and validates reset links cleanly', async ({
    page,
  }) => {
    await page.goto('/portal-admin/login');
    const forgotLink = page.getByRole('link', { name: 'Forgot password?' });
    await expect(forgotLink).toHaveAttribute('href', '/portal-admin/forgot-password');
    await Promise.all([
      page.waitForURL(/\/portal-admin\/forgot-password/, { timeout: 25_000 }),
      forgotLink.click(),
    ]);

    await page.locator('button[type="submit"]').click();
    await expect(page.getByText('Email address is required')).toBeVisible();

    await page.goto('/portal-admin/reset-password');
    const resetAlert = page.locator('[role="alert"]:not(#__next-route-announcer__)');
    await expect(resetAlert).toBeVisible();
    await expect(resetAlert).toContainText('missing a security token');
  });

  test('blocks unauthenticated self-registration on portal-admin/register', async ({
    page,
  }) => {
    await page.goto('/portal-admin/register');
    await expect(
      page.getByRole('heading', { name: 'Registration Restricted' }),
    ).toBeVisible();
    await expect(
      page.locator('form, input[type="email"], input[type="password"]'),
    ).toHaveCount(0);
    await page.getByRole('link', { name: 'Return to Login' }).click();
    await expect(page).toHaveURL(/\/portal-admin\/login/);
  });
});
