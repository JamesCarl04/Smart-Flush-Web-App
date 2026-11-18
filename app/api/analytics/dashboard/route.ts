// app/api/analytics/dashboard/route.ts
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { requireSupervisorOrAdmin, verifyAuthToken } from '@/lib/auth-helpers';
import { Timestamp } from 'firebase-admin/firestore';
import {
  getRuntimeCachedValue,
  getStaleRuntimeCachedValue,
  isFirestoreQuotaCircuitOpen,
  isQuotaExceededError,
  markFirestoreQuotaExhausted,
  setRuntimeCachedValue,
} from '@/lib/local-runtime-cache';

const DASHBOARD_CACHE_TTL_MS = 30_000;

interface FlushEventDoc {
  waterVolume: number;
  timestamp: Timestamp;
}

interface UVCycleDoc {
  completed: boolean;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

interface SafeQueryResult {
  size: number;
  empty: boolean;
  docs: Array<{ id?: string; data: () => Record<string, unknown> }>;
}

async function safeQueryGet(
  label: string,
  promiseFactory: (() => Promise<SafeQueryResult>) | null,
): Promise<SafeQueryResult | null> {
  if (!promiseFactory) return null;
  if (isFirestoreQuotaCircuitOpen()) {
    return { size: 0, empty: true, docs: [] };
  }
  try {
    return await promiseFactory();
  } catch (err) {
    if (isQuotaExceededError(err)) {
      markFirestoreQuotaExhausted();
    }
    console.warn(`[Analytics] dashboard ${label} query degraded:`, err);
    return { size: 0, empty: true, docs: [] };
  }
}

/** Converts Firestore Timestamp, serialized {_seconds}, ISO string or epoch to millis. */
function toMillisLoose(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === 'string' || typeof value === 'number') {
    const ms = new Date(value).getTime();
    return Number.isNaN(ms) ? null : ms;
  }
  if (typeof value === 'object') {
    const v = value as { toMillis?: unknown; _seconds?: unknown };
    if (typeof v.toMillis === 'function') return (v.toMillis as () => number).call(value);
    if (typeof v._seconds === 'number') return v._seconds * 1000;
  }
  return null;
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const user = await verifyAuthToken(request);
    await requireSupervisorOrAdmin(user);

    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to') ?? from;

    if (
      (from && !ISO_DATE.test(from)) ||
      (to && !ISO_DATE.test(to)) ||
      (from && Number.isNaN(new Date(`${from}T00:00:00.000Z`).getTime())) ||
      (to && Number.isNaN(new Date(`${to}T00:00:00.000Z`).getTime()))
    ) {
      return NextResponse.json(
        { success: false, error: 'from/to must be dates in YYYY-MM-DD format' },
        { status: 400 },
      );
    }

    const cacheKey = `analytics:dashboard:${from ?? ''}:${to ?? ''}`;
    const cached = getRuntimeCachedValue<Record<string, unknown>>(cacheKey);
    if (cached) {
      return NextResponse.json({ success: true, data: cached });
    }

    if (isFirestoreQuotaCircuitOpen()) {
      const stale = getStaleRuntimeCachedValue<Record<string, unknown>>(cacheKey);
      if (stale) {
        return NextResponse.json({ success: true, data: stale, degraded: true });
      }
    }

    let flushQuery: FirebaseFirestore.Query = adminDb.collection('flushEvents');
    let uvQuery: FirebaseFirestore.Query = adminDb.collection('uvCycles');

    if (from) {
      const fromTs = Timestamp.fromDate(new Date(`${from}T00:00:00.000Z`));
      const toTs = Timestamp.fromDate(new Date(`${to}T23:59:59.999Z`));
      flushQuery = flushQuery.where('timestamp', '>=', fromTs).where('timestamp', '<=', toTs);
      uvQuery = uvQuery.where('timestamp', '>=', fromTs).where('timestamp', '<=', toTs);
    }

    const boundedFlushQuery =
      typeof flushQuery.limit === 'function' ? flushQuery.limit(500) : flushQuery;
    const boundedUvQuery =
      typeof uvQuery.limit === 'function' ? uvQuery.limit(500) : uvQuery;
    const devicesCol = adminDb.collection('devices');
    const boundedDevicesQuery =
      typeof devicesCol.limit === 'function' ? devicesCol.limit(200) : devicesCol;
    const uptimeDailyQuery =
      from && to
        ? adminDb
            .collection('deviceUptimeDaily')
            .where('date', '>=', from)
            .where('date', '<=', to)
        : null;
    const boundedUptimeQuery =
      uptimeDailyQuery && typeof uptimeDailyQuery.limit === 'function'
        ? uptimeDailyQuery.limit(500)
        : uptimeDailyQuery;

    // Fetch all collections in parallel with fault-tolerant wrappers
    const [flushSnap, uvSnap, devicesSnap, uptimeDailySnap] = await Promise.all([
      safeQueryGet(
        'flushEvents',
        () => boundedFlushQuery.get() as Promise<SafeQueryResult>,
      ),
      safeQueryGet(
        'uvCycles',
        () => boundedUvQuery.get() as Promise<SafeQueryResult>,
      ),
      safeQueryGet(
        'devices',
        () => boundedDevicesQuery.get() as Promise<SafeQueryResult>,
      ),
      safeQueryGet(
        'deviceUptimeDaily',
        boundedUptimeQuery
          ? () => boundedUptimeQuery.get() as Promise<SafeQueryResult>
          : null,
      ),
    ]);

