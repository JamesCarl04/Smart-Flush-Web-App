import {
  ISSUE_REPORT_CATEGORIES,
  createPublicReportFingerprint,
  extractClientIp,
  isIssueReportImageMime,
  sanitizePublicDevice,
  validatePhotoCaptureMetadata,
  validateIssueReportInput,
  validateIssueReportPhoto,
} from '@/lib/public-issue-reports';

const now = 1_800_000_000_000;

describe('public issue report validation', () => {
  it('recognizes only the supported durable evidence MIME values', () => {
    expect(isIssueReportImageMime('image/jpeg')).toBe(true);
    expect(isIssueReportImageMime('image/png')).toBe(true);
    expect(isIssueReportImageMime('image/webp')).toBe(true);
    expect(isIssueReportImageMime('text/plain')).toBe(false);
    expect(isIssueReportImageMime(null)).toBe(false);
  });

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

  it('resolves SDCA Annex stall devices directly from inventory when unprovisioned in DB', () => {
    const stallDevice = sanitizePublicDevice('SDCA-FL1-CANTEEN-M-S01', null);
    expect(stallDevice).toEqual({
      id: 'SDCA-FL1-CANTEEN-M-S01',
      name: 'SDCA Annex 1F Canteen Male Restroom • Stall 1',
      building: 'SDCA Annex',
      floor: '1F',
      location: '1F • SDCA Annex 1F Canteen Male Restroom • Stall 1',
      stallId: 'SDCA-FL1-CANTEEN-M-S01',
      stallNumber: '1',
      isSmartHardware: false,
      isCommonArea: false,
    });
  });

  it('resolves SDCA Annex common area entrance devices directly from inventory', () => {
    const commonDevice = sanitizePublicDevice('SDCA-FL2-M1', null);
    expect(commonDevice).toEqual({
      id: 'SDCA-FL2-M1',
      name: 'SDCA Annex 2F Male Restroom 1 • Common Area',
      building: 'SDCA Annex',
      floor: '2F',
      location: '2F • SDCA Annex 2F Male Restroom 1 • Sinks & Entrance',
      isSmartHardware: false,
      isCommonArea: true,
    });
  });

  it('extracts the configured platform IP and fingerprints it without returning the raw value', () => {
    const headers = new Headers({
      'x-forwarded-for': '198.51.100.5, 10.0.0.1',
      'x-real-ip': '198.51.100.4',
      'x-vercel-forwarded-for': '198.51.100.3',
      'cf-connecting-ip': '198.51.100.2',
    });

    const ip = extractClientIp(headers, 'x-vercel-forwarded-for');
    const fingerprint = createPublicReportFingerprint(ip, 'test-secret');

    expect(ip).toBe('198.51.100.3');
    expect(fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(fingerprint).not.toContain('198.51.100.2');
    expect(() => createPublicReportFingerprint(ip, '')).toThrow('configuration');

    const multiIpHeaders = new Headers({
      'x-vercel-forwarded-for': '203.0.113.195, 76.76.21.21',
    });
    expect(extractClientIp(multiIpHeaders, 'x-vercel-forwarded-for')).toBe('203.0.113.195');
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

  it('validates camera metadata and permits an explicit no-photo fallback', () => {
    expect(validatePhotoCaptureMetadata({ photoCaptureStatus: 'unavailable' }, null, now)).toEqual({
      photoCaptureStatus: 'unavailable',
      photoCapturedAt: null,
    });
    expect(validatePhotoCaptureMetadata({ photoCaptureStatus: 'captured', photoCapturedAt: now - 1_000 }, {
      bytes: Buffer.from([0xff, 0xd8, 0xff]), contentType: 'image/jpeg', size: 3,
    }, now)).toEqual({ photoCaptureStatus: 'captured', photoCapturedAt: now - 1_000 });
    expect(() => validatePhotoCaptureMetadata({ photoCaptureStatus: 'captured' }, null, now)).toThrow('captured photo');
    expect(() => validatePhotoCaptureMetadata({ photoCaptureStatus: 'unavailable', photoCapturedAt: now }, null, now)).toThrow('capture time');
    expect(() => validatePhotoCaptureMetadata({ photoCaptureStatus: 'captured', photoCapturedAt: now + 5 * 60 * 1_000 + 1 }, {
      bytes: Buffer.from([0xff, 0xd8, 0xff]), contentType: 'image/jpeg', size: 3,
    }, now)).toThrow('capture time');
  });
});
