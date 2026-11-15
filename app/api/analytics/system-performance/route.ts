// app/api/analytics/system-performance/route.ts
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { requireSupervisorOrAdmin, verifyAuthToken } from '@/lib/auth-helpers';
import { enumerateIsoDateRange, validateIsoDateRange } from '@/lib/date-utils';
import { DEFAULT_DEVICE_ID } from '@/lib/device-constants';
import {
  buildPredictiveMaintenanceSummary,
  type CampusIncidentRecord,
  type FlushSample,
  type UltrasonicSample,
} from '@/lib/predictive-maintenance';

interface DeviceDoc {
  id: string;
  name: string;
  status: 'online' | 'offline';
  lastSeen: unknown;
}

function toMillisSafe(value: unknown): number | null {
  if (!value) return null;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value < 1e12 ? value * 1000 : value;
  if (typeof value === 'string') {
    const parsed = new Date(value).getTime();
    return Number.isNaN(parsed) ? null : parsed;
  }
  if (typeof value === 'object') {
    const record = value as {
      toMillis?: () => number;
      toDate?: () => Date;
      _seconds?: number;
      seconds?: number;
    };
    if (typeof record.toMillis === 'function') return record.toMillis();
    if (typeof record.toDate === 'function') return record.toDate().getTime();
    if (typeof record._seconds === 'number') return record._seconds * 1000;
    if (typeof record.seconds === 'number') return record.seconds * 1000;
  }
  return null;
}

const PHT_OFFSET_MS = 8 * 3_600_000;
const PERF_CACHE_TTL_MS = 30_000;

interface CachedPerfEntry {
  expiresAt: number;
  payload: Record<string, unknown>;
}

const perfResponseCache = new Map<string, CachedPerfEntry>();

function toPhtIsoDate(ms: number): string {
  return new Date(ms + PHT_OFFSET_MS).toISOString().slice(0, 10);
}

interface SafeSnapshot {
  empty?: boolean;
  docs: Array<{ id?: string; data: () => Record<string, unknown> }>;
}

async function safeQueryGet(
  label: string,
  promise: Promise<SafeSnapshot> | null,
): Promise<SafeSnapshot | null> {
  if (!promise) return null;
  try {
    return await promise;
  } catch (err) {
    console.warn(`[Analytics] system-performance ${label} query degraded:`, err);
    return { empty: true, docs: [] };
  }
}

interface QueryLikeCollection {
  orderBy?: (field: string, dir?: 'asc' | 'desc') => QueryLikeCollection;
  limit?: (n: number) => QueryLikeCollection;
  get?: () => Promise<{
    docs?: Array<{ id?: string; data: () => Record<string, unknown> }>;
  }>;
}

async function safeGetCollectionDocs(
  collectionName: string,
  orderByField?: string,
  limitCount = 400,
): Promise<Array<Record<string, unknown>>> {
  try {
    const colRef = adminDb.collection(collectionName) as unknown as QueryLikeCollection;
    if (!colRef) return [];

    if (orderByField && typeof colRef.orderBy === 'function') {
      try {
        let q = colRef.orderBy(orderByField, 'desc');
        if (typeof q?.limit === 'function') {
          q = q.limit(limitCount);
        }
        if (typeof q?.get === 'function') {
          const snap = await q.get();
          return (snap?.docs ?? []).map((doc) => ({ id: doc.id, ...doc.data() }));
        }
      } catch {
        // Fallback below if single-field ordering is unsupported by a partial mock or index
      }
    }

    if (typeof colRef.limit === 'function') {
      const limited = colRef.limit(limitCount);
      if (limited && typeof limited.get === 'function') {
        const snap = await limited.get();
        return (snap?.docs ?? []).map((doc) => ({ id: doc.id, ...doc.data() }));
      }
    }

    if (typeof colRef.get === 'function') {
      const snap = await colRef.get();
      return (snap?.docs ?? []).map((doc) => ({ id: doc.id, ...doc.data() }));
    }

    return [];
  } catch {
    return [];
  }
}

