import { NextResponse } from 'next/server';
import { getUserRole, verifyAuthToken } from '@/lib/auth-helpers';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { resolveStaffOperationalStatus } from '@/lib/staff-workload';
import {
  getKnownMaintenanceAccountInfo,
  getRuntimeCachedValue,
  getStaleRuntimeCachedValue,
  isFirestoreQuotaCircuitOpen,
  isQuotaExceededError,
  markFirestoreQuotaExhausted,
  setRuntimeCachedValue,
} from '@/lib/local-runtime-cache';

const MAINTENANCE_PERSONNEL_CACHE_KEY = 'maintenance-personnel:all';
const MAINTENANCE_PERSONNEL_CACHE_TTL_MS = 30_000;

interface PersonnelItem {
  id: string;
  displayName: string;
  email: string | null;
  isAvailable: boolean;
  isOnline: boolean;
  status: string;
  isActive: boolean;
  currentTaskId: string | null;
  shift: string;
  building: string | null;
  supervisorUid: string | null;
  lastSeen: unknown;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

async function buildPersonnelFallbackFromAuth(): Promise<PersonnelItem[]> {
  const stale = getStaleRuntimeCachedValue<PersonnelItem[]>(
    MAINTENANCE_PERSONNEL_CACHE_KEY,
  );
  if (stale) {
    return stale;
  }

  if (typeof adminAuth.listUsers !== 'function') {
    return [];
  }

  try {
    const listResult = await adminAuth.listUsers(100);
    return listResult.users
      .map((authUser): PersonnelItem | null => {
        const email = stringOrNull(authUser.email);
        const knownMaintenance = getKnownMaintenanceAccountInfo(email);
        const claimRole =
          typeof authUser.customClaims?.role === 'string'
            ? authUser.customClaims.role.toLowerCase()
            : null;
        const isMaintenanceRole =
          claimRole === 'maintenance' ||
          claimRole === 'technician' ||
          knownMaintenance !== null;

        if (!isMaintenanceRole) {
          return null;
        }

        const displayName =
          stringOrNull(authUser.displayName) ??
          knownMaintenance?.displayName ??
          email ??
          authUser.uid;

        return {
          id: authUser.uid,
          displayName,
          email,
          isAvailable: false,
          isOnline: false,
          status: 'offline',
          isActive: !authUser.disabled,
          currentTaskId: null,
          shift: '1st',
          building: null,
          supervisorUid: null,
          lastSeen: null,
        };
      })
      .filter((member): member is PersonnelItem => member !== null)
      .sort((first, second) =>
        first.displayName.localeCompare(second.displayName),
      );
  } catch (fallbackError) {
    console.warn('[MaintenancePersonnel] Auth fallback failed:', fallbackError);
    return [];
  }
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const user = await verifyAuthToken(request);
    const role = await getUserRole(user);

    if (
      role !== 'admin' &&
      role !== 'supervisor' &&
      role !== 'maintenance' &&
      role !== 'technician'
    ) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 },
      );
    }

    const cached = getRuntimeCachedValue<PersonnelItem[]>(
      MAINTENANCE_PERSONNEL_CACHE_KEY,
    );
    if (cached) {
      return NextResponse.json({ success: true, data: cached });
    }

    if (isFirestoreQuotaCircuitOpen()) {
      const fallback = await buildPersonnelFallbackFromAuth();
      return NextResponse.json({
        success: true,
        data: fallback,
        degraded: true,
      });
    }

    const usersQuery = adminDb
      .collection('users')
      .where('role', 'in', ['maintenance', 'technician']);
    const tasksQuery = adminDb
      .collection('tasks')
      .where('status', 'in', [
        'unassigned',
        'assigned',
        'acknowledged',
        'pending',
        'rechecking',
        'flagged',
        'reassignment_needed',
      ]);

    const [usersSnapshot, activeTasksSnapshot] = await Promise.all([
      typeof usersQuery.limit === 'function' ? usersQuery.limit(200).get() : usersQuery.get(),
      (typeof tasksQuery.limit === 'function' ? tasksQuery.limit(100).get() : tasksQuery.get()).catch(
        (taskError) => {
          if (isQuotaExceededError(taskError)) {
            markFirestoreQuotaExhausted();
          }
          return { docs: [] };
        },
      ),
    ]);

    const activeTasks = activeTasksSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    const personnel: PersonnelItem[] = usersSnapshot.docs
      .map((doc) => {
        const data = doc.data();
        const email = stringOrNull(data.email);
        const displayName =
          stringOrNull(data.displayName) ??
          stringOrNull(data.name) ??
          email ??
          doc.id;
        const operationalStatus = resolveStaffOperationalStatus(
          { id: doc.id, uid: doc.id, email, ...data },
          activeTasks,
        );

        return {
          id: doc.id,
          displayName,
          email,
          isAvailable: operationalStatus.isAvailable,
          isOnline: operationalStatus.isOnline,
          status: operationalStatus.status,
          isActive: data.active !== false && data.isActive !== false,
          currentTaskId: operationalStatus.currentTaskId,
          shift: stringOrNull(data.shift) ?? '1st',
          building: stringOrNull(data.building) ?? null,
          supervisorUid: stringOrNull(data.supervisorUid) ?? null,
          lastSeen:
            typeof data.lastSeen?.toDate === 'function'
              ? data.lastSeen.toDate().toISOString()
              : data.lastSeen instanceof Date
                ? data.lastSeen.toISOString()
                : data.lastSeen ?? null,
        };
      })
      .sort((first, second) =>
        first.displayName.localeCompare(second.displayName),
      );

    setRuntimeCachedValue(
      MAINTENANCE_PERSONNEL_CACHE_KEY,
      personnel,
      MAINTENANCE_PERSONNEL_CACHE_TTL_MS,
    );

    return NextResponse.json({ success: true, data: personnel });
  } catch (error) {
    if (error instanceof Response) {
      return new NextResponse(error.body, error);
    }

    if (isQuotaExceededError(error)) {
      markFirestoreQuotaExhausted();
      console.warn(
        '[MaintenancePersonnel] Firestore quota exceeded; serving Auth fallback',
      );
      const fallback = await buildPersonnelFallbackFromAuth();
      return NextResponse.json({
        success: true,
        data: fallback,
        degraded: true,
      });
    }

    console.error('[MaintenancePersonnel] GET error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch maintenance personnel' },
      { status: 500 },
    );
  }
}
