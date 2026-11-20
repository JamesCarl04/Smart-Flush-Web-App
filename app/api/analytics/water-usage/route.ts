// app/api/analytics/water-usage/route.ts
import { NextResponse } from 'next/server';
import { enumerateIsoDateRange, validateIsoDateRange } from '@/lib/date-utils';
import { adminDb } from '@/lib/firebase-admin';
import { requireSupervisorOrAdmin, verifyAuthToken } from '@/lib/auth-helpers';
import { Timestamp } from 'firebase-admin/firestore';
import {
  getCachedAnalyticsTelemetry,
  getRuntimeCachedValue,
  getStaleRuntimeCachedValue,
  isFirestoreQuotaCircuitOpen,
  isQuotaExceededError,
  markFirestoreQuotaExhausted,
  setRuntimeCachedValue,
} from '@/lib/local-runtime-cache';

const WATER_USAGE_CACHE_TTL_MS = 120_000;
const PHT_OFFSET_MS = 8 * 3_600_000;

interface FlushEventDoc {
  waterVolume: number;
  timestamp: unknown;
}

function toDateSafe(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'number') return new Date(value < 1e12 ? value * 1000 : value);
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value === 'object') {
    const record = value as {
      toDate?: () => Date;
      toMillis?: () => number;
      _seconds?: number;
      seconds?: number;
    };
    if (typeof record.toDate === 'function') return record.toDate();
    if (typeof record.toMillis === 'function') return new Date(record.toMillis());
    if (typeof record._seconds === 'number') return new Date(record._seconds * 1000);
    if (typeof record.seconds === 'number') return new Date(record.seconds * 1000);
  }
  return null;
}

interface WaterUsageDay {
  date: string;
  totalVolume: number;
  avgVolume: number;
  flushCount: number;
}

function aggregateWaterUsage(
  entries: Array<{ waterVolume: number; timestamp: unknown }>,
  from?: string | null,
  to?: string | null,
): WaterUsageDay[] {
  const grouped = new Map<string, number[]>();
  for (const d of entries) {
    const parsedDate = toDateSafe(d.timestamp);
    if (!parsedDate) continue;
    const date = new Date(parsedDate.getTime() + PHT_OFFSET_MS)
      .toISOString()
      .slice(0, 10);
    const existing = grouped.get(date) ?? [];
    existing.push(d.waterVolume ?? 0);
    grouped.set(date, existing);
  }

  if (grouped.size === 0) {
    return [];
  }

  // Zero-fill every calendar day in the requested window so charts and OLS regression share an identical X-axis
  const orderedDates =
    from && to
      ? Array.from(
          new Set([...enumerateIsoDateRange(from, to), ...grouped.keys()]),
        ).sort((a, b) => a.localeCompare(b))
      : Array.from(grouped.keys()).sort((a, b) => a.localeCompare(b));

  const result: WaterUsageDay[] = [];
  for (const date of orderedDates) {
    const volumes = grouped.get(date) ?? [];
    const totalVolume = volumes.reduce((a, b) => a + b, 0);
    const avgVolume = volumes.length > 0 ? totalVolume / volumes.length : 0;
    result.push({
      date,
      totalVolume: Math.round(totalVolume * 100) / 100,
      avgVolume: Math.round(avgVolume * 100) / 100,
      flushCount: volumes.length,
    });
  }

  return result;
}

async function resolveWaterUsageQuotaFallback(
  cacheKey: string,
  fromMs: number,
  toMs: number,
  from: string,
  to: string,
): Promise<WaterUsageDay[]> {
  const stale = getStaleRuntimeCachedValue<WaterUsageDay[]>(cacheKey);
  if (stale) {
    return stale;
  }
  if (process.env.NODE_ENV === 'test') {
    return [];
  }
  const local = await getCachedAnalyticsTelemetry();
  const inRange = local.flushEvents
    .filter((e) => e.timestampMs >= fromMs && e.timestampMs <= toMs)
    .map((e) => ({ waterVolume: e.waterVolume, timestamp: e.timestampMs }));
  return aggregateWaterUsage(inRange, from, to);
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const user = await verifyAuthToken(request);
    await requireSupervisorOrAdmin(user);

    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to') ?? from;

    if (from && to) {
      const rangeCheck = validateIsoDateRange(from, to);
      if (!rangeCheck.ok) {
        return NextResponse.json(
          { success: false, error: rangeCheck.error },
          { status: 400 },
        );
      }
    }

    if (!from) {
      return NextResponse.json(
        {
          success: false,
          error: 'from query parameter is required (YYYY-MM-DD)',
        },
        { status: 400 },
      );
    }

    const cacheKey = `analytics:water-usage:${from}:${to}`;
    const cached = getRuntimeCachedValue<WaterUsageDay[]>(cacheKey);
    if (cached) {
      return NextResponse.json({ success: true, data: cached });
    }

    const fromDate = new Date(`${from}T00:00:00.000+08:00`);
    const toDate = new Date(`${to}T23:59:59.999+08:00`);
    const fromMs = fromDate.getTime();
    const toMs = toDate.getTime();

    if (isFirestoreQuotaCircuitOpen()) {
      const fallback = await resolveWaterUsageQuotaFallback(
        cacheKey,
        fromMs,
        toMs,
        from,
        to ?? from,
      );
      return NextResponse.json({
        success: true,
        data: fallback,
        degraded: true,
      });
    }

    const fromTs = Timestamp.fromDate(fromDate);
    const toTs = Timestamp.fromDate(toDate);

    let snap;
    try {
      const waterQuery = adminDb
        .collection('flushEvents')
        .where('timestamp', '>=', fromTs)
        .where('timestamp', '<=', toTs)
        .orderBy('timestamp', 'asc');
      snap = await (typeof waterQuery.limit === 'function'
        ? waterQuery.limit(500).get()
        : waterQuery.get());
    } catch (queryError) {
      if (isQuotaExceededError(queryError)) {
        markFirestoreQuotaExhausted();
        console.warn('[Analytics] water-usage quota exceeded; returning fallback');
        const fallback = await resolveWaterUsageQuotaFallback(
          cacheKey,
          fromMs,
          toMs,
          from,
          to ?? from,
        );
        return NextResponse.json({
          success: true,
          data: fallback,
          degraded: true,
        });
      }
      throw queryError;
    }

    const result = aggregateWaterUsage(
      snap.docs.map((doc) => doc.data() as FlushEventDoc),
      from,
      to ?? from,
    );

    setRuntimeCachedValue(cacheKey, result, WATER_USAGE_CACHE_TTL_MS);

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof Response) return new NextResponse(error.body, error);
    console.error('[Analytics] water-usage error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch water usage' },
      { status: 500 },
    );
  }
}
