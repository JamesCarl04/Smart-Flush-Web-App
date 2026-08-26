import {
  ISSUE_REPORT_CATEGORIES,
  createPublicReportFingerprint,
  extractClientIp,
  sanitizePublicDevice,
  validateIssueReportInput,
  validateIssueReportPhoto,
} from '@/lib/public-issue-reports';

const now = 1_800_000_000_000;

describe('public issue report validation', () => {
  it('accepts every supported category and trims an optional description', () => {
    for (const category of ISSUE_REPORT_CATEGORIES) {
      expect(
        validateIssueReportInput(
          { category, description: '  Needs attention  ', website: '', startedAt: String(now - 3_000) },
          now,
        ),
      ).toEqual({ category, description: 'Needs attention' });
    }
  });

  it.each(['unknown', '', null, 7])('rejects unsupported categories: %p', (category) => {
    expect(() =>
      validateIssueReportInput(
        { category, description: '', website: '', startedAt: String(now - 3_000) },
        now,
      ),
    ).toThrow('category');
  });

  it('rejects descriptions longer than 500 characters', () => {
    expect(() =>
      validateIssueReportInput(
        {
          category: 'blockage_or_dirty',
          description: 'x'.repeat(501),
          website: '',
          startedAt: String(now - 3_000),
        },
        now,
      ),
    ).toThrow('500');
  });

  it('silently rejects a filled honeypot and submissions completed before three seconds', () => {
    expect(() =>
      validateIssueReportInput(
        { category: 'no_water', description: '', website: 'bot', startedAt: String(now - 5_000) },
        now,
      ),
    ).toThrow('Unable to submit report');

    expect(() =>
      validateIssueReportInput(
        { category: 'no_water', description: '', website: '', startedAt: String(now - 2_999) },
        now,
      ),
    ).toThrow('Unable to submit report');
  });

  it('rejects missing, malformed, and future form-start timestamps', () => {
    for (const startedAt of [undefined, 'not-a-number', String(now + 1)]) {
      expect(() =>
        validateIssueReportInput(
          { category: 'physical_damage', description: '', website: '', startedAt },
          now,
        ),
      ).toThrow('Unable to submit report');
    }
  });

  it('accepts a legacy enabled device and exposes only public location fields', () => {
    expect(
      sanitizePublicDevice('toilet-01', {
        name: 'North Restroom',
        building: 'Annex',
        floor: '4',
        location: 'North wing',
        firmwareVersion: 'secret-ish',
        config: { token: 'never-public' },
      }),
    ).toEqual({
      id: 'toilet-01',
      name: 'North Restroom',
      building: 'Annex',
      floor: '4',
      location: 'North wing',
    });
  });

  it('rejects explicitly disabled and nonexistent public-report devices', () => {
    expect(() => sanitizePublicDevice('missing', null)).toThrow('unavailable');
    expect(() =>
      sanitizePublicDevice('disabled', { name: 'Disabled', publicReportingEnabled: false }),
    ).toThrow('unavailable');
  });

  it('extracts the preferred platform IP and fingerprints it without returning the raw value', () => {
    const headers = new Headers({
      'x-forwarded-for': '198.51.100.5, 10.0.0.1',
      'x-real-ip': '198.51.100.4',
      'x-vercel-forwarded-for': '198.51.100.3, 10.0.0.2',
      'cf-connecting-ip': '198.51.100.2',
    });

    const ip = extractClientIp(headers);
    const fingerprint = createPublicReportFingerprint(ip, 'test-secret');

    expect(ip).toBe('198.51.100.2');
    expect(fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(fingerprint).not.toContain('198.51.100.2');
    expect(() => createPublicReportFingerprint(ip, '')).toThrow('configuration');
  });

  it('accepts JPEG, PNG, and WebP magic bytes independently of the filename extension', async () => {
    const files = [
      new File([Uint8Array.from([0xff, 0xd8, 0xff, 0xe0])], 'photo.txt', { type: 'image/jpeg' }),
      new File(
        [Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
        'photo.bin',
        { type: 'image/png' },
      ),
      new File(
        [Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])],
        'photo.dat',
        { type: 'image/webp' },
      ),
    ];

    await expect(Promise.all(files.map(validateIssueReportPhoto))).resolves.toHaveLength(3);
  });

  it('rejects oversized, unsupported-MIME, and spoofed-magic uploads', async () => {
    const oversized = {
      name: 'large.jpg',
      type: 'image/jpeg',
      size: 5 * 1024 * 1024 + 1,
      arrayBuffer: async () => Uint8Array.from([0xff, 0xd8, 0xff]).buffer,
    } as File;

    await expect(validateIssueReportPhoto(oversized)).rejects.toThrow('5 MB');
    await expect(
      validateIssueReportPhoto(new File(['text'], 'photo.jpg', { type: 'text/plain' })),
    ).rejects.toThrow('JPEG, PNG, or WebP');
    await expect(
      validateIssueReportPhoto(new File(['not jpeg'], 'photo.jpg', { type: 'image/jpeg' })),
    ).rejects.toThrow('contents');
  });
});
