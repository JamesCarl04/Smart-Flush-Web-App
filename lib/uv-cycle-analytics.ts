// lib/uv-cycle-analytics.ts
// Pure PHT (UTC+8) aggregation and time-series builders for real log-backed UV cycle analytics.
import { enumerateIsoDateRange, isValidIsoDate } from '@/lib/date-utils';

export const PHT_OFFSET_MS = 8 * 3_600_000;

export type UvPeriod = 'day' | 'week' | 'month' | 'year';
export type UvDayGranularity = 'hour' | 'minute' | 'second';

export interface RawUvCycleRecord {
  id: string;
  deviceId: string;
  duration: number;
  completed: boolean;
  reason: string | null;
  timestampMs: number;
}

export interface UvDailyRollupRecord {
  date: string; // YYYY-MM-DD (PHT)
  totalCount: number;
  completedCount: number;
  interruptedCount: number;
  totalDurationSeconds: number;
  hourlyCounts?: Record<string, number>;
  hourlyCompleted?: Record<string, number>;
  hourlyInterrupted?: Record<string, number>;
}

export interface UvCycleLogEntry {
  id: string;
  deviceId: string;
  timestampMs: number;
  timestampIso: string;
  phtDate: string; // YYYY-MM-DD
  phtTime: string; // HH:mm:ss
  hour: number;
  minute: number;
  second: number;
  duration: number;
  completed: boolean;
  reason: string | null;
}

export interface UvCycleSeriesPoint {
  key: string;
  label: string;
  tooltipTitle: string;
  count: number;
  completed: number;
  interrupted: number;
  avgDurationSeconds: number;
  totalDurationSeconds: number;
  cumulativeCount?: number;
  eventDurationSeconds?: number;
  deviceId?: string;
  reason?: string | null;
  exactTimes?: string[];
  drillDate?: string;
  drillHour?: number;
}

export interface UvPeriodSummaryTotals {
  today: number;
  selectedDay: number;
  thisWeek: number;
  thisMonth: number;
  thisYear: number;
  todayDurationSeconds: number;
  selectedDayDurationSeconds: number;
  thisWeekDurationSeconds: number;
  thisMonthDurationSeconds: number;
  thisYearDurationSeconds: number;
  periodTotal: number;
  periodCompleted: number;
  periodInterrupted: number;
  avgDurationSeconds: number | null;
  totalDurationSeconds: number;
  completedAvgDurationSeconds: number | null;
  interruptedAvgDurationSeconds: number | null;
  relativeEffectivityPercent: number | null;
}

export interface UvPeriodRangeMeta {
  period: UvPeriod;
  anchorDate: string;
  todayPht: string;
  granularity: UvDayGranularity;
  hourFilter: number | null;
  fromDate: string;
  toDate: string;
  weekFrom: string;
  weekTo: string;
  monthLabel: string;
  yearLabel: string;
}

export interface UvCycleAnalyticsPayload {
  meta: UvPeriodRangeMeta;
  totals: UvPeriodSummaryTotals;
  series: UvCycleSeriesPoint[];
  logs: UvCycleLogEntry[];
  totalLogsInScope: number;
  latestTimestampMs: number | null;
  syncedAtIso: string;
}

const MONTH_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

const MONTH_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export interface UvRelativeEffectivityStats {
  completedAvgDurationSeconds: number | null;
  interruptedAvgDurationSeconds: number | null;
  relativeEffectivityPercent: number | null;
}

/**
 * Computes duration-based relative UV-C exposure for interrupted vs. completed cycles:
 *   Relative Effectivity (%) = (interrupted avg duration / completed avg duration) * 100
 * Under the UV-C reciprocity law (H = I * t) with constant lamp irradiance, duration ratio
 * represents relative UV dose delivered. Returns null when 0 interrupted cycles or no
 * completed baseline exists (avoiding a misleading 0% readout).
 */
export function computeUvRelativeEffectivity(
  entries: ReadonlyArray<{ completed: boolean; duration: number }>,
): UvRelativeEffectivityStats {
  let completedCount = 0;
  let completedDurationSum = 0;
  let interruptedCount = 0;
  let interruptedDurationSum = 0;

  for (const entry of entries) {
    const dur =
      typeof entry.duration === 'number' &&
      Number.isFinite(entry.duration) &&
      entry.duration >= 0
        ? entry.duration
        : 0;
    if (entry.completed) {
      completedCount += 1;
      completedDurationSum += dur;
    } else {
      interruptedCount += 1;
      interruptedDurationSum += dur;
    }
  }

  const completedAvg =
    completedCount > 0 ? completedDurationSum / completedCount : null;
  const interruptedAvg =
    interruptedCount > 0 ? interruptedDurationSum / interruptedCount : null;

  const relativeEffectivityPercent =
    completedAvg !== null && completedAvg > 0 && interruptedAvg !== null
      ? roundOneDecimal((interruptedAvg / completedAvg) * 100)
      : null;

  return {
    completedAvgDurationSeconds:
      completedAvg !== null ? roundOneDecimal(completedAvg) : null,
    interruptedAvgDurationSeconds:
      interruptedAvg !== null ? roundOneDecimal(interruptedAvg) : null,
    relativeEffectivityPercent,
  };
}

