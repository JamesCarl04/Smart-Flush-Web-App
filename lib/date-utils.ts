// lib/date-utils.ts
// Shared ISO YYYY-MM-DD calendar date validation and UTC range enumeration helpers.

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Verifies that a string matches YYYY-MM-DD and represents a real calendar date.
 */
export function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) {
    return false;
  }
  const [year, month, day] = value.split('-').map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  return (
    utc.getUTCFullYear() === year &&
    utc.getUTCMonth() === month - 1 &&
    utc.getUTCDate() === day
  );
}

/**
 * Validates an inclusive YYYY-MM-DD date range and optionally enforces a maximum day span.
 */
export function validateIsoDateRange(
  from: string,
  to: string,
  maxDays?: number,
): { ok: true; dayCount: number } | { ok: false; error: string } {
  if (!isValidIsoDate(from) || !isValidIsoDate(to)) {
    return { ok: false, error: 'from and to must be valid YYYY-MM-DD dates' };
  }
  const startMs = Date.parse(`${from}T00:00:00.000Z`);
  const endMs = Date.parse(`${to}T00:00:00.000Z`);
  if (startMs > endMs) {
    return { ok: false, error: 'from date must not be after to date' };
  }
  const dayCount = Math.floor((endMs - startMs) / 86_400_000) + 1;
  if (typeof maxDays === 'number' && dayCount > maxDays) {
    return { ok: false, error: `Date range must not exceed ${maxDays} days` };
  }
  return { ok: true, dayCount };
}

/**
 * Enumerates all inclusive YYYY-MM-DD dates between validated bounds in UTC.
 */
export function enumerateIsoDateRange(from: string, to: string): string[] {
  const dates: string[] = [];
  const current = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);

  while (current <= end) {
    dates.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return dates;
}
