// app/api/analytics/uv-cycles/route.ts
import { NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';
import { requireSupervisorOrAdmin, verifyAuthToken } from '@/lib/auth-helpers';
import { isValidIsoDate, validateIsoDateRange } from '@/lib/date-utils';
import {
  buildUvCycleAnalytics,
  buildUvCycleRangeReport,
  getPhtPeriodBounds,
  normalizeUvCycleDoc,
  phtDateRangeToUtcMs,
  type RawUvCycleRecord,
  type UvDailyRollupRecord,
  type UvDayGranularity,
  type UvPeriod,
} from '@/lib/uv-cycle-analytics';
import {
  getCachedAnalyticsTelemetry,
  getRuntimeCachedValue,
  getStaleRuntimeCachedValue,
  isFirestoreQuotaCircuitOpen,
  isQuotaExceededError,
  markFirestoreQuotaExhausted,
  setRuntimeCachedValue,
} from '@/lib/local-runtime-cache';

const VALID_PERIODS = new Set<UvPeriod>(['day', 'week', 'month', 'year']);
const VALID_GRANULARITIES = new Set<UvDayGranularity>([
  'hour',
  'minute',
  'second',
]);
const DEVICE_ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;
const INTEGER_RE = /^\d+$/;

const YEAR_CACHE_TTL_MS = 5 * 60_000;
const LIVE_DELTA_COOLDOWN_MS = 4_000;
const RAW_UV_QUERY_LIMIT = 5_000;
const DELTA_UV_QUERY_LIMIT = 200;

interface CachedUvYearDataset {
  records: RawUvCycleRecord[];
  dailyRollups: UvDailyRollupRecord[];
  truncated: boolean;
  latestTimestampMs: number | null;
  lastDeltaCheckedAtMs: number;
}

interface QueryLike {
  where: (field: string, op: string, value: unknown) => QueryLike;
  orderBy?: (field: string, dir?: 'asc' | 'desc') => QueryLike;
  limit?: (n: number) => QueryLike;
  get: () => Promise<{
    docs?: Array<{ id?: string; data: () => Record<string, unknown> }>;
  }>;
}

function filterByDevice(
  records: RawUvCycleRecord[],
  deviceId: string | null,
): RawUvCycleRecord[] {
  if (!deviceId) return records;
  return records.filter((r) => r.deviceId === deviceId);
}

function mergeRecords(
  existing: RawUvCycleRecord[],
  incoming: RawUvCycleRecord[],
): { merged: RawUvCycleRecord[]; addedCount: number } {
  if (incoming.length === 0) {
    return { merged: existing, addedCount: 0 };
  }
  const byId = new Map<string, RawUvCycleRecord>();
  for (const r of existing) {
    byId.set(r.id, r);
  }
  let addedCount = 0;
  for (const r of incoming) {
    if (!byId.has(r.id)) {
      addedCount += 1;
    }
    byId.set(r.id, r);
  }
  const merged = Array.from(byId.values()).sort(
    (a, b) => a.timestampMs - b.timestampMs,
  );
  return { merged, addedCount };
}

async function queryRawUvCyclesRange(
  startMs: number,
  endMs: number,
  options: { strictGreaterThanStart?: boolean; limitCount: number },
): Promise<{ records: RawUvCycleRecord[]; hitLimit: boolean }> {
  const col = adminDb.collection('uvCycles') as unknown as QueryLike;
  const startOp = options.strictGreaterThanStart ? '>' : '>=';
  let query: QueryLike = col
    .where('timestamp', startOp, Timestamp.fromMillis(startMs))
    .where('timestamp', '<=', Timestamp.fromMillis(endMs));

  if (typeof query.orderBy === 'function') {
    query = query.orderBy('timestamp', 'asc');
  }
  if (typeof query.limit === 'function') {
    query = query.limit(options.limitCount);
  }

  const snap = await query.get();
  const docs = snap?.docs ?? [];
  const records: RawUvCycleRecord[] = [];
  for (const doc of docs) {
    const normalized = normalizeUvCycleDoc(doc.data(), doc.id ?? '');
    if (normalized) {
      records.push(normalized);
    }
  }
  return {
    records,
    hitLimit: docs.length >= options.limitCount,
  };
}

async function queryUvDailyRollups(
  fromDate: string,
  toDate: string,
): Promise<UvDailyRollupRecord[]> {
  try {
    const col = adminDb.collection('uvCyclesDaily') as unknown as QueryLike;
    if (!col || typeof col.where !== 'function') return [];
    let query: QueryLike = col
      .where('date', '>=', fromDate)
      .where('date', '<=', toDate);
    if (typeof query.limit === 'function') {
      query = query.limit(400);
    }
    const snap = await query.get();
    const rollups: UvDailyRollupRecord[] = [];
    for (const doc of snap?.docs ?? []) {
      const data = doc.data();
      const date =
        typeof data.date === 'string' && isValidIsoDate(data.date)
          ? data.date
          : typeof doc.id === 'string' && isValidIsoDate(doc.id)
            ? doc.id
            : null;
      if (!date) continue;
      const totalCount = Number(data.totalCount ?? 0);
      const completedCount = Number(data.completedCount ?? 0);
      const interruptedCount = Number(
        data.interruptedCount ?? Math.max(0, totalCount - completedCount),
      );
      const totalDurationSeconds = Number(data.totalDurationSeconds ?? 0);
      if (!Number.isFinite(totalCount) || totalCount < 0) continue;

      rollups.push({
        date,
        totalCount,
        completedCount: Number.isFinite(completedCount) ? completedCount : 0,
        interruptedCount: Number.isFinite(interruptedCount)
          ? interruptedCount
          : 0,
        totalDurationSeconds: Number.isFinite(totalDurationSeconds)
          ? totalDurationSeconds
          : 0,
      });
    }
    return rollups;
  } catch (err) {
    if (isQuotaExceededError(err)) {
      markFirestoreQuotaExhausted();
    }
    return [];
  }
}

async function resolveQuotaFallbackRecords(
  cacheKey: string,
  startMs: number,
  endMs: number,
  deviceId: string | null,
): Promise<{
  records: RawUvCycleRecord[];
  dailyRollups: UvDailyRollupRecord[];
  truncated: boolean;
}> {
  if (process.env.NODE_ENV !== 'test') {
    const local = await getCachedAnalyticsTelemetry();
    const localRecords = local.uvCycles
      .filter((e) => e.timestampMs >= startMs && e.timestampMs <= endMs)
      .map((e) => ({
        id: e.id,
        deviceId: e.deviceId,
        duration: e.duration,
        completed: e.completed,
        reason: e.reason ?? null,
        timestampMs: e.timestampMs,
      }));
    const filteredLocal = filterByDevice(localRecords, deviceId);
    if (filteredLocal.length > 0) {
      return { records: filteredLocal, dailyRollups: [], truncated: false };
    }
  }

  const stale = getStaleRuntimeCachedValue<CachedUvYearDataset>(cacheKey);
  if (stale) {
    return {
      records: filterByDevice(stale.records, deviceId),
      dailyRollups: stale.dailyRollups,
      truncated: stale.truncated,
    };
  }

  return { records: [], dailyRollups: [], truncated: false };
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const user = await verifyAuthToken(request);
    await requireSupervisorOrAdmin(user);

    const { searchParams } = new URL(request.url);
    const rawPeriod = (searchParams.get('period') ?? 'day').trim().toLowerCase();
    if (!VALID_PERIODS.has(rawPeriod as UvPeriod)) {
      return NextResponse.json(
        {
          success: false,
          error: 'period must be one of: day, week, month, year',
        },
        { status: 400 },
      );
    }
    const period = rawPeriod as UvPeriod;

    const rawDate = searchParams.get('date')?.trim() || null;
    if (rawDate && !isValidIsoDate(rawDate)) {
      return NextResponse.json(
        { success: false, error: 'date must be a valid YYYY-MM-DD date' },
        { status: 400 },
      );
    }

    const rawGranularity = (searchParams.get('granularity') ?? 'hour')
      .trim()
      .toLowerCase();
    if (!VALID_GRANULARITIES.has(rawGranularity as UvDayGranularity)) {
      return NextResponse.json(
        {
          success: false,
          error: 'granularity must be one of: hour, minute, second',
        },
        { status: 400 },
      );
    }
    const granularity = rawGranularity as UvDayGranularity;

    const rawHour = searchParams.get('hour')?.trim() || null;
    let hourFilter: number | null = null;
    if (rawHour !== null) {
      if (!/^\d{1,2}$/.test(rawHour)) {
        return NextResponse.json(
          { success: false, error: 'hour must be an integer between 0 and 23' },
          { status: 400 },
        );
      }
      const parsedHour = Number.parseInt(rawHour, 10);
      if (parsedHour < 0 || parsedHour > 23) {
        return NextResponse.json(
          { success: false, error: 'hour must be an integer between 0 and 23' },
          { status: 400 },
        );
      }
      hourFilter = parsedHour;
    }

    const rawDeviceId = searchParams.get('deviceId')?.trim() || null;
    if (rawDeviceId && !DEVICE_ID_RE.test(rawDeviceId)) {
      return NextResponse.json(
        { success: false, error: 'Invalid deviceId parameter' },
        { status: 400 },
      );
    }

    const rawSince = searchParams.get('since')?.trim() || null;
    let sinceMs: number | null = null;
    if (rawSince !== null) {
      if (!INTEGER_RE.test(rawSince) || rawSince.length > 15) {
        return NextResponse.json(
          { success: false, error: 'since must be a positive epoch timestamp in ms' },
          { status: 400 },
        );
      }
      const parsedSince = Number(rawSince);
      if (!Number.isSafeInteger(parsedSince) || parsedSince <= 0) {
        return NextResponse.json(
          { success: false, error: 'since must be a positive epoch timestamp in ms' },
          { status: 400 },
        );
      }
      sinceMs = parsedSince;
    }

    const rawFrom = searchParams.get('from')?.trim() || null;
    const rawTo = searchParams.get('to')?.trim() || rawFrom;
    const isCustomRangeMode = rawFrom !== null;

    if (isCustomRangeMode && rawTo) {
      const rangeCheck = validateIsoDateRange(rawFrom, rawTo, 366);
      if (!rangeCheck.ok) {
        return NextResponse.json(
          { success: false, error: rangeCheck.error },
          { status: 400 },
        );
      }
    }

    const forceRefresh =
      searchParams.get('refresh') === '1' ||
      searchParams.get('refresh') === 'true';

    const nowMs = Date.now();
    const bounds = getPhtPeriodBounds(isCustomRangeMode ? rawTo : rawDate, nowMs);
    const effectiveQueryFrom =
      isCustomRangeMode && rawFrom < bounds.queryFrom ? rawFrom : bounds.queryFrom;
    const effectiveQueryTo =
      isCustomRangeMode && rawTo && rawTo > bounds.queryTo ? rawTo : bounds.queryTo;
    const { startMs, endMs } = phtDateRangeToUtcMs(
      effectiveQueryFrom,
      effectiveQueryTo,
    );

    const cacheKey = `analytics:uv-cycles:year:${effectiveQueryFrom}:${effectiveQueryTo}`;

    if (isFirestoreQuotaCircuitOpen()) {
      const fallback = await resolveQuotaFallbackRecords(
        cacheKey,
        startMs,
        endMs,
        rawDeviceId,
      );
      if (isCustomRangeMode && rawTo) {
        const rangeData = buildUvCycleRangeReport({
          records: fallback.records,
          from: rawFrom,
          to: rawTo,
          granularity,
          hourFilter,
          deviceId: rawDeviceId,
          nowMs,
        });
        return NextResponse.json({
          success: true,
          data: rangeData,
          degraded: true,
        });
      }
      const data = buildUvCycleAnalytics({
        records: fallback.records,
        dailyRollups: fallback.dailyRollups,
        rawTruncated: fallback.truncated,
        period,
        anchorDate: bounds.anchorDate,
        granularity,
        hourFilter,
        nowMs,
      });
      return NextResponse.json({
        success: true,
        data,
        degraded: true,
      });
    }

    let dataset = getRuntimeCachedValue<CachedUvYearDataset>(cacheKey);
    let deltaAddedCount = 0;

    try {
      if (dataset) {
        const isViewingToday =
          period === 'day' && bounds.anchorDate === bounds.todayPht;
        const shouldDeltaPoll =
          forceRefresh ||
          sinceMs !== null ||
          (isViewingToday &&
            nowMs - dataset.lastDeltaCheckedAtMs >= LIVE_DELTA_COOLDOWN_MS);

        if (shouldDeltaPoll) {
          const cursorMs =
            dataset.latestTimestampMs !== null
              ? dataset.latestTimestampMs
              : startMs - 1;
          const deltaResult = await queryRawUvCyclesRange(cursorMs, endMs, {
            strictGreaterThanStart: true,
            limitCount: DELTA_UV_QUERY_LIMIT,
          });
          const merged = mergeRecords(dataset.records, deltaResult.records);
          deltaAddedCount = merged.addedCount;
          dataset = {
            ...dataset,
            records: merged.merged,
            latestTimestampMs:
              merged.merged.length > 0
                ? merged.merged[merged.merged.length - 1].timestampMs
                : dataset.latestTimestampMs,
            lastDeltaCheckedAtMs: nowMs,
          };
          setRuntimeCachedValue(cacheKey, dataset, YEAR_CACHE_TTL_MS);
        }
      } else {
        const initial = await queryRawUvCyclesRange(startMs, endMs, {
          strictGreaterThanStart: false,
          limitCount: RAW_UV_QUERY_LIMIT,
        });
        const sorted = [...initial.records].sort(
          (a, b) => a.timestampMs - b.timestampMs,
        );
        const dailyRollups = initial.hitLimit
          ? await queryUvDailyRollups(bounds.queryFrom, bounds.queryTo)
          : [];
        dataset = {
          records: sorted,
          dailyRollups,
          truncated: initial.hitLimit,
          latestTimestampMs:
            sorted.length > 0 ? sorted[sorted.length - 1].timestampMs : null,
          lastDeltaCheckedAtMs: nowMs,
        };
        setRuntimeCachedValue(cacheKey, dataset, YEAR_CACHE_TTL_MS);
      }
    } catch (queryError) {
      if (isQuotaExceededError(queryError)) {
        markFirestoreQuotaExhausted();
        console.warn('[Analytics] uv-cycles quota exceeded; returning fallback');
        const fallback = await resolveQuotaFallbackRecords(
          cacheKey,
          startMs,
          endMs,
          rawDeviceId,
        );
        if (isCustomRangeMode && rawTo) {
          const rangeData = buildUvCycleRangeReport({
            records: fallback.records,
            from: rawFrom,
            to: rawTo,
            granularity,
            hourFilter,
            deviceId: rawDeviceId,
            nowMs,
          });
          return NextResponse.json({
            success: true,
            data: rangeData,
            degraded: true,
          });
        }
        const data = buildUvCycleAnalytics({
          records: fallback.records,
          dailyRollups: fallback.dailyRollups,
          rawTruncated: fallback.truncated,
          period,
          anchorDate: bounds.anchorDate,
          granularity,
          hourFilter,
          nowMs,
        });
        return NextResponse.json({
          success: true,
          data,
          degraded: true,
        });
      }
      throw queryError;
    }

    const filteredRecords = filterByDevice(dataset.records, rawDeviceId);
    if (isCustomRangeMode && rawTo) {
      const rangeData = buildUvCycleRangeReport({
        records: filteredRecords,
        from: rawFrom,
        to: rawTo,
        granularity,
        hourFilter,
        deviceId: rawDeviceId,
        nowMs,
      });
      return NextResponse.json({
        success: true,
        data: rangeData,
        meta: {
          deltaAddedCount,
        },
      });
    }
    const data = buildUvCycleAnalytics({
      records: filteredRecords,
      dailyRollups: rawDeviceId ? [] : dataset.dailyRollups,
      rawTruncated: dataset.truncated,
      period,
      anchorDate: bounds.anchorDate,
      granularity,
      hourFilter,
      nowMs,
    });

    return NextResponse.json({
      success: true,
      data,
      meta: {
        deltaAddedCount,
      },
    });
  } catch (error) {
    if (error instanceof Response) {
      return new NextResponse(error.body, error);
    }
    if (isQuotaExceededError(error)) {
      markFirestoreQuotaExhausted();
    }
    console.error('[Analytics] uv-cycles error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch UV cycle analytics' },
      { status: 500 },
    );
  }
}
