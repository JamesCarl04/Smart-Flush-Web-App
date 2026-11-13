import {
  enumerateIsoDateRange,
  isValidIsoDate,
  validateIsoDateRange,
} from '@/lib/date-utils';

describe('date-utils', () => {
  describe('isValidIsoDate', () => {
    it('accepts valid YYYY-MM-DD calendar dates including leap days', () => {
      expect(isValidIsoDate('2026-11-13')).toBe(true);
      expect(isValidIsoDate('2024-02-29')).toBe(true);
    });

    it('rejects malformed strings and impossible calendar dates', () => {
      expect(isValidIsoDate('')).toBe(false);
      expect(isValidIsoDate('2026/11/13')).toBe(false);
      expect(isValidIsoDate('2026-02-30')).toBe(false);
      expect(isValidIsoDate('2025-02-29')).toBe(false);
      expect(isValidIsoDate('2026-04-31')).toBe(false);
      expect(isValidIsoDate('2026-13-01')).toBe(false);
    });
  });

  describe('validateIsoDateRange', () => {
    it('returns inclusive day count for valid ranges', () => {
      expect(validateIsoDateRange('2026-11-01', '2026-11-01')).toEqual({
        ok: true,
        dayCount: 1,
      });
      expect(validateIsoDateRange('2026-11-01', '2026-11-07', 366)).toEqual({
        ok: true,
        dayCount: 7,
      });
    });

    it('rejects invalid dates, inverted ranges, and oversized ranges', () => {
      expect(validateIsoDateRange('2026-02-30', '2026-03-01')).toEqual({
        ok: false,
        error: 'from and to must be valid YYYY-MM-DD dates',
      });
      expect(validateIsoDateRange('2026-11-10', '2026-11-01')).toEqual({
        ok: false,
        error: 'from date must not be after to date',
      });
      expect(validateIsoDateRange('2025-01-01', '2026-01-02', 366)).toEqual({
        ok: false,
        error: 'Date range must not exceed 366 days',
      });
    });
  });

  describe('enumerateIsoDateRange', () => {
    it('enumerates inclusive UTC dates across month and year boundaries', () => {
      expect(enumerateIsoDateRange('2025-12-30', '2026-01-02')).toEqual([
        '2025-12-30',
        '2025-12-31',
        '2026-01-01',
        '2026-01-02',
      ]);
    });
  });
});