/** Converts Firestore Timestamp, serialized {_seconds}/{seconds}, Date, ISO string, or numeric epoch to ms. */
export function parseTimestampToMillis(raw: unknown): number | null {
  if (raw == null) return null;
  if (raw instanceof Date) {
    const ms = raw.getTime();
    return Number.isNaN(ms) ? null : ms;
  }
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || raw <= 0) return null;
    return raw < 1e11 ? Math.round(raw * 1000) : Math.round(raw);
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    if (/^\d+(\.\d+)?$/.test(trimmed)) {
      const num = Number(trimmed);
      if (!Number.isFinite(num) || num <= 0) return null;
      return num < 1e11 ? Math.round(num * 1000) : Math.round(num);
    }
    const parsed = Date.parse(trimmed);
    return Number.isNaN(parsed) ? null : parsed;
  }
  if (typeof raw === 'object') {
    const record = raw as {
      toMillis?: unknown;
      toDate?: unknown;
      _seconds?: unknown;
      seconds?: unknown;
      _nanoseconds?: unknown;
      nanoseconds?: unknown;
    };
    if (typeof record.toMillis === 'function') {
      const ms = (record.toMillis as () => number).call(raw);
      return Number.isFinite(ms) ? ms : null;
    }
    if (typeof record.toDate === 'function') {
      const d = (record.toDate as () => Date).call(raw);
      const ms = d instanceof Date ? d.getTime() : Number.NaN;
      return Number.isNaN(ms) ? null : ms;
    }
    const sec =
      typeof record._seconds === 'number'
        ? record._seconds
        : typeof record.seconds === 'number'
          ? record.seconds
          : null;
    if (sec !== null && Number.isFinite(sec)) {
      const nanos =
        typeof record._nanoseconds === 'number'
          ? record._nanoseconds
          : typeof record.nanoseconds === 'number'
            ? record.nanoseconds
            : 0;
      return Math.round(sec * 1000 + Math.floor(nanos / 1e6));
    }
  }
  return null;
}

export interface PhtDateParts {
  year: number;
  month: number; // 1..12
  day: number; // 1..31
  hour: number; // 0..23
  minute: number; // 0..59
  second: number; // 0..59
  dateStr: string; // YYYY-MM-DD
  monthStr: string; // YYYY-MM
  timeStr: string; // HH:mm:ss
  minuteStr: string; // HH:mm
  timestampIso: string; // YYYY-MM-DDTHH:mm:ss+08:00
}

export function getPhtParts(ms: number): PhtDateParts {
  const shifted = new Date(ms + PHT_OFFSET_MS);
  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth() + 1;
  const day = shifted.getUTCDate();
  const hour = shifted.getUTCHours();
  const minute = shifted.getUTCMinutes();
  const second = shifted.getUTCSeconds();

  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  const hh = String(hour).padStart(2, '0');
  const min = String(minute).padStart(2, '0');
  const ss = String(second).padStart(2, '0');

  const dateStr = `${year}-${mm}-${dd}`;
  const monthStr = `${year}-${mm}`;
  const timeStr = `${hh}:${min}:${ss}`;
  const minuteStr = `${hh}:${min}`;

  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    dateStr,
    monthStr,
    timeStr,
    minuteStr,
    timestampIso: `${dateStr}T${timeStr}+08:00`,
  };
}

export function toPhtIsoDate(ms = Date.now()): string {
  return getPhtParts(ms).dateStr;
}

export function phtDateRangeToUtcMs(
  fromIsoDate: string,
  toIsoDate: string,
): { startMs: number; endMs: number } {
  return {
    startMs: Date.parse(`${fromIsoDate}T00:00:00.000+08:00`),
    endMs: Date.parse(`${toIsoDate}T23:59:59.999+08:00`),
  };
}

export function formatShortCalendarDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const monthName = MONTH_SHORT[(m ?? 1) - 1] ?? 'Jan';
  return `${monthName} ${d ?? 1}, ${y}`;
}

export function formatWeekdayDateLabel(isoDate: string): string {
  const utc = new Date(`${isoDate}T00:00:00.000Z`);
  const dow = WEEKDAY_SHORT[utc.getUTCDay()] ?? 'Mon';
  const day = utc.getUTCDate();
  return `${dow} ${day}`;
}

export function formatMonthDayLabel(isoDate: string): string {
  const [, m, d] = isoDate.split('-').map(Number);
  const monthName = MONTH_SHORT[(m ?? 1) - 1] ?? 'Jan';
  return `${monthName} ${d ?? 1}`;
}

export interface AnchorPeriodBounds {
  anchorDate: string;
  todayPht: string;
  weekFrom: string; // Monday PHT
  weekTo: string; // Sunday PHT
  monthFrom: string;
  monthTo: string;
  monthLabel: string;
  yearFrom: string;
  yearTo: string;
  year: number;
  queryFrom: string; // Earliest date needed across week/month/year/today
  queryTo: string; // Latest date needed across week/month/year/today
}

/**
 * Computes Monday–Sunday week, calendar month, and calendar year bounds in PHT (UTC+8).
 */
export function getPhtPeriodBounds(
  anchorDateInput?: string | null,
  nowMs = Date.now(),
): AnchorPeriodBounds {
  const todayPht = toPhtIsoDate(nowMs);
  const anchorDate =
    anchorDateInput && isValidIsoDate(anchorDateInput)
      ? anchorDateInput
      : todayPht;

  const [year, month] = anchorDate.split('-').map(Number);
  const anchorUtc = new Date(`${anchorDate}T00:00:00.000Z`);
  const dayOfWeek = anchorUtc.getUTCDay(); // 0=Sun..6=Sat
  const offsetToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  const weekStartUtc = new Date(anchorUtc.getTime() + offsetToMonday * 86_400_000);
  const weekEndUtc = new Date(weekStartUtc.getTime() + 6 * 86_400_000);
  const weekFrom = weekStartUtc.toISOString().slice(0, 10);
  const weekTo = weekEndUtc.toISOString().slice(0, 10);

  const lastDayOfMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const mm = String(month).padStart(2, '0');
  const monthFrom = `${year}-${mm}-01`;
  const monthTo = `${year}-${mm}-${String(lastDayOfMonth).padStart(2, '0')}`;
  const monthLabel = `${MONTH_LONG[month - 1] ?? 'January'} ${year}`;

  const yearFrom = `${year}-01-01`;
  const yearTo = `${year}-12-31`;

  // ISO week around Jan 1 or Dec 31 can cross a year boundary; cover all dates cleanly.
  const candidates = [yearFrom, weekFrom, todayPht];
  const endCandidates = [yearTo, weekTo, todayPht];
  const queryFrom = candidates.reduce((min, cur) => (cur < min ? cur : min));
  const queryTo = endCandidates.reduce((max, cur) => (cur > max ? cur : max));

  return {
    anchorDate,
    todayPht,
    weekFrom,
    weekTo,
    monthFrom,
    monthTo,
    monthLabel,
    yearFrom,
    yearTo,
    year,
    queryFrom,
    queryTo,
  };
}

