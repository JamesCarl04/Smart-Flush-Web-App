// app/api/analytics/system-performance/route.ts
import { NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
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
import {
  getCachedAnalyticsTelemetry,
  getRuntimeCachedValue,
  getStaleRuntimeCachedValue,
  isFirestoreQuotaCircuitOpen,
  isQuotaExceededError,
  markFirestoreQuotaExhausted,
  setRuntimeCachedValue,
} from '@/lib/local-runtime-cache';

interface DeviceDoc {
  id: string;
  name: string;
  status: 'online' | 'offline';
  lastSeen: unknown;
}

function computeFleetSnapshot(
  devicesList: DeviceDoc[],
  requestedDeviceId: string | null,
  fiveMinAgoMillis: number,
) {
  const requestedDevices = requestedDeviceId
    ? devicesList.filter((d) => d.id === requestedDeviceId)
    : [];
  const activeDevices = devicesList.filter(
    (d) => toMillisSafe(d.lastSeen) !== null,
  );
  const hardwareDevices = requestedDeviceId
    ? requestedDevices.length > 0
      ? requestedDevices
      : activeDevices.length > 0
        ? activeDevices
        : devicesList
    : activeDevices.length > 0
      ? activeDevices
      : devicesList;

  const totalCount = hardwareDevices.length;
  const defaultHardwareDevice =
    hardwareDevices.find((d) => d.id === DEFAULT_DEVICE_ID) ??
    devicesList.find((d) => d.id === DEFAULT_DEVICE_ID);
  const primaryDeviceId =
    requestedDeviceId ??
    defaultHardwareDevice?.id ??
    hardwareDevices[0]?.id ??
    devicesList[0]?.id ??
    DEFAULT_DEVICE_ID;
  const onlineCount = hardwareDevices.filter((d) => {
    const lastSeenMillis = toMillisSafe(d.lastSeen);
    return lastSeenMillis !== null && lastSeenMillis >= fiveMinAgoMillis;
  }).length;
  const liveSnapshotPercent =
    totalCount === 0
      ? 0
      : Math.round((onlineCount / totalCount) * 10000) / 100;
  const scopedDeviceIds = new Set(hardwareDevices.map((d) => d.id));
  if (requestedDeviceId) {
    scopedDeviceIds.add(requestedDeviceId);
  }

  return {
    totalCount,
    primaryDeviceId,
    onlineCount,
    liveSnapshotPercent,
    scopedDeviceIds,
  };
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
const PERF_CACHE_TTL_MS = 120_000;

function toPhtIsoDate(ms: number): string {
  return new Date(ms + PHT_OFFSET_MS).toISOString().slice(0, 10);
}

interface SafeSnapshot {
  empty?: boolean;
  docs: Array<{ id?: string; data: () => Record<string, unknown> }>;
}

async function safeQueryGet(
  label: string,
  promiseFactory: (() => Promise<SafeSnapshot>) | null,
): Promise<SafeSnapshot | null> {
  if (!promiseFactory) return null;
  if (isFirestoreQuotaCircuitOpen()) {
    return { empty: true, docs: [] };
  }
  try {
    return await promiseFactory();
  } catch (err) {
    if (isQuotaExceededError(err)) {
      markFirestoreQuotaExhausted();
    }
    console.warn(`[Analytics] system-performance ${label} query degraded:`, err);
    return { empty: true, docs: [] };
  }
}

interface QueryLikeCollection {
  where?: (field: string, op: string, value: unknown) => QueryLikeCollection;
  orderBy?: (field: string, dir?: 'asc' | 'desc') => QueryLikeCollection;
  limit?: (n: number) => QueryLikeCollection;
  get?: () => Promise<{
    docs?: Array<{ id?: string; data: () => Record<string, unknown> }>;
  }>;
}

async function safeGetCollectionDocs(
  collectionName: string,
  orderByField?: string,
  limitCount = 500,
  timeRange?: { fromTs: Timestamp; toTs: Timestamp } | null,
): Promise<Array<Record<string, unknown>>> {
  if (isFirestoreQuotaCircuitOpen()) {
    return [];
  }

  try {
    const colRef = adminDb.collection(collectionName) as unknown as QueryLikeCollection;
    if (!colRef) return [];

    if (orderByField && timeRange && typeof colRef.where === 'function') {
      try {
        let q = colRef.where(orderByField, '>=', timeRange.fromTs);
        if (typeof q?.where === 'function') {
          q = q.where(orderByField, '<=', timeRange.toTs);
        }
        if (typeof q?.orderBy === 'function') {
          q = q.orderBy(orderByField, 'desc');
        }
        if (typeof q?.limit === 'function') {
          q = q.limit(limitCount);
        }
        if (typeof q?.get === 'function') {
          const snap = await q.get();
          return (snap?.docs ?? []).map((doc) => ({ id: doc.id, ...doc.data() }));
        }
      } catch (rangeErr) {
        if (isQuotaExceededError(rangeErr)) {
          markFirestoreQuotaExhausted();
          return [];
        }
        // Fallback below if range query is unsupported by a partial mock or index
      }
    }

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
      } catch (orderErr) {
        if (isQuotaExceededError(orderErr)) {
          markFirestoreQuotaExhausted();
          return [];
        }
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
  } catch (err) {
    if (isQuotaExceededError(err)) {
      markFirestoreQuotaExhausted();
    }
    return [];
  }
}

async function safeGetWearCounters(
  deviceId: string,
): Promise<Record<string, unknown> | null> {
  if (isFirestoreQuotaCircuitOpen()) {
    return null;
  }

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
  } catch (err) {
    if (isQuotaExceededError(err)) {
      markFirestoreQuotaExhausted();
    }
    return null;
  }
}

async function safeGetRecentUltrasonicSamples(
  deviceId: string,
  dates: string[],
): Promise<UltrasonicSample[]> {
  if (isFirestoreQuotaCircuitOpen()) {
    return [];
  }

  try {
    const utcToday = new Date().toISOString().slice(0, 10);
    const recentDates = Array.from(new Set([...dates.slice(-2), utcToday]));
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
          typeof filtered.limit === 'function' ? filtered.limit(120) : filtered;
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
      .filter((sample) => Number.isFinite(sample.value))
      .sort((a, b) => (a.timestampMs ?? 0) - (b.timestampMs ?? 0))
      .slice(-40);
  } catch (err) {
    if (isQuotaExceededError(err)) {
      markFirestoreQuotaExhausted();
    }
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
    const includeCampusRisk = searchParams.get('includeCampusRisk') !== 'false';

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
    const cacheKey = `analytics:sysperf:${from ?? ''}:${to ?? ''}:${requestedDeviceId ?? ''}:${includeCampusRisk ? '1' : '0'}`;
    const cached = getRuntimeCachedValue<Record<string, unknown>>(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    if (isFirestoreQuotaCircuitOpen()) {
      const stale = getStaleRuntimeCachedValue<Record<string, unknown>>(cacheKey);
      if (stale) {
        return NextResponse.json({ ...stale, degraded: true });
      }
    }

    const todayPht = toPhtIsoDate(nowMs);
    const sevenDaysAgoPht = toPhtIsoDate(nowMs - 6 * 86_400_000);
    const windowFrom = from ?? sevenDaysAgoPht;
    const windowTo = to ?? todayPht;
    const windowDates = enumerateIsoDateRange(windowFrom, windowTo);
    const windowTimeRange =
      from && to
        ? {
            fromTs: Timestamp.fromDate(new Date(`${from}T00:00:00.000+08:00`)),
            toTs: Timestamp.fromDate(new Date(`${to}T23:59:59.999+08:00`)),
          }
        : null;

    const devicesCol = adminDb.collection('devices');
    const boundedDevicesQuery =
      typeof devicesCol.limit === 'function' ? devicesCol.limit(200) : devicesCol;
    const snap = await safeQueryGet(
      'devices',
      () => boundedDevicesQuery.get() as Promise<SafeSnapshot>,
    );
    const fiveMinAgoMillis = nowMs - 5 * 60 * 1000;

    let devices = (snap?.docs ?? []).map((d) => {
      const data = d.data() as Partial<DeviceDoc>;
      const docId = d.id || 'unknown-device';
      return {
        ...data,
        id: data.id || docId,
        name: data.name || data.id || docId,
      } as DeviceDoc;
    });

    let fleet = computeFleetSnapshot(devices, requestedDeviceId, fiveMinAgoMillis);
    let periodUptimePercent = fleet.liveSnapshotPercent;
    let uptimeSource: 'tracked' | 'telemetry_fallback' | 'live_snapshot' =
      'live_snapshot';
    let dailyList: Array<{ date: string; uptimePercent: number }> = [];

    const uptimeQuery =
      from && to
        ? adminDb
            .collection('deviceUptimeDaily')
            .where('date', '>=', from)
            .where('date', '<=', to)
        : null;
    const boundedUptimeQuery =
      uptimeQuery && typeof uptimeQuery.limit === 'function'
        ? uptimeQuery.limit(500)
        : uptimeQuery;

    const uptimePromise = boundedUptimeQuery
      ? safeQueryGet(
          'deviceUptimeDaily',
          () => boundedUptimeQuery.get() as Promise<SafeSnapshot>,
        )
      : Promise.resolve(null);

    const [
      uptimeSnap,
      rawWearCounters,
      initialFlushDocs,
      initialUvDocs,
      initialLidDocs,
      taskDocs,
      issueReportDocs,
      initialUltrasonicSamples,
    ] = await Promise.all([
      uptimePromise,
      safeGetWearCounters(fleet.primaryDeviceId),
      safeGetCollectionDocs('flushEvents', 'timestamp', 500, windowTimeRange),
      safeGetCollectionDocs('uvCycles', 'timestamp', 500, windowTimeRange),
      safeGetCollectionDocs('lidEvents', 'timestamp', 500, windowTimeRange),
      includeCampusRisk
        ? safeGetCollectionDocs('tasks', 'createdAt', 60)
        : Promise.resolve([]),
      includeCampusRisk
        ? safeGetCollectionDocs('issueReports', 'lastReportedAt', 50)
        : Promise.resolve([]),
      safeGetRecentUltrasonicSamples(fleet.primaryDeviceId, windowDates),
    ]);

    let flushDocs = initialFlushDocs;
    let uvDocs = initialUvDocs;
    let lidDocs = initialLidDocs;
    let ultrasonicSamples = initialUltrasonicSamples;
    let localUptimeDocs: Array<{
      deviceId: string;
      date: string;
      onlineMinutes: number;
      totalMinutes: number;
    }> = [];
    let usedLocalFallback = false;

    if (
      process.env.NODE_ENV !== 'test' &&
      isFirestoreQuotaCircuitOpen() &&
      (devices.length === 0 || (flushDocs.length === 0 && ultrasonicSamples.length === 0))
    ) {
      const local = await getCachedAnalyticsTelemetry();
      if (
        local.devices.length > 0 ||
        local.flushEvents.length > 0 ||
        local.readings.length > 0 ||
        local.uptimeDaily.length > 0
      ) {
        usedLocalFallback = true;
        if (devices.length === 0 && local.devices.length > 0) {
          devices = local.devices.map((d) => ({
            id: d.id,
            name: d.name,
            status: d.status,
            lastSeen: d.lastSeenMs,
          }));
          fleet = computeFleetSnapshot(devices, requestedDeviceId, fiveMinAgoMillis);
          periodUptimePercent = fleet.liveSnapshotPercent;
        }
        if ((uptimeSnap?.docs?.length ?? 0) === 0 && local.uptimeDaily.length > 0) {
          localUptimeDocs = local.uptimeDaily.filter(
            (u) => u.date >= windowFrom && u.date <= windowTo,
          );
        }

        if (flushDocs.length === 0) {
          flushDocs = local.flushEvents.map((e) => ({
            id: e.id,
            deviceId: e.deviceId,
            waterVolume: e.waterVolume,
            duration: e.duration,
            timestamp: e.timestampMs,
          }));
        }
        if (uvDocs.length === 0) {
          uvDocs = local.uvCycles.map((e) => ({
            id: e.id,
            deviceId: e.deviceId,
            duration: e.duration,
            completed: e.completed,
            reason: e.reason ?? null,
            timestamp: e.timestampMs,
          }));
        }
        if (lidDocs.length === 0) {
          lidDocs = local.lidEvents.map((e) => ({
            id: e.id,
            deviceId: e.deviceId,
            status: e.status,
            timestamp: e.timestampMs,
          }));
        }
        if (ultrasonicSamples.length === 0) {
          ultrasonicSamples = local.readings
            .filter(
              (r) =>
                r.deviceId === fleet.primaryDeviceId &&
                r.sensorType === 'ultrasonic',
            )
            .map((r) => ({
              value: r.value,
              timestampMs: r.timestamp.seconds * 1000,
            }))
            .sort((a, b) => (a.timestampMs ?? 0) - (b.timestampMs ?? 0))
            .slice(-40);
        }
      }
    }

    const dailyBucketMap = new Map<
      string,
      { flushCount: number; waterLiters: number }
    >();
    for (const date of windowDates) {
      dailyBucketMap.set(date, { flushCount: 0, waterLiters: 0 });
    }

    const activeTelemetryDates = new Set<string>();
    let observedFlushes = 0;
    let observedWaterLiters = 0;
    let cumulativeFlushCount = 0;
    let cumulativeFlushLiters = 0;
    const flushSamples: FlushSample[] = [];

    for (const doc of flushDocs) {
      const docDeviceId =
        typeof doc.deviceId === 'string' ? doc.deviceId.trim() : '';
      if (requestedDeviceId && docDeviceId && docDeviceId !== requestedDeviceId) {
        continue;
      }

      const ts = toMillisSafe(doc.timestamp);
      const waterVolume =
        typeof doc.waterVolume === 'number' && Number.isFinite(doc.waterVolume)
          ? Math.max(0, doc.waterVolume)
          : 0;
      const duration =
        typeof doc.duration === 'number' && Number.isFinite(doc.duration)
          ? doc.duration
          : 0;

      cumulativeFlushCount += 1;
      cumulativeFlushLiters += waterVolume;

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
          activeTelemetryDates.add(phtDate);
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
      const docDeviceId =
        typeof doc.deviceId === 'string' ? doc.deviceId.trim() : '';
      if (requestedDeviceId && docDeviceId && docDeviceId !== requestedDeviceId) {
        continue;
      }

      const ts = toMillisSafe(doc.timestamp);
      const duration =
        typeof doc.duration === 'number' && Number.isFinite(doc.duration)
          ? Math.max(0, doc.duration)
          : 0;
      if (ts !== null) {
        const phtDate = toPhtIsoDate(ts);
        if (phtDate >= windowFrom && phtDate <= windowTo) {
          activeTelemetryDates.add(phtDate);
          observedUvSeconds += duration;
        }
      }
    }

    let observedLidCycles = 0;
    for (const doc of lidDocs) {
      const docDeviceId =
        typeof doc.deviceId === 'string' ? doc.deviceId.trim() : '';
      if (requestedDeviceId && docDeviceId && docDeviceId !== requestedDeviceId) {
        continue;
      }

      const ts = toMillisSafe(doc.timestamp);
      if (ts !== null) {
        const phtDate = toPhtIsoDate(ts);
        if (phtDate >= windowFrom && phtDate <= windowTo) {
          activeTelemetryDates.add(phtDate);
          if (doc.status === undefined || doc.status === 'open') {
            observedLidCycles += 1;
          }
        }
      }
    }

    const dayMap = new Map<string, { onlineMinutes: number; totalMinutes: number }>();
    const rawUptimeEntries: Array<Record<string, unknown>> = [
      ...(uptimeSnap?.docs ?? []).map((doc) => doc.data()),
      ...localUptimeDocs,
    ];
    for (const data of rawUptimeEntries) {
      const docDeviceId =
        typeof data.deviceId === 'string' ? data.deviceId.trim() : '';
      if (
        docDeviceId &&
        fleet.scopedDeviceIds.size > 0 &&
        !fleet.scopedDeviceIds.has(docDeviceId)
      ) {
        continue;
      }
      const date = typeof data.date === 'string' ? data.date : '';
      if (!date) continue;
      const existing = dayMap.get(date) ?? { onlineMinutes: 0, totalMinutes: 0 };
      existing.onlineMinutes += Number(data.onlineMinutes ?? 0);
      existing.totalMinutes += Number(data.totalMinutes ?? 0);
      dayMap.set(date, existing);
    }

    let totalOnlineMinutes = 0;
    let totalTrackedMinutes = 0;
    let monitoredDays = 0;
    let activeTelemetryDays = 0;

    const uptimeLogs: Array<{
      date: string;
      uptimePercent: number | null;
      onlineMinutes: number;
      totalMinutes: number;
      offlineMinutes: number;
      status: 'tracked' | 'active_only' | 'unmonitored';
    }> = windowDates.map((date) => {
      const entry = dayMap.get(date);
      if (entry && entry.totalMinutes > 0) {
        const online = Math.max(0, Math.round(entry.onlineMinutes));
        const total = Math.max(online, Math.round(entry.totalMinutes));
        const offline = Math.max(0, total - online);
        totalOnlineMinutes += online;
        totalTrackedMinutes += total;
        monitoredDays += 1;
        activeTelemetryDays += 1;
        const dayPct = Math.min(
          100,
          Math.max(0, Math.round((online / total) * 1000) / 10),
        );
        return {
          date,
          uptimePercent: dayPct,
          onlineMinutes: online,
          totalMinutes: total,
          offlineMinutes: offline,
          status: 'tracked',
        };
      }

      const hasLiveToday =
        date === todayPht &&
        (activeTelemetryDates.has(date) || fleet.liveSnapshotPercent > 0);
      if (hasLiveToday || activeTelemetryDates.has(date)) {
        activeTelemetryDays += 1;
        return {
          date,
          uptimePercent: 100,
          onlineMinutes: 0,
          totalMinutes: 0,
          offlineMinutes: 0,
          status: 'active_only',
        };
      }

      return {
        date,
        uptimePercent: null,
        onlineMinutes: 0,
        totalMinutes: 0,
        offlineMinutes: 0,
        status: 'unmonitored',
      };
    });

    if (from && to && uptimeSnap) {
      const allDates = enumerateIsoDateRange(from, to);

      let totalOnline = 0;
      let totalTracked = 0;

      dailyList = allDates.map((date) => {
        const entry = dayMap.get(date);
        if (entry && entry.totalMinutes > 0) {
          totalOnline += entry.onlineMinutes;
          totalTracked += entry.totalMinutes;
          const dayPct = Math.min(
            100,
            Math.max(
              0,
              Math.round((entry.onlineMinutes / entry.totalMinutes) * 1000) / 10,
            ),
          );
          return { date, uptimePercent: dayPct };
        }

        // For dates where minute tracking has not accumulated:
        if (date === todayPht) {
          const todayFallback =
            activeTelemetryDates.has(date) && fleet.liveSnapshotPercent === 0
              ? 100
              : fleet.liveSnapshotPercent;
          return { date, uptimePercent: todayFallback };
        }

        const pastFallback = activeTelemetryDates.has(date) ? 100 : 0;
        return { date, uptimePercent: pastFallback };
      });

      if (totalTracked > 0) {
        uptimeSource = 'tracked';
        periodUptimePercent = Math.min(
          100,
          Math.max(0, Math.round((totalOnline / totalTracked) * 1000) / 10),
        );
      } else if (activeTelemetryDates.size > 0 && dailyList.length > 0) {
        uptimeSource = 'telemetry_fallback';
        const sumDaily = dailyList.reduce((sum, d) => sum + d.uptimePercent, 0);
        periodUptimePercent =
          Math.round((sumDaily / dailyList.length) * 10) / 10;
      }
    }

    const trackedAvailabilityPercent =
      totalTrackedMinutes > 0
        ? Math.min(
            100,
            Math.max(
              0,
              Math.round((totalOnlineMinutes / totalTrackedMinutes) * 1000) / 10,
            ),
          )
        : null;
    const uptimeSummary = {
      source: uptimeSource,
      trackedAvailabilityPercent,
      totalOnlineMinutes,
      totalTrackedMinutes,
      totalOfflineMinutes: Math.max(0, totalTrackedMinutes - totalOnlineMinutes),
      monitoredDays,
      activeTelemetryDays,
      unmonitoredDays: Math.max(0, windowDates.length - activeTelemetryDays),
      windowDays: windowDates.length,
    };

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

    const existingFlowCounter = Number(rawWearCounters?.flowSensorTotalLiters ?? 0);
    const existingPumpCounter = Number(rawWearCounters?.pumpTotalLiters ?? 0);
    const existingFlushCounter = Number(rawWearCounters?.flushCycleCount ?? 0);
    const effectiveWearCounters: Record<string, unknown> | null =
      rawWearCounters || cumulativeFlushLiters > 0 || cumulativeFlushCount > 0
        ? {
            ...(rawWearCounters ?? {}),
            flowSensorTotalLiters:
              Number.isFinite(existingFlowCounter) && existingFlowCounter > 0
                ? existingFlowCounter
                : cumulativeFlushLiters,
            pumpTotalLiters:
              Number.isFinite(existingPumpCounter) && existingPumpCounter > 0
                ? existingPumpCounter
                : cumulativeFlushLiters,
            flushCycleCount:
              Number.isFinite(existingFlushCounter) && existingFlushCounter > 0
                ? existingFlushCounter
                : cumulativeFlushCount,
          }
        : null;

    const predictiveMaintenance = buildPredictiveMaintenanceSummary({
      deviceId: fleet.primaryDeviceId,
      rawCounters: effectiveWearCounters,
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
        uptimeSource,
        liveSnapshotPercent: fleet.liveSnapshotPercent,
        onlineCount: fleet.onlineCount,
        totalCount: fleet.totalCount,
        daily: dailyList,
        uptimeLogs,
        uptimeSummary,
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

    if (isFirestoreQuotaCircuitOpen()) {
      const stale = usedLocalFallback
        ? null
        : getStaleRuntimeCachedValue<Record<string, unknown>>(cacheKey);
      if (stale) {
        return NextResponse.json({ ...stale, degraded: true });
      }
      return NextResponse.json({ ...payload, degraded: true });
    }

    setRuntimeCachedValue(cacheKey, payload, PERF_CACHE_TTL_MS);

    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof Response) return new NextResponse(error.body, error);
    if (isQuotaExceededError(error)) {
      markFirestoreQuotaExhausted();
    }
    console.error('[Analytics] system-performance error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch system performance' },
      { status: 500 },
    );
  }
}