    const safeFlushDocs = flushSnap?.docs ?? [];
    const safeUvDocs = uvSnap?.docs ?? [];
    const safeDevicesDocs = devicesSnap?.docs ?? [];

    // Total flushes and water usage
    const totalFlushes = flushSnap?.size ?? safeFlushDocs.length;
    let totalWaterLiters = 0;
    const dateSet = new Set<string>();

    for (const doc of safeFlushDocs) {
      const d = doc.data() as unknown as FlushEventDoc;
      totalWaterLiters += d.waterVolume ?? 0;

      const tsMillis = toMillisLoose(d.timestamp);
      const dateObj = tsMillis === null ? null : new Date(tsMillis);

      if (dateObj && !isNaN(dateObj.getTime())) {
        const date = dateObj.toISOString().slice(0, 10);
        dateSet.add(date);
      }
    }

    const distinctDays = dateSet.size || 1;
    const avgFlushesPerDay =
      Math.round((totalFlushes / distinctDays) * 100) / 100;

    // UV completion rate
    const uvDocs = safeUvDocs.map((d) => d.data() as unknown as UVCycleDoc);
    const totalUV = uvDocs.length;
    const completedUV = uvDocs.filter((d) => d.completed).length;
    const failedUV = totalUV - completedUV;
    const uvCompletionRate =
      totalUV === 0 ? null : Math.round((completedUV / totalUV) * 10000) / 100;

    // Live Snapshot: active hardware devices with lastSeen within the last 5 minutes
    const FIVE_MIN_AGO = Timestamp.fromMillis(Date.now() - 5 * 60 * 1000);
    const activeDeviceDocs = safeDevicesDocs.filter(
      (d) => toMillisLoose(d.data().lastSeen) !== null,
    );
    const hardwareDeviceDocs =
      activeDeviceDocs.length > 0 ? activeDeviceDocs : safeDevicesDocs;
    const totalDevices = hardwareDeviceDocs.length;
    const onlineDevices = hardwareDeviceDocs.filter((d) => {
      const lastSeenMillis = toMillisLoose(d.data().lastSeen) ?? 0;
      return lastSeenMillis >= FIVE_MIN_AGO.toMillis();
    }).length;

    const scopedDeviceIds = new Set<string>();
    for (const d of hardwareDeviceDocs) {
      const data = d.data();
      const id =
        typeof d.id === 'string' && d.id.trim()
          ? d.id.trim()
          : typeof data.id === 'string' && data.id.trim()
            ? data.id.trim()
            : '';
      if (id) scopedDeviceIds.add(id);
    }

    const liveSnapshotPercent =
      totalDevices === 0
        ? 0
        : Math.round((onlineDevices / totalDevices) * 10000) / 100;

    // Calculate historical period SLA uptime if daily aggregation records exist
    let periodUptimePercent = liveSnapshotPercent;
    if (uptimeDailySnap && !uptimeDailySnap.empty) {
      let totalOnlineMin = 0;
      let totalTrackedMin = 0;
      for (const doc of uptimeDailySnap.docs) {
        const data = doc.data();
        const docDeviceId =
          typeof data.deviceId === 'string' ? data.deviceId.trim() : '';
        if (
          docDeviceId &&
          scopedDeviceIds.size > 0 &&
          !scopedDeviceIds.has(docDeviceId)
        ) {
          continue;
        }
        totalOnlineMin += Number(data.onlineMinutes ?? 0);
        totalTrackedMin += Number(data.totalMinutes ?? 0);
      }
      if (totalTrackedMin > 0) {
        periodUptimePercent = Math.min(
          100,
          Math.max(0, Math.round((totalOnlineMin / totalTrackedMin) * 1000) / 10),
        );
      }
    }

    const dashboardData = {
      totalFlushes,
      totalWaterLiters: Math.round(totalWaterLiters * 100) / 100,
      uvCompletionRate,
      uvStats: {
        total: totalUV,
        completed: completedUV,
        failed: failedUV,
      },
      avgFlushesPerDay,
      uptimePercent: periodUptimePercent,
      liveSnapshotPercent,
    };

    if (isFirestoreQuotaCircuitOpen()) {
      const stale = getStaleRuntimeCachedValue<Record<string, unknown>>(cacheKey);
      if (stale) {
        return NextResponse.json({
          success: true,
          data: stale,
          degraded: true,
        });
      }
      return NextResponse.json({
        success: true,
        data: dashboardData,
        degraded: true,
      });
    }

    setRuntimeCachedValue(cacheKey, dashboardData, DASHBOARD_CACHE_TTL_MS);

    return NextResponse.json({
      success: true,
      data: dashboardData,
    });
  } catch (error: unknown) {
    if (error instanceof Response) {
      return new NextResponse(error.body, error);
    }
    if (isQuotaExceededError(error)) {
      markFirestoreQuotaExhausted();
    }
    console.error('[Analytics] dashboard error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch dashboard analytics' },
      { status: 500 },
    );
  }
}