/** Normalizes a Firestore or cache document into a RawUvCycleRecord. */
export function normalizeUvCycleDoc(
  raw: Record<string, unknown>,
  fallbackId = '',
): RawUvCycleRecord | null {
  const timestampMs = parseTimestampToMillis(raw.timestamp ?? raw.timestampMs ?? raw.createdAt);
  if (timestampMs === null) return null;

  const id =
    typeof raw.id === 'string' && raw.id.trim()
      ? raw.id.trim()
      : fallbackId || `uv-${timestampMs}`;
  const deviceId =
    typeof raw.deviceId === 'string' && raw.deviceId.trim()
      ? raw.deviceId.trim()
      : 'toilet-01';
  const rawDuration =
    typeof raw.duration === 'number'
      ? raw.duration
      : Number(raw.duration ?? 0);
  const duration =
    Number.isFinite(rawDuration) && rawDuration >= 0
      ? Math.round(rawDuration * 100) / 100
      : 0;
  const completed = Boolean(raw.completed);
  const reason =
    typeof raw.reason === 'string' && raw.reason.trim()
      ? raw.reason.trim()
      : null;

  return {
    id,
    deviceId,
    duration,
    completed,
    reason,
    timestampMs,
  };
}

export function toUvCycleLogEntry(record: RawUvCycleRecord): UvCycleLogEntry {
  const parts = getPhtParts(record.timestampMs);
  return {
    id: record.id,
    deviceId: record.deviceId,
    timestampMs: record.timestampMs,
    timestampIso: parts.timestampIso,
    phtDate: parts.dateStr,
    phtTime: parts.timeStr,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
    duration: record.duration,
    completed: record.completed,
    reason: record.reason,
  };
}

function roundOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Formats a UV runtime in seconds into human-readable duration (e.g. "45s", "3m 5s", "1h 12m").
 * When includeRawSeconds is true and duration >= 60s, appends raw seconds like "3m 5s (185s)".
 */
export function formatUvDuration(
  seconds: number | null | undefined,
  options: { includeRawSeconds?: boolean } = {},
): string {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) {
    return '--';
  }
  const rounded = Math.round(seconds);
  if (rounded < 60) {
    return `${rounded}s`;
  }
  const hours = Math.floor(rounded / 3600);
  const mins = Math.floor((rounded % 3600) / 60);
  const secs = rounded % 60;

  let formatted: string;
  if (hours > 0) {
    formatted = mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  } else {
    formatted = secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  }

  return options.includeRawSeconds
    ? `${formatted} (${rounded.toLocaleString()}s)`
    : formatted;
}

interface DayAggregate {
  total: number;
  completed: number;
  interrupted: number;
  totalDurationSeconds: number;
}

function addDayAggregate(
  map: Map<string, DayAggregate>,
  date: string,
  delta: DayAggregate,
): void {
  const existing = map.get(date) ?? {
    total: 0,
    completed: 0,
    interrupted: 0,
    totalDurationSeconds: 0,
  };
  existing.total += delta.total;
  existing.completed += delta.completed;
  existing.interrupted += delta.interrupted;
  existing.totalDurationSeconds += delta.totalDurationSeconds;
  map.set(date, existing);
}

/**
 * Merges raw UV cycle logs with optional daily rollups without double-counting.
 * If raw records were not truncated, raw records are authoritative for every date.
 * If truncated (very high volume), daily rollups supersede dates with higher totals.
 */
function buildMergedDailyMap(
  rawRecords: RawUvCycleRecord[],
  dailyRollups: UvDailyRollupRecord[],
  rawTruncated: boolean,
): Map<string, DayAggregate> {
  const dailyMap = new Map<string, DayAggregate>();

  for (const record of rawRecords) {
    const date = toPhtIsoDate(record.timestampMs);
    addDayAggregate(dailyMap, date, {
      total: 1,
      completed: record.completed ? 1 : 0,
      interrupted: record.completed ? 0 : 1,
      totalDurationSeconds: record.duration,
    });
  }

  if (rawTruncated && dailyRollups.length > 0) {
    for (const rollup of dailyRollups) {
      if (!isValidIsoDate(rollup.date)) continue;
      const existing = dailyMap.get(rollup.date);
      if (!existing || rollup.totalCount > existing.total) {
        dailyMap.set(rollup.date, {
          total: rollup.totalCount,
          completed: rollup.completedCount,
          interrupted: rollup.interruptedCount,
          totalDurationSeconds: rollup.totalDurationSeconds,
        });
      }
    }
  }

  return dailyMap;
}

function sumDailyMapInRange(
  dailyMap: Map<string, DayAggregate>,
  fromDate: string,
  toDate: string,
): DayAggregate {
  const acc: DayAggregate = {
    total: 0,
    completed: 0,
    interrupted: 0,
    totalDurationSeconds: 0,
  };
  for (const [date, entry] of dailyMap.entries()) {
    if (date >= fromDate && date <= toDate) {
      acc.total += entry.total;
      acc.completed += entry.completed;
      acc.interrupted += entry.interrupted;
      acc.totalDurationSeconds += entry.totalDurationSeconds;
    }
  }
  return acc;
}