async function safeGetWearCounters(
  deviceId: string,
): Promise<Record<string, unknown> | null> {
  try {
    const colRef = adminDb.collection('devices') as unknown as {
      doc?: (id: string) => {
        collection?: (sub: string) => {
          doc?: (subId: string) => {
            get?: () => Promise<{
              exists?: boolean;
              data?: () => Record<string, unknown>;
            }>;
          };
        };
      };
    };
    const docSnap = await colRef
      ?.doc?.(deviceId)
      ?.collection?.('maintenanceCounters')
      ?.doc?.('current')
      ?.get?.();
    if (docSnap && docSnap.exists && typeof docSnap.data === 'function') {
      return docSnap.data() ?? null;
    }
    return null;
  } catch {
    return null;
  }
}

async function safeGetRecentUltrasonicSamples(
  deviceId: string,
  dates: string[],
): Promise<UltrasonicSample[]> {
  try {
    const recentDates = dates.slice(-1);
    const colRef = adminDb.collection('sensorReadings') as unknown as {
      doc?: (date: string) => {
        collection?: (sub: string) => {
          where?: (
            field: string,
            op: string,
            val: unknown,
          ) => {
            limit?: (n: number) => {
              get?: () => Promise<{
                docs?: Array<{ data: () => Record<string, unknown> }>;
              }>;
            };
            get?: () => Promise<{
              docs?: Array<{ data: () => Record<string, unknown> }>;
            }>;
          };
        };
      };
    };
    if (!colRef || typeof colRef.doc !== 'function') return [];

    const snapshots = await Promise.all(
      recentDates.map(async (date) => {
        const sub = colRef.doc?.(date)?.collection?.('readings');
        const filtered = sub?.where?.('deviceId', '==', deviceId);
        if (!filtered) return [];
        const limited =
          typeof filtered.limit === 'function' ? filtered.limit(40) : filtered;
        const snap = await limited?.get?.();
        return (snap?.docs ?? []).map((d) => d.data());
      }),
    );

    return snapshots
      .flat()
      .filter((doc) => doc.sensorType === 'ultrasonic')
      .map((doc) => ({
        value: typeof doc.value === 'number' ? doc.value : Number(doc.value ?? 0),
        timestampMs: toMillisSafe(doc.timestamp) ?? undefined,
      }))
      .filter((sample) => Number.isFinite(sample.value));
  } catch {
    return [];
  }
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const user = await verifyAuthToken(request);
    await requireSupervisorOrAdmin(user);

    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to') ?? from;
    const requestedDeviceId = searchParams.get('deviceId')?.trim() || null;

    if (from && to) {
      const rangeCheck = validateIsoDateRange(from, to, 366);
      if (!rangeCheck.ok) {
        return NextResponse.json(
          { success: false, error: rangeCheck.error },
          { status: 400 },
        );
      }
    }

    const nowMs = Date.now();
    const useCache = process.env.NODE_ENV !== 'test';
    const cacheKey = `${from ?? ''}:${to ?? ''}:${requestedDeviceId ?? ''}`;
    if (useCache) {
      const cached = perfResponseCache.get(cacheKey);
      if (cached && cached.expiresAt > nowMs) {
        return NextResponse.json(cached.payload);
      }
    }

    const todayPht = toPhtIsoDate(nowMs);
    const sevenDaysAgoPht = toPhtIsoDate(nowMs - 6 * 86_400_000);
    const windowFrom = from ?? sevenDaysAgoPht;
    const windowTo = to ?? todayPht;
    const windowDates = enumerateIsoDateRange(windowFrom, windowTo);

    const snap = await safeQueryGet(
      'devices',
      adminDb.collection('devices').get() as Promise<SafeSnapshot>,
    );
    const fiveMinAgoMillis = nowMs - 5 * 60 * 1000;

    const devices = (snap?.docs ?? []).map((d) => {
      const data = d.data() as Partial<DeviceDoc>;
      const docId = d.id || 'unknown-device';
      return {
        ...data,
        id: data.id || docId,
        name: data.name || data.id || docId,
      } as DeviceDoc;
    });
    const totalCount = devices.length;
    const primaryDeviceId =
      requestedDeviceId ?? devices[0]?.id ?? DEFAULT_DEVICE_ID;

    const onlineDevices = devices.filter((d) => {
      const lastSeenMillis = toMillisSafe(d.lastSeen);
      return lastSeenMillis !== null && lastSeenMillis >= fiveMinAgoMillis;
    });

    const onlineCount = onlineDevices.length;
    const liveSnapshotPercent =
      totalCount === 0
        ? 0
        : Math.round((onlineCount / totalCount) * 10000) / 100;

    let periodUptimePercent = liveSnapshotPercent;
    let dailyList: Array<{ date: string; uptimePercent: number }> = [];

    const uptimePromise =
      from && to
        ? safeQueryGet(
            'deviceUptimeDaily',
            adminDb
              .collection('deviceUptimeDaily')
              .where('date', '>=', from)
              .where('date', '<=', to)
              .get() as Promise<SafeSnapshot>,
          )
        : Promise.resolve(null);

    const [
      uptimeSnap,
      rawWearCounters,
      flushDocs,
      uvDocs,
      lidDocs,
      taskDocs,
      issueReportDocs,
      ultrasonicSamples,
    ] = await Promise.all([
      uptimePromise,
      safeGetWearCounters(primaryDeviceId),
      safeGetCollectionDocs('flushEvents', 'timestamp', 60),
      safeGetCollectionDocs('uvCycles', 'timestamp', 40),
      safeGetCollectionDocs('lidEvents', 'timestamp', 60),
      safeGetCollectionDocs('tasks', 'createdAt', 60),
      safeGetCollectionDocs('issueReports', 'lastReportedAt', 50),
      safeGetRecentUltrasonicSamples(primaryDeviceId, windowDates),
    ]);

    if (from && to && uptimeSnap) {
      const allDates = enumerateIsoDateRange(from, to);

      const dayMap = new Map<string, { onlineMinutes: number; totalMinutes: number }>();
      for (const doc of uptimeSnap.docs) {
        const data = doc.data();
        const date = data.date as string;
        const existing = dayMap.get(date) ?? { onlineMinutes: 0, totalMinutes: 0 };
        existing.onlineMinutes += Number(data.onlineMinutes ?? 0);
        existing.totalMinutes += Number(data.totalMinutes ?? 0);
        dayMap.set(date, existing);
      }

      let totalOnline = 0;
      let totalTracked = 0;

      dailyList = allDates.map((date) => {
        const entry = dayMap.get(date);
        if (entry && entry.totalMinutes > 0) {
          totalOnline += entry.onlineMinutes;
          totalTracked += entry.totalMinutes;
          const dayPct =
            Math.round((entry.onlineMinutes / entry.totalMinutes) * 1000) / 10;
          return { date, uptimePercent: dayPct };
        }

        // For dates where minute tracking has not accumulated or cold start:
        const todayStr = new Date().toISOString().slice(0, 10);
        const fallbackPct = date === todayStr ? liveSnapshotPercent : 100;
        return { date, uptimePercent: fallbackPct };
      });

      if (totalTracked > 0) {
        periodUptimePercent =
          Math.round((totalOnline / totalTracked) * 1000) / 10;
      }
    }

    const dailyBucketMap = new Map<
      string,
      { flushCount: number; waterLiters: number }
    >();
    for (const date of windowDates) {
      dailyBucketMap.set(date, { flushCount: 0, waterLiters: 0 });
    }

    let observedFlushes = 0;
    let observedWaterLiters = 0;
    const flushSamples: FlushSample[] = [];

    for (const doc of flushDocs) {
      const ts = toMillisSafe(doc.timestamp);
      const waterVolume =
        typeof doc.waterVolume === 'number' && Number.isFinite(doc.waterVolume)
          ? Math.max(0, doc.waterVolume)
          : 0;
      const duration =
        typeof doc.duration === 'number' && Number.isFinite(doc.duration)
          ? doc.duration
          : 0;

      if (duration > 0) {
        flushSamples.push({
          waterVolume,
          duration,
          timestampMs: ts ?? undefined,
        });
      }

      if (ts !== null) {
        const phtDate = toPhtIsoDate(ts);
        if (phtDate >= windowFrom && phtDate <= windowTo) {
          observedFlushes += 1;
          observedWaterLiters += waterVolume;
          const bucket = dailyBucketMap.get(phtDate);
          if (bucket) {
            bucket.flushCount += 1;
            bucket.waterLiters += waterVolume;
          }
        }
      }
    }

    let observedUvSeconds = 0;
    for (const doc of uvDocs) {
      const ts = toMillisSafe(doc.timestamp);
      const duration =
        typeof doc.duration === 'number' && Number.isFinite(doc.duration)
          ? Math.max(0, doc.duration)
          : 0;
      if (ts !== null) {
        const phtDate = toPhtIsoDate(ts);
        if (phtDate >= windowFrom && phtDate <= windowTo) {
          observedUvSeconds += duration;
        }
      }
    }

    let observedLidCycles = 0;
    for (const doc of lidDocs) {
      const ts = toMillisSafe(doc.timestamp);
      if (doc.status !== undefined && doc.status !== 'open') continue;
      if (ts !== null) {
        const phtDate = toPhtIsoDate(ts);
        if (phtDate >= windowFrom && phtDate <= windowTo) {
          observedLidCycles += 1;
        }
      }
    }

    const incidents: CampusIncidentRecord[] = [];
    for (const doc of taskDocs) {
      const deviceId = typeof doc.deviceId === 'string' ? doc.deviceId : '';
      const ts = toMillisSafe(doc.createdAt);
      if (deviceId && ts !== null) {
        incidents.push({
          deviceId,
          timestampMs: ts,
          source: 'task',
        });
      }
    }
    for (const doc of issueReportDocs) {
      if (doc.status === 'dismissed') continue;
      const deviceId = typeof doc.deviceId === 'string' ? doc.deviceId : '';
      const ts = toMillisSafe(doc.lastReportedAt ?? doc.firstReportedAt);
      if (deviceId && ts !== null) {
        incidents.push({
          deviceId,
          timestampMs: ts,
          source: 'issue_report',
          category: typeof doc.category === 'string' ? doc.category : undefined,
        });
      }
    }

    const historicalDaily = windowDates.map((date) => {
      const bucket = dailyBucketMap.get(date) ?? {
        flushCount: 0,
        waterLiters: 0,
      };
      return {
        date,
        flushCount: bucket.flushCount,
        waterLiters: Math.round(bucket.waterLiters * 100) / 100,
      };
    });

    const predictiveMaintenance = buildPredictiveMaintenanceSummary({
      deviceId: primaryDeviceId,
      rawCounters: rawWearCounters,
      windowDays: windowDates.length,
      observedWindowTotals: {
        flushes: observedFlushes,
        waterLiters: observedWaterLiters,
        uvSeconds: observedUvSeconds,
        lidCycles: observedLidCycles,
      },
      flushSamples,
      ultrasonicSamples,
      historicalDaily,
      incidents,
      nowMs,
    });

    const payload = {
      success: true,
      data: {
        uptimePercent: periodUptimePercent,
        liveSnapshotPercent,
        onlineCount,
        totalCount,
        daily: dailyList,
        devices: devices.map((d) => {
          const lastSeenMillis = toMillisSafe(d.lastSeen);
          return {
            id: d.id,
            name: d.name,
            status:
              lastSeenMillis !== null && lastSeenMillis >= fiveMinAgoMillis
                ? 'online'
                : 'offline',
            lastSeen:
              lastSeenMillis !== null
                ? new Date(lastSeenMillis).toISOString()
                : null,
          };
        }),
        predictiveMaintenance,
      },
    };

    if (useCache) {
      perfResponseCache.set(cacheKey, {
        expiresAt: nowMs + PERF_CACHE_TTL_MS,
        payload,
      });
    }

    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof Response) return new NextResponse(error.body, error);
    console.error('[Analytics] system-performance error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch system performance' },
      { status: 500 },
    );
  }
}