function buildDayHourlySeries(
  dayLogs: UvCycleLogEntry[],
  anchorDate: string,
): UvCycleSeriesPoint[] {
  const buckets = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    count: 0,
    completed: 0,
    interrupted: 0,
    totalDurationSeconds: 0,
    exactTimes: [] as string[],
  }));

  for (const log of dayLogs) {
    const bucket = buckets[log.hour];
    if (!bucket) continue;
    bucket.count += 1;
    if (log.completed) {
      bucket.completed += 1;
    } else {
      bucket.interrupted += 1;
    }
    bucket.totalDurationSeconds += log.duration;
    bucket.exactTimes.push(log.phtTime);
  }

  const prettyDate = formatShortCalendarDate(anchorDate);
  return buckets.map((b) => {
    const hh = String(b.hour).padStart(2, '0');
    return {
      key: `${anchorDate}T${hh}`,
      label: `${hh}:00`,
      tooltipTitle: `${prettyDate} · ${hh}:00–${hh}:59 PHT`,
      count: b.count,
      completed: b.completed,
      interrupted: b.interrupted,
      avgDurationSeconds:
        b.count > 0 ? roundOneDecimal(b.totalDurationSeconds / b.count) : 0,
      totalDurationSeconds: roundOneDecimal(b.totalDurationSeconds),
      exactTimes: b.exactTimes.slice(0, 6),
      drillDate: anchorDate,
      drillHour: b.hour,
    };
  });
}

function buildDayMinuteSeries(
  dayLogs: UvCycleLogEntry[],
  anchorDate: string,
  hourFilter: number | null,
): UvCycleSeriesPoint[] {
  const prettyDate = formatShortCalendarDate(anchorDate);
  const minuteMap = new Map<
    string,
    {
      count: number;
      completed: number;
      interrupted: number;
      totalDurationSeconds: number;
      exactTimes: string[];
      hour: number;
    }
  >();

  for (const log of dayLogs) {
    const hh = String(log.hour).padStart(2, '0');
    const mm = String(log.minute).padStart(2, '0');
    const key = `${hh}:${mm}`;
    const existing = minuteMap.get(key) ?? {
      count: 0,
      completed: 0,
      interrupted: 0,
      totalDurationSeconds: 0,
      exactTimes: [],
      hour: log.hour,
    };
    existing.count += 1;
    if (log.completed) {
      existing.completed += 1;
    } else {
      existing.interrupted += 1;
    }
    existing.totalDurationSeconds += log.duration;
    existing.exactTimes.push(log.phtTime);
    minuteMap.set(key, existing);
  }

  // If a specific hour is chosen, emit all 60 continuous minutes (HH:00 .. HH:59)
  if (hourFilter !== null && hourFilter >= 0 && hourFilter <= 23) {
    const hh = String(hourFilter).padStart(2, '0');
    return Array.from({ length: 60 }, (_, minute) => {
      const mm = String(minute).padStart(2, '0');
      const label = `${hh}:${mm}`;
      const bucket = minuteMap.get(label);
      const count = bucket?.count ?? 0;
      const totalDur = bucket?.totalDurationSeconds ?? 0;
      return {
        key: `${anchorDate}T${label}`,
        label,
        tooltipTitle: `${prettyDate} · ${label}:00–${label}:59 PHT`,
        count,
        completed: bucket?.completed ?? 0,
        interrupted: bucket?.interrupted ?? 0,
        avgDurationSeconds: count > 0 ? roundOneDecimal(totalDur / count) : 0,
        totalDurationSeconds: roundOneDecimal(totalDur),
        exactTimes: (bucket?.exactTimes ?? []).slice(0, 6),
        drillDate: anchorDate,
        drillHour: hourFilter,
      };
    });
  }

  // All-hours Minute view: emit continuous minutes if active span <= 120 minutes,
  // otherwise emit chronological active minute buckets so labels remain crisp.
  if (dayLogs.length === 0) {
    return [];
  }

  const firstMinOfDay = dayLogs[0].hour * 60 + dayLogs[0].minute;
  const lastMinOfDay =
    dayLogs[dayLogs.length - 1].hour * 60 + dayLogs[dayLogs.length - 1].minute;
  const spanMinutes = lastMinOfDay - firstMinOfDay;

  if (spanMinutes <= 120) {
    const points: UvCycleSeriesPoint[] = [];
    for (let m = firstMinOfDay; m <= lastMinOfDay; m++) {
      const h = Math.floor(m / 60);
      const min = m % 60;
      const label = `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
      const bucket = minuteMap.get(label);
      const count = bucket?.count ?? 0;
      const totalDur = bucket?.totalDurationSeconds ?? 0;
      points.push({
        key: `${anchorDate}T${label}`,
        label,
        tooltipTitle: `${prettyDate} · ${label}:00–${label}:59 PHT`,
        count,
        completed: bucket?.completed ?? 0,
        interrupted: bucket?.interrupted ?? 0,
        avgDurationSeconds: count > 0 ? roundOneDecimal(totalDur / count) : 0,
        totalDurationSeconds: roundOneDecimal(totalDur),
        exactTimes: (bucket?.exactTimes ?? []).slice(0, 6),
        drillDate: anchorDate,
        drillHour: h,
      });
    }
    return points;
  }

  return Array.from(minuteMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, bucket]) => ({
      key: `${anchorDate}T${label}`,
      label,
      tooltipTitle: `${prettyDate} · ${label}:00–${label}:59 PHT`,
      count: bucket.count,
      completed: bucket.completed,
      interrupted: bucket.interrupted,
      avgDurationSeconds:
        bucket.count > 0
          ? roundOneDecimal(bucket.totalDurationSeconds / bucket.count)
          : 0,
      totalDurationSeconds: roundOneDecimal(bucket.totalDurationSeconds),
      exactTimes: bucket.exactTimes.slice(0, 6),
      drillDate: anchorDate,
      drillHour: bucket.hour,
    }));
}

function buildDayExactSecondSeries(
  dayLogs: UvCycleLogEntry[],
  anchorDate: string,
): UvCycleSeriesPoint[] {
  const prettyDate = formatShortCalendarDate(anchorDate);
  let cumulative = 0;
  let cumulativeCompleted = 0;
  let cumulativeInterrupted = 0;

  return dayLogs.map((log, index) => {
    cumulative += 1;
    if (log.completed) {
      cumulativeCompleted += 1;
    } else {
      cumulativeInterrupted += 1;
    }

    return {
      key: `${log.id}-${index}`,
      label: log.phtTime, // Exact HH:mm:ss
      tooltipTitle: `${prettyDate} · ${log.phtTime} PHT`,
      count: cumulative,
      cumulativeCount: cumulative,
      completed: cumulativeCompleted,
      interrupted: cumulativeInterrupted,
      avgDurationSeconds: roundOneDecimal(log.duration),
      totalDurationSeconds: roundOneDecimal(log.duration),
      eventDurationSeconds: roundOneDecimal(log.duration),
      deviceId: log.deviceId,
      reason: log.reason,
      exactTimes: [log.phtTime],
      drillDate: anchorDate,
      drillHour: log.hour,
    };
  });
}

export interface BuildUvAnalyticsOptions {
  records: RawUvCycleRecord[];
  dailyRollups?: UvDailyRollupRecord[];
  rawTruncated?: boolean;
  period: UvPeriod;
  anchorDate?: string | null;
  granularity?: UvDayGranularity;
  hourFilter?: number | null;
  maxLogs?: number;
  nowMs?: number;
}

/**
 * Pure aggregator producing totals (Day/Week/Month/Year), Line Graph series, and raw verified logs.
 */
export function buildUvCycleAnalytics(
  options: BuildUvAnalyticsOptions,
): UvCycleAnalyticsPayload {
  const nowMs = options.nowMs ?? Date.now();
  const bounds = getPhtPeriodBounds(options.anchorDate, nowMs);
  const granularity: UvDayGranularity = options.granularity ?? 'hour';
  const hourFilter =
    options.period === 'day' &&
    typeof options.hourFilter === 'number' &&
    Number.isInteger(options.hourFilter) &&
    options.hourFilter >= 0 &&
    options.hourFilter <= 23
      ? options.hourFilter
      : null;
  const maxLogs = options.maxLogs ?? 200;

  // Deduplicate by id and sort ascending by timestampMs
  const dedupedMap = new Map<string, RawUvCycleRecord>();
  for (const record of options.records) {
    dedupedMap.set(record.id, record);
  }
  const sortedRecords = Array.from(dedupedMap.values()).sort(
    (a, b) => a.timestampMs - b.timestampMs,
  );

  const dailyMap = buildMergedDailyMap(
    sortedRecords,
    options.dailyRollups ?? [],
    Boolean(options.rawTruncated),
  );

  // Reference summary counts for the 4 clickable KPI cards
  const todayAgg = sumDailyMapInRange(dailyMap, bounds.todayPht, bounds.todayPht);
  const selectedDayAgg = sumDailyMapInRange(
    dailyMap,
    bounds.anchorDate,
    bounds.anchorDate,
  );
  const weekAgg = sumDailyMapInRange(dailyMap, bounds.weekFrom, bounds.weekTo);
  const monthAgg = sumDailyMapInRange(dailyMap, bounds.monthFrom, bounds.monthTo);
  const yearAgg = sumDailyMapInRange(dailyMap, bounds.yearFrom, bounds.yearTo);

  let fromDate = bounds.anchorDate;
  let toDate = bounds.anchorDate;
  let periodAgg = selectedDayAgg;
  let series: UvCycleSeriesPoint[] = [];

  if (options.period === 'day') {
    fromDate = bounds.anchorDate;
    toDate = bounds.anchorDate;
    periodAgg = selectedDayAgg;
  } else if (options.period === 'week') {
    fromDate = bounds.weekFrom;
    toDate = bounds.weekTo;
    periodAgg = weekAgg;
  } else if (options.period === 'month') {
    fromDate = bounds.monthFrom;
    toDate = bounds.monthTo;
    periodAgg = monthAgg;
  } else {
    fromDate = bounds.yearFrom;
    toDate = bounds.yearTo;
    periodAgg = yearAgg;
  }

  // Raw logs strictly inside the active scope (and optional hourFilter for Day view)
  const scopedEntriesAsc = sortedRecords
    .map(toUvCycleLogEntry)
    .filter((entry) => {
      if (entry.phtDate < fromDate || entry.phtDate > toDate) {
        return false;
      }
      if (hourFilter !== null && entry.hour !== hourFilter) {
        return false;
      }
      return true;
    });

  // If hourFilter is active on Day view, period totals reflect the filtered hour
  if (options.period === 'day' && hourFilter !== null) {
    const completed = scopedEntriesAsc.filter((e) => e.completed).length;
    const totalDurationSeconds = scopedEntriesAsc.reduce(
      (sum, e) => sum + e.duration,
      0,
    );
    periodAgg = {
      total: scopedEntriesAsc.length,
      completed,
      interrupted: scopedEntriesAsc.length - completed,
      totalDurationSeconds,
    };
  }

  if (options.period === 'day') {
    if (granularity === 'second') {
      series = buildDayExactSecondSeries(scopedEntriesAsc, bounds.anchorDate);
    } else if (granularity === 'minute') {
      series = buildDayMinuteSeries(
        scopedEntriesAsc,
        bounds.anchorDate,
        hourFilter,
      );
    } else {
      series = buildDayHourlySeries(scopedEntriesAsc, bounds.anchorDate);
    }
  } else if (options.period === 'week') {
    const dates = enumerateIsoDateRange(bounds.weekFrom, bounds.weekTo);
    series = dates.map((date) => {
      const agg = dailyMap.get(date) ?? {
        total: 0,
        completed: 0,
        interrupted: 0,
        totalDurationSeconds: 0,
      };
      return {
        key: date,
        label: formatWeekdayDateLabel(date),
        tooltipTitle: `${formatWeekdayDateLabel(date)} · ${formatShortCalendarDate(date)}`,
        count: agg.total,
        completed: agg.completed,
        interrupted: agg.interrupted,
        avgDurationSeconds:
          agg.total > 0 ? roundOneDecimal(agg.totalDurationSeconds / agg.total) : 0,
        totalDurationSeconds: roundOneDecimal(agg.totalDurationSeconds),
        drillDate: date,
      };
    });
  } else if (options.period === 'month') {
    const dates = enumerateIsoDateRange(bounds.monthFrom, bounds.monthTo);
    series = dates.map((date) => {
      const agg = dailyMap.get(date) ?? {
        total: 0,
        completed: 0,
        interrupted: 0,
        totalDurationSeconds: 0,
      };
      return {
        key: date,
        label: formatMonthDayLabel(date),
        tooltipTitle: formatShortCalendarDate(date),
        count: agg.total,
        completed: agg.completed,
        interrupted: agg.interrupted,
        avgDurationSeconds:
          agg.total > 0 ? roundOneDecimal(agg.totalDurationSeconds / agg.total) : 0,
        totalDurationSeconds: roundOneDecimal(agg.totalDurationSeconds),
        drillDate: date,
      };
    });
  } else {
    // Year view: 12 monthly buckets (Jan .. Dec)
    series = Array.from({ length: 12 }, (_, idx) => {
      const monthNum = idx + 1;
      const mm = String(monthNum).padStart(2, '0');
      const mFrom = `${bounds.year}-${mm}-01`;
      const lastDay = new Date(Date.UTC(bounds.year, monthNum, 0)).getUTCDate();
      const mTo = `${bounds.year}-${mm}-${String(lastDay).padStart(2, '0')}`;
      const agg = sumDailyMapInRange(dailyMap, mFrom, mTo);

      return {
        key: `${bounds.year}-${mm}`,
        label: MONTH_SHORT[idx] ?? mm,
        tooltipTitle: `${MONTH_LONG[idx] ?? mm} ${bounds.year}`,
        count: agg.total,
        completed: agg.completed,
        interrupted: agg.interrupted,
        avgDurationSeconds:
          agg.total > 0 ? roundOneDecimal(agg.totalDurationSeconds / agg.total) : 0,
        totalDurationSeconds: roundOneDecimal(agg.totalDurationSeconds),
        drillDate: mFrom,
      };
    });
  }

  const latestTimestampMs =
    sortedRecords.length > 0
      ? sortedRecords[sortedRecords.length - 1].timestampMs
      : null;

  const relativeEffectivity = computeUvRelativeEffectivity(scopedEntriesAsc);

  // Return logs newest-first for the audit table, bounded to maxLogs
  const logsNewestFirst = [...scopedEntriesAsc].reverse().slice(0, maxLogs);

  return {
    meta: {
      period: options.period,
      anchorDate: bounds.anchorDate,
      todayPht: bounds.todayPht,
      granularity,
      hourFilter,
      fromDate,
      toDate,
      weekFrom: bounds.weekFrom,
      weekTo: bounds.weekTo,
      monthLabel: bounds.monthLabel,
      yearLabel: String(bounds.year),
    },
    totals: {
      today: todayAgg.total,
      selectedDay: selectedDayAgg.total,
      thisWeek: weekAgg.total,
      thisMonth: monthAgg.total,
      thisYear: yearAgg.total,
      todayDurationSeconds: roundOneDecimal(todayAgg.totalDurationSeconds),
      selectedDayDurationSeconds: roundOneDecimal(
        selectedDayAgg.totalDurationSeconds,
      ),
      thisWeekDurationSeconds: roundOneDecimal(weekAgg.totalDurationSeconds),
      thisMonthDurationSeconds: roundOneDecimal(monthAgg.totalDurationSeconds),
      thisYearDurationSeconds: roundOneDecimal(yearAgg.totalDurationSeconds),
      periodTotal: periodAgg.total,
      periodCompleted: periodAgg.completed,
      periodInterrupted: periodAgg.interrupted,
      avgDurationSeconds:
        periodAgg.total > 0
          ? roundOneDecimal(periodAgg.totalDurationSeconds / periodAgg.total)
          : null,
      totalDurationSeconds: roundOneDecimal(periodAgg.totalDurationSeconds),
      completedAvgDurationSeconds:
        relativeEffectivity.completedAvgDurationSeconds,
      interruptedAvgDurationSeconds:
        relativeEffectivity.interruptedAvgDurationSeconds,
      relativeEffectivityPercent:
        relativeEffectivity.relativeEffectivityPercent,
    },
    series,
    logs: logsNewestFirst,
    totalLogsInScope: scopedEntriesAsc.length,
    latestTimestampMs,
    syncedAtIso: getPhtParts(nowMs).timestampIso,
  };
}

export type UvReportBucketMode = 'hour' | 'minute' | 'second' | 'day' | 'month';

export interface UvCycleReportExportData {
  from: string;
  to: string;
  timezone: string;
  bucketMode: UvReportBucketMode;
  deviceId: string | null;
  generatedAtIso: string;
  summary: {
    totalCycles: number;
    completedCycles: number;
    interruptedCycles: number;
    avgDurationSeconds: number | null;
    totalDurationSeconds: number;
    completedAvgDurationSeconds?: number | null;
    interruptedAvgDurationSeconds?: number | null;
    relativeEffectivityPercent?: number | null;
    todayCount: number;
    thisWeekCount: number;
    thisMonthCount: number;
    thisYearCount: number;
  };
  series: UvCycleSeriesPoint[];
  logs: UvCycleLogEntry[];
}

export interface BuildUvRangeReportOptions {
  records: RawUvCycleRecord[];
  from: string;
  to: string;
  granularity?: UvDayGranularity;
  hourFilter?: number | null;
  deviceId?: string | null;
  nowMs?: number;
}

/**
 * Builds an arbitrary-range UV cycle export dataset (for CSV, JSON, PDF, and Reports preview)
 * using the exact same PHT (UTC+8) log normalization and Line Graph bucketing as Analytics.
 */
export function buildUvCycleRangeReport(
  options: BuildUvRangeReportOptions,
): UvCycleReportExportData {
  const nowMs = options.nowMs ?? Date.now();
  const deviceId = options.deviceId?.trim() || null;
  const filteredRaw = deviceId
    ? options.records.filter((r) => r.deviceId === deviceId)
    : options.records;

  // Deduplicate by id and sort ascending
  const deduped = new Map<string, RawUvCycleRecord>();
  for (const r of filteredRaw) {
    deduped.set(r.id, r);
  }
  const sortedRecords = Array.from(deduped.values()).sort(
    (a, b) => a.timestampMs - b.timestampMs,
  );

  const dailyMap = buildMergedDailyMap(sortedRecords, [], false);
  const referenceBounds = getPhtPeriodBounds(options.to, nowMs);

  const todayAgg = sumDailyMapInRange(
    dailyMap,
    referenceBounds.todayPht,
    referenceBounds.todayPht,
  );
  const weekAgg = sumDailyMapInRange(
    dailyMap,
    referenceBounds.weekFrom,
    referenceBounds.weekTo,
  );
  const monthAgg = sumDailyMapInRange(
    dailyMap,
    referenceBounds.monthFrom,
    referenceBounds.monthTo,
  );
  const yearAgg = sumDailyMapInRange(
    dailyMap,
    referenceBounds.yearFrom,
    referenceBounds.yearTo,
  );

  const hourFilter =
    options.from === options.to &&
    typeof options.hourFilter === 'number' &&
    Number.isInteger(options.hourFilter) &&
    options.hourFilter >= 0 &&
    options.hourFilter <= 23
      ? options.hourFilter
      : null;

  const scopedLogsAsc = sortedRecords
    .map(toUvCycleLogEntry)
    .filter((entry) => {
      if (entry.phtDate < options.from || entry.phtDate > options.to) {
        return false;
      }
      if (hourFilter !== null && entry.hour !== hourFilter) {
        return false;
      }
      return true;
    });

  const datesInRange = enumerateIsoDateRange(options.from, options.to);
  let bucketMode: UvReportBucketMode;
  let series: UvCycleSeriesPoint[];

  if (datesInRange.length === 1) {
    const dayGranularity: UvDayGranularity = options.granularity ?? 'hour';
    bucketMode = dayGranularity;
    if (dayGranularity === 'second') {
      series = buildDayExactSecondSeries(scopedLogsAsc, options.from);
    } else if (dayGranularity === 'minute') {
      series = buildDayMinuteSeries(scopedLogsAsc, options.from, hourFilter);
    } else {
      series = buildDayHourlySeries(scopedLogsAsc, options.from);
    }
  } else if (datesInRange.length <= 62) {
    bucketMode = 'day';
    series = datesInRange.map((date) => {
      const agg = dailyMap.get(date) ?? {
        total: 0,
        completed: 0,
        interrupted: 0,
        totalDurationSeconds: 0,
      };
      return {
        key: date,
        label:
          datesInRange.length <= 7
            ? formatWeekdayDateLabel(date)
            : formatMonthDayLabel(date),
        tooltipTitle: formatShortCalendarDate(date),
        count: agg.total,
        completed: agg.completed,
        interrupted: agg.interrupted,
        avgDurationSeconds:
          agg.total > 0
            ? roundOneDecimal(agg.totalDurationSeconds / agg.total)
            : 0,
        totalDurationSeconds: roundOneDecimal(agg.totalDurationSeconds),
        drillDate: date,
      };
    });
  } else {
    bucketMode = 'month';
    const monthKeys: string[] = [];
    const seenMonths = new Set<string>();
    for (const date of datesInRange) {
      const mKey = date.slice(0, 7);
      if (!seenMonths.has(mKey)) {
        seenMonths.add(mKey);
        monthKeys.push(mKey);
      }
    }
    series = monthKeys.map((monthKey) => {
      const [yStr, mStr] = monthKey.split('-');
      const yNum = Number(yStr);
      const mNum = Number(mStr);
      const lastDay = new Date(Date.UTC(yNum, mNum, 0)).getUTCDate();
      const mFrom = `${monthKey}-01` < options.from ? options.from : `${monthKey}-01`;
      const mEnd = `${monthKey}-${String(lastDay).padStart(2, '0')}`;
      const mTo = mEnd > options.to ? options.to : mEnd;
      const agg = sumDailyMapInRange(dailyMap, mFrom, mTo);

      return {
        key: monthKey,
        label: `${MONTH_SHORT[mNum - 1] ?? mStr}${monthKeys.length > 12 ? ` ${yStr}` : ''}`,
        tooltipTitle: `${MONTH_LONG[mNum - 1] ?? mStr} ${yStr}`,
        count: agg.total,
        completed: agg.completed,
        interrupted: agg.interrupted,
        avgDurationSeconds:
          agg.total > 0
            ? roundOneDecimal(agg.totalDurationSeconds / agg.total)
            : 0,
        totalDurationSeconds: roundOneDecimal(agg.totalDurationSeconds),
        drillDate: mFrom,
      };
    });
  }

  const completedCycles = scopedLogsAsc.filter((l) => l.completed).length;
  const totalCycles = scopedLogsAsc.length;
  const interruptedCycles = totalCycles - completedCycles;
  const totalDurationSeconds = roundOneDecimal(
    scopedLogsAsc.reduce((sum, l) => sum + l.duration, 0),
  );
  const avgDurationSeconds =
    totalCycles > 0 ? roundOneDecimal(totalDurationSeconds / totalCycles) : null;
  const relativeEffectivity = computeUvRelativeEffectivity(scopedLogsAsc);

  return {
    from: options.from,
    to: options.to,
    timezone: 'Asia/Manila (UTC+8)',
    bucketMode,
    deviceId,
    generatedAtIso: getPhtParts(nowMs).timestampIso,
    summary: {
      totalCycles,
      completedCycles,
      interruptedCycles,
      avgDurationSeconds,
      totalDurationSeconds,
      completedAvgDurationSeconds:
        relativeEffectivity.completedAvgDurationSeconds,
      interruptedAvgDurationSeconds:
        relativeEffectivity.interruptedAvgDurationSeconds,
      relativeEffectivityPercent:
        relativeEffectivity.relativeEffectivityPercent,
      todayCount: todayAgg.total,
      thisWeekCount: weekAgg.total,
      thisMonthCount: monthAgg.total,
      thisYearCount: yearAgg.total,
    },
    series,
    logs: scopedLogsAsc,
  };
}

function escapeUvCsvCell(value: string | number | boolean | null | undefined): string {
  const raw = value === null || value === undefined ? '' : String(value);
  const trimmed = raw.trimStart();
  const neutralized =
    /^[=+\-@\t\r]/.test(raw) || /^[=+\-@\t\r]/.test(trimmed) ? `'${raw}` : raw;
  const escaped = neutralized.replaceAll('"', '""');
  return /[",\n\r]/.test(escaped) ? `"${escaped}"` : escaped;
}

/**
 * Generates an audit-ready, Excel/Sheets formula-safe CSV for UV Sanitization Cycle logs.
 */
export function buildUvCyclesReportCsv(report: UvCycleReportExportData): string {
  const lines: string[] = [];

  lines.push('--- UV SANITIZATION CYCLE SUMMARY ---');
  lines.push('metric,value');
  const summaryRows: Array<[string, string | number]> = [
    ['Report Period (PHT)', `${report.from} to ${report.to}`],
    ['Timezone', report.timezone],
    ['Line Graph Resolution', report.bucketMode],
    ['Device Filter', report.deviceId ?? 'All Devices'],
    ['Generated At (PHT)', report.generatedAtIso],
    ['Cycles in Selected Range', report.summary.totalCycles],
    ['Completed Cycles', report.summary.completedCycles],
    ['Interrupted Cycles', report.summary.interruptedCycles],
    [
      'Average Cycle Duration (s)',
      report.summary.avgDurationSeconds !== null
        ? report.summary.avgDurationSeconds.toFixed(1)
        : 'N/A',
    ],
    ['Total UV Runtime (s)', report.summary.totalDurationSeconds.toFixed(1)],
    [
      'Completed Avg Duration (s)',
      typeof report.summary.completedAvgDurationSeconds === 'number'
        ? report.summary.completedAvgDurationSeconds.toFixed(1)
        : 'N/A',
    ],
    [
      'Interrupted Avg Duration (s)',
      typeof report.summary.interruptedAvgDurationSeconds === 'number'
        ? report.summary.interruptedAvgDurationSeconds.toFixed(1)
        : 'N/A',
    ],
    [
      'Relative Effectivity ((Interrupted Avg / Completed Avg) x 100)',
      typeof report.summary.relativeEffectivityPercent === 'number'
        ? `${report.summary.relativeEffectivityPercent.toFixed(1)}%`
        : report.summary.interruptedCycles === 0
          ? 'N/A (0 interrupted cycles)'
          : 'N/A (no completed baseline)',
    ],
    ['Today Total Cycles', report.summary.todayCount],
    ['This Week Total Cycles', report.summary.thisWeekCount],
    ['This Month Total Cycles', report.summary.thisMonthCount],
    ['This Year Total Cycles', report.summary.thisYearCount],
  ];

  for (const [metric, value] of summaryRows) {
    lines.push([escapeUvCsvCell(metric), escapeUvCsvCell(value)].join(','));
  }

  lines.push('');
  lines.push('--- LINE GRAPH TIME-SERIES BREAKDOWN ---');
  lines.push(
    'bucket_key,label,total_cycles,completed,interrupted,avg_duration_seconds,total_duration_seconds',
  );
  for (const point of report.series) {
    lines.push(
      [
        escapeUvCsvCell(point.key),
        escapeUvCsvCell(point.label),
        escapeUvCsvCell(point.count),
        escapeUvCsvCell(point.completed),
        escapeUvCsvCell(point.interrupted),
        escapeUvCsvCell(point.avgDurationSeconds),
        escapeUvCsvCell(point.totalDurationSeconds),
      ].join(','),
    );
  }

  lines.push('');
  lines.push('--- VERIFIED UV CYCLE LOGS (PHT UTC+8) ---');
  lines.push(
    'log_id,device_id,date_pht,time_pht_hhmmss,hour,minute,second,duration_seconds,status,reason,timestamp_iso',
  );
  for (const log of report.logs) {
    lines.push(
      [
        escapeUvCsvCell(log.id),
        escapeUvCsvCell(log.deviceId),
        escapeUvCsvCell(log.phtDate),
        escapeUvCsvCell(log.phtTime),
        escapeUvCsvCell(log.hour),
        escapeUvCsvCell(log.minute),
        escapeUvCsvCell(log.second),
        escapeUvCsvCell(log.duration),
        escapeUvCsvCell(log.completed ? 'Completed' : 'Interrupted'),
        escapeUvCsvCell(log.reason ?? ''),
        escapeUvCsvCell(log.timestampIso),
      ].join(','),
    );
  }

  return lines.join('\n');
}
